import { createHash } from 'node:crypto';
import { z } from 'zod';
import { THEMES_PROMPT_VERSION, THEMES_SYSTEM_PROMPT, buildThemesUserMessage } from './analysis/prompts.js';
import { uniqueAnalysed } from './insights.js';
import { LlmNotConfiguredError } from './llm/errors.js';
import { HttpError } from '../utils/httpError.js';

const DEVANAGARI = /[ऀ-ॿ]/;
/** Upper bound of summaries sent per side, so one request stays small. */
export const MAX_ITEMS_PER_SIDE = 300;

const englishLine = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), 'must be a single line')
    .refine((s) => !DEVANAGARI.test(s), 'must be English');

const ThemeSchema = z
  .object({
    theme: englishLine(60),
    description: englishLine(200).optional(),
    refs: z.array(z.string()).min(1),
  })
  .strict();

export const ThemesResponseSchema = z
  .object({
    complaints: z.array(ThemeSchema).max(12),
    praises: z.array(ThemeSchema).max(12),
  })
  .strict();

function stripCodeFence(text) {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  return match ? match[1] : text;
}

/**
 * Validates the model's answer and maps refs back to real reviews.
 * Unknown refs are dropped; a theme left without any real review is dropped.
 * Returns { complaints, praises } or null when the answer is unusable.
 */
export function parseThemesResponse(raw, { complaintsByRef, praisesByRef }) {
  let json;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch {
    return null;
  }
  const parsed = ThemesResponseSchema.safeParse(json);
  if (!parsed.success) return null;

  const build = (themes, byRef) =>
    themes
      .map((t) => {
        const reviews = [...new Set(t.refs)].map((ref) => byRef.get(ref)).filter(Boolean);
        if (reviews.length === 0) return null;
        const productCounts = new Map();
        for (const r of reviews) productCounts.set(r.product, (productCounts.get(r.product) ?? 0) + 1);
        return {
          theme: t.theme,
          description: t.description ?? null,
          count: reviews.length,
          reviewIds: reviews.map((r) => r.reviewId),
          evidence: reviews.slice(0, 3).map((r) => ({ reviewId: r.reviewId, summary: r.summary })),
          products: [...productCounts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

  return { complaints: build(parsed.data.complaints, complaintsByRef), praises: build(parsed.data.praises, praisesByRef) };
}

/**
 * AI themes: a second LLM pass that groups the summaries of negative / positive
 * reviews into specific named themes ("Mug handles break") instead of the 7 fixed topics.
 *
 * Input is the already-validated one-line summaries (not the raw review text), sent as
 * JSON data with the same injection rules as the analysis prompt. The answer is
 * schema-validated, refs are mapped back to real reviews, and it is retried once.
 * Results are stored per dataset and only regenerated when the input changes.
 */
export function createThemeService({ reviews, themes, llm, usage, logger = console }) {
  function buildInput(datasetId) {
    const analysed = uniqueAnalysed(reviews.allForDataset(datasetId));
    const negative = analysed.filter((r) => r.sentiment === 'negative').slice(0, MAX_ITEMS_PER_SIDE);
    const positive = analysed.filter((r) => r.sentiment === 'positive').slice(0, MAX_ITEMS_PER_SIDE);
    const complaintsByRef = new Map(negative.map((r, i) => [`c${i + 1}`, r]));
    const praisesByRef = new Map(positive.map((r, i) => [`p${i + 1}`, r]));
    const toItems = (byRef) => [...byRef].map(([ref, r]) => ({ ref, product: r.product, summary: r.summary }));
    const payload = { complaints: toItems(complaintsByRef), praises: toItems(praisesByRef) };
    const inputHash = createHash('sha256')
      .update(`${THEMES_PROMPT_VERSION}|${JSON.stringify(payload)}`)
      .digest('hex');
    return { payload, complaintsByRef, praisesByRef, inputHash };
  }

  async function generate(datasetId, { force = false } = {}) {
    const input = buildInput(datasetId);
    const existing = themes.get(datasetId);
    if (!force && existing?.status === 'ready' && existing.inputHash === input.inputHash) return existing;

    if (input.payload.complaints.length === 0 && input.payload.praises.length === 0) {
      themes.save(datasetId, { status: 'ready', themes: { complaints: [], praises: [] }, inputHash: input.inputHash });
      return themes.get(datasetId);
    }
    if (!llm.isConfigured()) throw new LlmNotConfiguredError();

    themes.save(datasetId, { status: 'generating', themes: existing?.themes ?? null, inputHash: existing?.inputHash });
    const request = { system: THEMES_SYSTEM_PROMPT, user: buildThemesUserMessage(input.payload), json: true };

    let lastError = 'The AI returned invalid themes twice.';
    for (let attempt = 0; attempt < 2; attempt++) {
      let model = llm.modelName;
      let raw;
      try {
        raw = await llm.complete(request, {
          onAttempt: (info = {}) => {
            if (info.model) model = info.model;
            usage?.add(datasetId, model, 'themes');
          },
        });
      } catch (error) {
        lastError = `The AI provider could not generate themes: ${error.message}`.slice(0, 500);
        break;
      }
      const result = parseThemesResponse(raw, input);
      if (result) {
        themes.save(datasetId, { status: 'ready', themes: result, inputHash: input.inputHash, model });
        return themes.get(datasetId);
      }
      logger.warn?.(`[themes] invalid AI response for dataset ${datasetId} (attempt ${attempt + 1})`);
    }
    themes.save(datasetId, {
      status: 'failed',
      themes: existing?.themes ?? null,
      inputHash: existing?.inputHash ?? null,
      errorMessage: lastError,
    });
    return themes.get(datasetId);
  }

  return {
    generate,
    /** Background generation after a dataset finished; errors are stored, never thrown. */
    async generateQuietly(datasetId) {
      try {
        await generate(datasetId);
      } catch (error) {
        themes.save(datasetId, { status: 'failed', errorMessage: error.message.slice(0, 500) });
      }
    },
    /** Starts a regeneration requested from the UI without waiting for it. */
    regenerate(datasetId) {
      const current = themes.get(datasetId);
      if (current?.status === 'generating') throw new HttpError(409, 'THEMES_BUSY', 'Themes are already being generated.');
      if (!llm.isConfigured()) {
        throw new HttpError(503, 'LLM_NOT_CONFIGURED', 'The AI provider is not configured on the server. See .env.example.');
      }
      themes.save(datasetId, { status: 'generating', themes: current?.themes ?? null, inputHash: current?.inputHash ?? null });
      void generate(datasetId, { force: true }).catch((error) =>
        themes.save(datasetId, { status: 'failed', themes: current?.themes ?? null, errorMessage: error.message.slice(0, 500) }),
      );
      return themes.get(datasetId);
    },
    get: (datasetId) => themes.get(datasetId),
  };
}
