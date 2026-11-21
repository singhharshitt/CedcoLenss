import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../config/env.js';
import { openDatabase } from '../database/db.js';
import { createApp } from '../app.js';
import { createFakeLlm, defaultRespond } from './fakeLlm.js';

const CSV = fs.readFileSync(path.join(REPO_ROOT, 'reviews.csv'));
const silentLogger = { error() {}, warn() {}, log() {} };
const testConfig = {
  batchSize: 5,
  maxUploadBytes: 1024 * 1024,
  maxCsvRows: 1000,
  corsOrigins: ['http://localhost:5173'],
  autoThemes: false,
};

function setup(llm = createFakeLlm(), configOverrides = {}) {
  const db = openDatabase(':memory:');
  const { app, queue } = createApp({ db, llm, config: { ...testConfig, ...configOverrides }, logger: silentLogger });
  return { app, queue, llm, db };
}

async function uploadAndWait(ctx, buffer = CSV, filename = 'reviews.csv') {
  const res = await request(ctx.app).post('/api/datasets').attach('file', buffer, filename);
  expect(res.status).toBe(202);
  await ctx.queue.onIdle();
  return res.body.data.dataset.id;
}

const reviewsOf = async (ctx, id, query = '') =>
  (await request(ctx.app).get(`/api/datasets/${id}/reviews?limit=100${query}`)).body.data;

describe('upload -> analysis -> dashboard', () => {
  let ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('processes the assessment CSV in batches of 5 and reports real progress', async () => {
    const id = await uploadAndWait(ctx);
    const status = (await request(ctx.app).get(`/api/datasets/${id}/status`)).body.data;

    expect(status.status).toBe('completed');
    expect(status.counts).toMatchObject({
      totalRows: 30,
      skippedRows: 1,
      duplicateRows: 1,
      uniqueReviews: 28,
      sentToAi: 28,
      analysed: 28,
      failed: 0,
      cacheHits: 0,
      aiCalls: 6, // ceil(28 / 5) batches, no simultaneous per-review calls
    });
    expect(status.progress.percentage).toBe(100);
    for (const call of ctx.llm.calls) expect(JSON.parse(call.user).reviews.length).toBeLessThanOrEqual(5);
  });

  it('R015 reuses R012 analysis and duplicate text is sent to the AI only once', async () => {
    const id = await uploadAndWait(ctx);
    const { items } = await reviewsOf(ctx, id, '&search=left%20earbud');
    const r012 = items.find((r) => r.reviewId === 'R012');
    const r015 = items.find((r) => r.reviewId === 'R015');
    expect(r015).toMatchObject({ isDuplicate: true, duplicateOf: 'R012', analysisSource: 'duplicate' });
    expect(r015.sentiment).toBe(r012.sentiment);

    const sentTexts = ctx.llm.calls.flatMap((c) => JSON.parse(c.user).reviews.map((r) => r.text));
    expect(sentTexts.filter((t) => t.includes('left earbud'))).toHaveLength(1);
    expect(sentTexts).not.toContain(''); // R005 (empty) never reaches the AI
  });

  it('re-uploading the same file is served from the cache with zero AI calls', async () => {
    await uploadAndWait(ctx);
    const callsAfterFirst = ctx.llm.calls.length;
    const secondId = await uploadAndWait(ctx);
    const status = (await request(ctx.app).get(`/api/datasets/${secondId}/status`)).body.data;
    expect(ctx.llm.calls.length).toBe(callsAfterFirst);
    expect(status.counts).toMatchObject({ cacheHits: 28, aiCalls: 0, sentToAi: 0, analysed: 28 });
  });

  it('does not reuse cache entries produced by a different model', async () => {
    await uploadAndWait(ctx);
    const other = createApp({ db: ctx.db, llm: createFakeLlm(), config: testConfig, logger: silentLogger });
    const better = createFakeLlm();
    better.modelName = 'better-model';
    const betterApp = createApp({ db: ctx.db, llm: better, config: testConfig, logger: silentLogger });

    // Same model: served from cache.
    const sameId = await uploadAndWait(other);
    expect((await request(other.app).get(`/api/datasets/${sameId}/status`)).body.data.counts.cacheHits).toBe(28);
    // Different model: analysed again.
    const newId = await uploadAndWait(betterApp);
    const status = (await request(betterApp.app).get(`/api/datasets/${newId}/status`)).body.data;
    expect(status.counts).toMatchObject({ cacheHits: 0, sentToAi: 28 });
    expect(better.calls.length).toBe(6);
  });

  it('dashboard counts unique analysed reviews and computes rating agreement without null ratings', async () => {
    const id = await uploadAndWait(ctx);
    const dash = (await request(ctx.app).get(`/api/datasets/${id}/dashboard`)).body.data;
    const { summary, ratingAgreement } = dash;

    expect(summary.analysedReviews).toBe(28); // 30 rows - 1 empty - 1 duplicate
    expect(summary.positive.count + summary.neutral.count + summary.negative.count).toBe(28);
    expect(ratingAgreement.eligible).toBe(26); // R010 (missing) and R022 ("five") excluded
    expect(ratingAgreement.mismatchReviews.map((r) => r.reviewId)).toContain('R008');
    expect(dash.topComplaints.length).toBeLessThanOrEqual(3);
    expect(dash.topComplaints[0].count).toBeGreaterThan(0);
    expect(dash.dataQuality).toMatchObject({ emptyReviews: 1, missingRating: 1, invalidRating: 1, duplicates: 1 });
  });

  it('filters reviews by product, sentiment and topic with pagination', async () => {
    const id = await uploadAndWait(ctx);
    const byProduct = await reviewsOf(ctx, id, '&product=Running%20Shoes%20Pro');
    expect(byProduct.total).toBe(6);
    expect(byProduct.products).toContain('Bamboo Desk Organizer');

    const negative = await reviewsOf(ctx, id, '&sentiment=negative');
    expect(negative.items.every((r) => r.sentiment === 'negative')).toBe(true);

    const delivery = await reviewsOf(ctx, id, '&topic=delivery');
    expect(delivery.items.length).toBeGreaterThan(0);
    expect(delivery.items.every((r) => r.topics.includes('delivery'))).toBe(true);

    const page2 = (await request(ctx.app).get(`/api/datasets/${id}/reviews?limit=10&page=2`)).body.data;
    expect(page2).toMatchObject({ page: 2, total: 30, totalPages: 3 });
    expect(page2.items[0].reviewId).toBe('R011');

    const bad = await request(ctx.app).get(`/api/datasets/${id}/reviews?sentiment=angry`);
    expect(bad.status).toBe(400);
  });

  it('product analytics returns per-product sentiment split', async () => {
    const id = await uploadAndWait(ctx);
    const list = (await request(ctx.app).get(`/api/datasets/${id}/products`)).body.data;
    expect(list.map((p) => p.name)).toHaveLength(5);
    const mug = list.find((p) => p.name.startsWith('Ceramic'));
    const detail = (await request(ctx.app).get(`/api/datasets/${id}/products/${mug.id}`)).body.data;
    expect(detail.name).toBe('Ceramic Coffee Mug (Set of 2)');
    expect(detail.totalRows).toBe(6);
    expect((await request(ctx.app).get(`/api/datasets/${id}/products/nope`)).status).toBe(404);
  });
});

