import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../config/env.js';
import { openDatabase } from '../database/db.js';
import { createApp } from '../app.js';
import { parseReviewsCsv } from '../services/csvParser.js';
import { csvCell, reviewsToCsv } from '../services/exportService.js';
import { parseThemesResponse } from '../services/themeService.js';
import { createFallbackProvider } from '../services/llm/fallbackProvider.js';
import { LlmTransientError } from '../services/llm/errors.js';
import { looseKey, similarityRatio } from '../utils/similarity.js';
import { createFakeLlm, defaultRespond } from './fakeLlm.js';

const CSV = fs.readFileSync(path.join(REPO_ROOT, 'reviews.csv'));
const silentLogger = { error() {}, warn() {}, log() {} };
const baseConfig = { batchSize: 5, maxUploadBytes: 1024 * 1024, maxCsvRows: 1000, corsOrigins: [] };

function setup({ llm = createFakeLlm(), db = openDatabase(':memory:'), ...config } = {}) {
  const { app, queue, recoverInterruptedWork } = createApp({ db, llm, config: { ...baseConfig, ...config }, logger: silentLogger });
  return { app, queue, recoverInterruptedWork, llm, db };
}

async function upload(ctx, buffer = CSV, filename = 'reviews.csv') {
  const res = await request(ctx.app).post('/api/datasets').attach('file', buffer, filename);
  expect(res.status).toBe(202);
  return res.body.data.dataset.id;
}

const allReviews = async (ctx, id) => (await request(ctx.app).get(`/api/datasets/${id}/reviews?limit=100`)).body.data.items;
const csvOf = (rows) => Buffer.from(['review_id,product,rating,date,review_text', ...rows].join('\n'));