describe('suggested replies', () => {
  it('generates a reply only on request, then reuses it', async () => {
    const ctx = setup();
    const id = await uploadAndWait(ctx);
    const callsBefore = ctx.llm.calls.length;
    const { items } = await reviewsOf(ctx, id, '&needsReply=true');
    expect(items.every((r) => r.suggestedReply === null)).toBe(true); // nothing generated upfront

    const first = await request(ctx.app).post(`/api/reviews/${items[0].id}/reply`).send({});
    expect(first.status).toBe(200);
    expect(first.body.data.reused).toBe(false);
    expect(first.body.data.reply.length).toBeGreaterThan(20);
    expect(ctx.llm.calls.length).toBe(callsBefore + 1);

    const again = await request(ctx.app).post(`/api/reviews/${items[0].id}/reply`).send({});
    expect(again.body.data).toMatchObject({ reused: true, reply: first.body.data.reply });
    expect(ctx.llm.calls.length).toBe(callsBefore + 1);
  });

  it('refuses reviews that do not need a reply and unknown reviews', async () => {
    const ctx = setup();
    const id = await uploadAndWait(ctx);
    const { items } = await reviewsOf(ctx, id, '&needsReply=false');
    expect((await request(ctx.app).post(`/api/reviews/${items[0].id}/reply`).send({})).status).toBe(409);
    expect((await request(ctx.app).post('/api/reviews/99999/reply').send({})).status).toBe(404);
  });
});