// ---------------------------------------------------------------------------
describe('model provenance and per-model usage', () => {
  it('records the model that produced each analysis, incl. the fallback', async () => {
    const primary = createFakeLlm({
      respond: (req, i) => {
        if (i === 1) throw new LlmTransientError('HTTP 503'); // 2nd batch fails on the primary
        return defaultRespond(req);
      },
    });
    primary.modelName = 'primary-model';
    const fallback = createFakeLlm();
    fallback.modelName = 'fallback-model';
    const llm = createFallbackProvider(primary, fallback, { cooldownMs: 0, logger: silentLogger });

    const ctx = setup({ llm, autoThemes: false });
    const id = await upload(ctx);
    await ctx.queue.onIdle();

    const reviews = await allReviews(ctx, id);
    const models = new Set(reviews.filter((r) => r.analysisSource === 'ai').map((r) => r.analysisModel));
    expect(models).toEqual(new Set(['primary-model', 'fallback-model']));
    // Exactly one batch (5 unique reviews) was answered by the fallback.
    expect(reviews.filter((r) => r.analysisSource === 'ai' && r.analysisModel === 'fallback-model')).toHaveLength(5);
    // Duplicates inherit the canonical row's model.
    const r015 = reviews.find((r) => r.reviewId === 'R015');
    expect(r015.analysisModel).toBe(reviews.find((r) => r.reviewId === 'R012').analysisModel);

    const usage = (await request(ctx.app).get(`/api/datasets/${id}/dashboard`)).body.data.usage;
    expect(usage.byModel).toEqual(
      expect.arrayContaining([
        { model: 'primary-model', purpose: 'analysis', calls: 6 },
        { model: 'fallback-model', purpose: 'analysis', calls: 1 },
      ]),
    );
  });

  it('keeps the original model on cache hits', async () => {
    const db = openDatabase(':memory:');
    const first = setup({ db, autoThemes: false });
    await upload(first);
    await first.queue.onIdle();

    const second = setup({ db, autoThemes: false });
    const id = await upload(second);
    await second.queue.onIdle();
    const reviews = await allReviews(second, id);
    const cached = reviews.filter((r) => r.analysisSource === 'cache');
    expect(cached.length).toBe(28);
    expect(cached.every((r) => r.analysisModel === 'fake-model')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('graceful shutdown', () => {
  it('finishes the batch in flight, pauses the dataset and resumes it on the next start', async () => {
    const db = openDatabase(':memory:');
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const llm = createFakeLlm({
      respond: async (req, i) => {
        if (i === 0) await gate;
        return defaultRespond(req);
      },
    });
    const ctx = setup({ db, llm, autoThemes: false });
    const id = await upload(ctx);
    while (llm.calls.length === 0) await new Promise((r) => setTimeout(r, 5));

    const stopped = ctx.queue.shutdown({ timeoutMs: 5000 });
    release();
    await expect(stopped).resolves.toBe(true);

    let status = (await request(ctx.app).get(`/api/datasets/${id}/status`)).body.data;
    expect(status.status).toBe('queued');
    expect(status.counts.analysed).toBe(5); // the in-flight batch was saved
    expect(llm.calls.length).toBe(1); // ...and no new batch started

    // "Restart": a new app on the same database resumes and only analyses the rest.
    const llm2 = createFakeLlm();
    const restarted = setup({ db, llm: llm2, autoThemes: false });
    restarted.recoverInterruptedWork();
    await new Promise((r) => setImmediate(r));
    await restarted.queue.onIdle();
    status = (await request(restarted.app).get(`/api/datasets/${id}/status`)).body.data;
    expect(status.status).toBe('completed');
    expect(status.counts.analysed).toBe(28);
    expect(llm2.calls.length).toBe(5); // 23 remaining reviews = 5 batches
  });

  it('times out instead of hanging when a batch never finishes', async () => {
    const llm = createFakeLlm({ respond: () => new Promise(() => {}) });
    const ctx = setup({ llm, autoThemes: false });
    await upload(ctx);
    while (llm.calls.length === 0) await new Promise((r) => setTimeout(r, 5));
    await expect(ctx.queue.shutdown({ timeoutMs: 50 })).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('editable replies', () => {
  it('saves an edited reply, marks it as edited and keeps it on reload', async () => {
    const ctx = setup({ autoThemes: false });
    const id = await upload(ctx);
    await ctx.queue.onIdle();
    const target = (await allReviews(ctx, id)).find((r) => r.needsReply);

    const generated = await request(ctx.app).post(`/api/reviews/${target.id}/reply`).send({});
    expect(generated.body.data.edited).toBe(false);

    const saved = await request(ctx.app).put(`/api/reviews/${target.id}/reply`).send({ reply: '  Thanks, we will call you today.  ' });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ reply: 'Thanks, we will call you today.', edited: true });

    const reloaded = (await allReviews(ctx, id)).find((r) => r.id === target.id);
    expect(reloaded.suggestedReply).toBe('Thanks, we will call you today.');
    expect(reloaded.replyEdited).toBe(true);

    // Asking for the reply again returns the edited text, not a new AI reply.
    const again = await request(ctx.app).post(`/api/reviews/${target.id}/reply`).send({});
    expect(again.body.data).toMatchObject({ reply: 'Thanks, we will call you today.', reused: true, edited: true });
  });

  it('rejects empty edits and reviews that do not need a reply', async () => {
    const ctx = setup({ autoThemes: false });
    const id = await upload(ctx);
    await ctx.queue.onIdle();
    const reviews = await allReviews(ctx, id);
    const needs = reviews.find((r) => r.needsReply);
    const noNeed = reviews.find((r) => r.status === 'analysed' && !r.needsReply);

    expect((await request(ctx.app).put(`/api/reviews/${needs.id}/reply`).send({ reply: '   ' })).status).toBe(400);
    expect((await request(ctx.app).put(`/api/reviews/${noNeed.id}/reply`).send({ reply: 'Hi' })).status).toBe(409);
    expect((await request(ctx.app).put(`/api/reviews/${needs.id}/reply`).send({ reply: 'x', extra: 1 })).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('CSV export', () => {
  it('neutralises spreadsheet formulas and quotes every cell', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('Fine, thanks')).toBe('"Fine, thanks"');
    expect(csvCell(null)).toBe('');
  });

  it('exports every row with analysis, model and flags as a download', async () => {
    const ctx = setup({ autoThemes: false });
    const id = await upload(ctx);
    await ctx.queue.onIdle();

    const res = await request(ctx.app).get(`/api/datasets/${id}/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="reviews-analysis.csv"');

    const parsed = parseReviewsCsv(Buffer.from(res.text), { maxRows: 1000 }); // header check only
    expect(parsed.rows.length).toBe(30);
    const lines = res.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toContain('analysis_model');
    expect(lines.find((l) => l.startsWith('"R015"'))).toContain('"duplicate"');
    expect(lines).toHaveLength(31);
  });

  it('builds the same CSV from DTOs (unit)', () => {
    const csv = reviewsToCsv([]);
    expect(csv.startsWith('﻿review_id,product,')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('AI themes', () => {
  it('are generated after processing, stored, and reference real reviews only', async () => {
    const ctx = setup();
    const id = await upload(ctx);
    await ctx.queue.onIdle();

    const res = await request(ctx.app).get(`/api/datasets/${id}/themes`);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.model).toBe('fake-model');
    const { complaints, praises } = res.body.data.themes;
    expect(complaints.length).toBeGreaterThan(0);
    expect(praises.length).toBeGreaterThan(0);
    const ids = new Set((await allReviews(ctx, id)).map((r) => r.reviewId));
    for (const theme of [...complaints, ...praises]) {
      expect(theme.count).toBe(theme.reviewIds.length);
      theme.reviewIds.forEach((rid) => expect(ids.has(rid)).toBe(true));
    }
    // Duplicates are not counted twice: R015 never appears, R012 does.
    expect(complaints.flatMap((t) => t.reviewIds)).not.toContain('R015');

    const usage = (await request(ctx.app).get(`/api/datasets/${id}/dashboard`)).body.data.usage;
    expect(usage.byModel).toEqual(expect.arrayContaining([{ model: 'fake-model', purpose: 'themes', calls: 1 }]));
  });

  it('drops unknown refs and empty themes; rejects malformed answers', () => {
    const complaintsByRef = new Map([['c1', { reviewId: 'R1', product: 'Mug', summary: 'Handle broke.' }]]);
    const praisesByRef = new Map();
    const raw = JSON.stringify({
      complaints: [
        { theme: 'Handles break', refs: ['c1', 'c99'] },
        { theme: 'Ghost theme', refs: ['c42'] },
      ],
      praises: [],
    });
    const result = parseThemesResponse(raw, { complaintsByRef, praisesByRef });
    expect(result.complaints).toHaveLength(1);
    expect(result.complaints[0]).toMatchObject({ theme: 'Handles break', count: 1, reviewIds: ['R1'] });

    expect(parseThemesResponse('not json', { complaintsByRef, praisesByRef })).toBeNull();
    expect(parseThemesResponse(JSON.stringify({ complaints: [], praises: [], extra: 1 }), { complaintsByRef, praisesByRef })).toBeNull();
  });

  it('can be regenerated on demand, and refuses while the dataset is processing', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const llm = createFakeLlm({
      respond: async (req, i) => {
        if (i === 0) await gate;
        return defaultRespond(req);
      },
    });
    const ctx = setup({ llm });
    const id = await upload(ctx);
    while (llm.calls.length === 0) await new Promise((r) => setTimeout(r, 5));
    expect((await request(ctx.app).post(`/api/datasets/${id}/themes`).send({})).status).toBe(409);
    release();
    await ctx.queue.onIdle();

    const res = await request(ctx.app).post(`/api/datasets/${id}/themes`).send({});
    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe('generating');
    let status = 'generating';
    for (let i = 0; i < 50 && status === 'generating'; i++) {
      await new Promise((r) => setTimeout(r, 10));
      status = (await request(ctx.app).get(`/api/datasets/${id}/themes`)).body.data.status;
    }
    expect(status).toBe('ready');
  });

  it('stores a failure (not a crash) when the AI keeps returning junk', async () => {
    const llm = createFakeLlm({
      respond: (req) => (JSON.parse(req.user).complaints ? '{"complaints": "nope"}' : defaultRespond(req)),
    });
    const ctx = setup({ llm });
    const id = await upload(ctx);
    await ctx.queue.onIdle();
    const themes = (await request(ctx.app).get(`/api/datasets/${id}/themes`)).body.data;
    expect(themes.status).toBe('failed');
    expect(themes.errorMessage).toMatch(/invalid themes/);
    const status = (await request(ctx.app).get(`/api/datasets/${id}/status`)).body.data.status;
    expect(status).toBe('completed'); // themes never affect the dataset status
  });
});

// ---------------------------------------------------------------------------
describe('near-duplicate detection', () => {
  it('looseKey ignores case and punctuation but keeps emoji', () => {
    expect(looseKey('Great mug!')).toBe(looseKey('great   MUG'));
    expect(looseKey('Amazing speed 🙄')).not.toBe(looseKey('Amazing speed'));
    expect(similarityRatio('abcdef', 'abcdef')).toBe(1);
    expect(similarityRatio('kitten', 'sitting')).toBeCloseTo(1 - 3 / 7);
  });

  it('treats near-identical text as a duplicate and flags very similar reviews', () => {
    const { rows, stats } = parseReviewsCsv(
      csvOf([
        'A1,Mug,5,2026-10-01,Great mug',
        'A2,Mug,5,2026-10-01,"Great mug!"',
        'A3,Mug,1,2026-10-01,The handle came off after one week of use',
        'A4,Mug,1,2026-10-01,The handle came off after one weak of use!!',
        'A5,Mug,4,2026-10-01,Amazing speed',
        'A6,Mug,1,2026-10-01,Amazing speed 🙄',
        'A7,Plate,1,2026-10-01,The handle came off after one week of use',
      ]),
      { maxRows: 100 },
    );
    const byId = Object.fromEntries(rows.map((r) => [r.reviewId, r]));

    expect(byId.A2).toMatchObject({ isDuplicate: true, duplicateOfRow: 1 });
    expect(byId.A2.dataIssues).toContain('near_duplicate');

    // Typo + punctuation: not identical, but flagged as very similar and still analysed.
    expect(byId.A4.isDuplicate).toBe(false);
    expect(byId.A4.similarToRow).toBe(3);
    expect(byId.A4.similarity).toBeGreaterThanOrEqual(0.85);
    expect(byId.A4.dataIssues).toContain('possible_duplicate');

    // Emoji changes the meaning: never merged.
    expect(byId.A6.isDuplicate).toBe(false);

    // Same text for a different product is an exact duplicate (existing rule), not "similar".
    expect(byId.A7.isDuplicate).toBe(true);
    expect(byId.A7.dataIssues).not.toContain('near_duplicate');

    expect(stats.duplicateRows).toBe(2);
  });

  it('near-identical rows reuse one analysis and are exposed in the API', async () => {
    const ctx = setup({ autoThemes: false });
    const id = await upload(
      ctx,
      csvOf(['A1,Mug,5,2026-10-01,Great mug', 'A2,Mug,5,2026-10-01,"Great mug!"', 'A3,Mug,1,2026-10-01,The handle came off after one week', 'A4,Mug,1,2026-10-01,The handle came off after one weak']),
    );
    await ctx.queue.onIdle();
    const reviews = await allReviews(ctx, id);
    const a2 = reviews.find((r) => r.reviewId === 'A2');
    expect(a2).toMatchObject({ isDuplicate: true, duplicateOf: 'A1', analysisSource: 'duplicate' });
    const a4 = reviews.find((r) => r.reviewId === 'A4');
    expect(a4).toMatchObject({ similarTo: 'A3', isDuplicate: false, analysisSource: 'ai' });
    expect(ctx.llm.calls.length).toBe(1); // A1, A3, A4 in one batch; A2 reused A1

    const quality = (await request(ctx.app).get(`/api/datasets/${id}/dashboard`)).body.data.dataQuality;
    expect(quality).toMatchObject({ duplicates: 1, nearDuplicates: 1, possibleDuplicates: 1 });
  });
});