describe('error handling', () => {
  it('rejects non-CSV files and CSVs without the required header', async () => {
    const { app } = setup();
    const notCsv = await request(app).post('/api/datasets').attach('file', Buffer.from('x'), 'notes.txt');
    expect(notCsv.status).toBe(400);
    expect(notCsv.body.error.code).toBe('INVALID_FILE_TYPE');

    const badHeader = await request(app).post('/api/datasets').attach('file', Buffer.from('a,b\n1,2\n'), 'x.csv');
    expect(badHeader.status).toBe(400);
    expect(badHeader.body.error.message).toMatch(/Missing required column/);

    const none = await request(app).post('/api/datasets');
    expect(none.status).toBe(400);
  });

  it('marks reviews analysis_failed with a clear reason when the LLM is not configured', async () => {
    const ctx = setup(createFakeLlm({ configured: false }));
    const id = await uploadAndWait(ctx);
    const status = (await request(ctx.app).get(`/api/datasets/${id}/status`)).body.data;
    expect(status.status).toBe('failed');
    expect(status.errorMessage).toMatch(/not configured/);
    expect(status.counts.failed).toBe(28);
  });

  it('keeps going when one batch returns garbage twice: only that batch fails', async () => {
    const llm = createFakeLlm({
      respond: (req, i) => (i < 2 ? 'garbage' : createFakeLlm().complete(req)),
    });
    const ctx = setup(llm);
    const id = await uploadAndWait(ctx);
    const status = (await request(ctx.app).get(`/api/datasets/${id}/status`)).body.data;
    expect(status.status).toBe('completed_with_errors');
    expect(status.counts.failed).toBe(5);
    expect(status.counts.analysed).toBe(23);

    const failed = await reviewsOf(ctx, id, '&status=analysis_failed');
    expect(failed.items[0].failureReason).toMatch(/not valid JSON/);
  });

  it('health endpoint reports database and LLM state without secrets', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/health');
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'ok', llm: { configured: true } });
    expect(JSON.stringify(res.body)).not.toMatch(/key/i);
  });
});

describe('live progress and connection test', () => {
  it('exposes the running batch and counts AI calls as they start', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const llm = createFakeLlm({
      respond: async (req, index) => {
        if (index === 0) await gate;
        return defaultRespond(req);
      },
    });
    const ctx = setup(llm);
    const id = (await request(ctx.app).post('/api/datasets').attach('file', CSV, 'reviews.csv')).body.data.dataset.id;

    // Wait until the first batch request has started.
    while (llm.calls.length === 0) await new Promise((r) => setTimeout(r, 5));
    const during = (await request(ctx.app).get(`/api/datasets/${id}/status`)).body.data;
    expect(during.live).toMatchObject({ batch: 1, totalBatches: 6, reviewsInBatch: 5, model: 'fake-model', usingFallback: false });
    expect(during.counts.aiCalls).toBe(1);

    release();
    await ctx.queue.onIdle();
    const after = (await request(ctx.app).get(`/api/datasets/${id}/status`)).body.data;
    expect(after.live).toBeNull();
    expect(after.counts.aiCalls).toBe(6);
  });

  it('POST /api/llm/test pings each provider and never leaks the key', async () => {
    const llm = { ...createFakeLlm(), host: 'llm.example.test', ping: async () => ({ ok: true, latencyMs: 12, error: null }) };
    const ctx = setup(llm);
    const res = await request(ctx.app).post('/api/llm/test').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([
      { role: 'primary', model: 'fake-model', host: 'llm.example.test', ok: true, latencyMs: 12, error: null },
    ]);
  });
});

describe('split deployment (API-only host such as Render)', () => {
  const apiOnly = (overrides = {}) => setup(createFakeLlm(), { clientDist: '/definitely/not/here', ...overrides });

  it('answers / and unknown routes with JSON instead of an HTML error page', async () => {
    const ctx = apiOnly();
    const root = await request(ctx.app).get('/');
    expect(root.status).toBe(200);
    expect(root.body.data).toMatchObject({ name: 'ReviewLens API', health: '/api/health' });

    for (const url of ['/health', '/datasets', '/api/api/datasets', '/api/nope']) {
      const res = await request(ctx.app).get(url);
      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toMatch(/json/);
      expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('health reports status, version, real DB check and LLM config without secrets', async () => {
    const ctx = apiOnly();
    const res = await request(ctx.app).get('/api/health');
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'ok', llm: { configured: true } });
    expect(res.body.data.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(ctx.llm.calls).toHaveLength(0); // the health check never calls the LLM
  });

  it('CORS allows only the configured frontend origins (incl. preflight and multipart upload)', async () => {
    const ctx = apiOnly({ corsOrigins: ['https://cedco-lenss.vercel.app'] });
    const preflight = await request(ctx.app)
      .options('/api/datasets')
      .set('Origin', 'https://cedco-lenss.vercel.app')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://cedco-lenss.vercel.app');

    const upload = await request(ctx.app)
      .post('/api/datasets')
      .set('Origin', 'https://cedco-lenss.vercel.app')
      .attach('file', CSV, 'reviews.csv');
    expect(upload.status).toBe(202);
    expect(upload.headers['access-control-allow-origin']).toBe('https://cedco-lenss.vercel.app');

    const other = await request(ctx.app).get('/api/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns JSON 404s for a missing dataset and an invalid review id', async () => {
    const ctx = apiOnly();
    const missing = await request(ctx.app).get('/api/datasets/999/dashboard');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    const badId = await request(ctx.app).post('/api/reviews/abc/reply').send({});
    expect(badId.status).toBe(400);
    expect((await request(ctx.app).post('/api/reviews/999999/reply').send({})).status).toBe(404);
  });
});
