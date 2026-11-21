import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { REPO_ROOT } from './config/env.js';
import { createDatasetRepository } from './repositories/datasetRepository.js';
import { createReviewRepository } from './repositories/reviewRepository.js';
import { createCacheRepository } from './repositories/cacheRepository.js';
import { createUsageRepository } from './repositories/usageRepository.js';
import { createThemeRepository } from './repositories/themeRepository.js';
import { createThemeService } from './services/themeService.js';
import { createProcessingQueue } from './jobs/processingQueue.js';
import { createReplyService } from './services/replyService.js';
import { createDatasetRoutes } from './routes/datasetRoutes.js';
import { createReviewRoutes } from './routes/reviewRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const SAMPLE_CSV = path.join(REPO_ROOT, 'reviews.csv');
const CLIENT_DIST = path.join(REPO_ROOT, 'client', 'dist');
/** Reported by GET /api/health and GET / (read once at start-up). */
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'server', 'package.json'), 'utf8')).version;

/**
 * Builds the Express app. Dependencies (db, llm provider, config) are passed in
 * so tests can use an in-memory database and a fake LLM.
 */
export function createApp({ db, llm, config, logger = console }) {
  const datasets = createDatasetRepository(db);
  const reviews = createReviewRepository(db);
  const cache = createCacheRepository(db);
  const usage = createUsageRepository(db);
  const themes = createThemeRepository(db);
  const themeService = createThemeService({ reviews, themes, llm, usage, logger });
  const queue = createProcessingQueue({
    datasets,
    reviews,
    cache,
    llm,
    usage,
    batchSize: config.batchSize,
    // AI themes are generated automatically once a dataset finishes (set autoThemes: false to disable).
    afterDataset: config.autoThemes === false ? null : (datasetId) => themeService.generateQuietly(datasetId),
    logger,
  });
  const replyService = createReplyService({ reviews, llm, usage });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Default Helmet headers, minus upgrade-insecure-requests so the app also works over plain HTTP (e.g. Docker on a LAN IP).
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));
  app.use('/api', cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '10kb' }));

  // Generous limit for normal use (the UI polls status), but stops abuse.
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false }));
  // Stricter limits on the endpoints that cost LLM calls.
  const expensiveLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

  app.get('/api/health', (_req, res) => {
    let database = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      database = 'error';
    }
    res.json({
      data: {
        status: database === 'ok' ? 'ok' : 'degraded',
        version: APP_VERSION,
        database,
        llm: {
          configured: llm.isConfigured(),
          model: llm.isConfigured() ? llm.modelName : null,
          fallbackModel: llm.fallbackModelName ?? null,
        },
        batchSize: config.batchSize,
        maxUploadBytes: config.maxUploadBytes,
        cachedAnalyses: cache.count(),
      },
    });
  });

  // Connection test: one tiny real request to each configured provider (primary + fallback), no retries.
  app.post('/api/llm/test', expensiveLimit, async (_req, res) => {
    const providers = llm.providers?.() ?? [{ role: 'primary', provider: llm }];
    const results = await Promise.all(
      providers.map(async ({ role, provider }) => ({
        role,
        model: provider.modelName || null,
        host: provider.host ?? null,
        ...(provider.ping ? await provider.ping() : { ok: false, latencyMs: null, error: 'Connection test not supported.' }),
      })),
    );
    res.json({ data: { results } });
  });

  app.get('/api/sample-csv', (_req, res) => {
    res.download(SAMPLE_CSV, 'reviews.csv');
  });

  app.post('/api/datasets', expensiveLimit);
  app.use(
    '/api/datasets',
    createDatasetRoutes({ datasets, reviews, usage, themeService, queue, config, expensiveLimit }),
  );
  app.use('/api/reviews', createReviewRoutes({ replyService, expensiveLimit }));
  app.use('/api', notFoundHandler);

  // In production the built React app is served by the same server (one port, no CORS).
  // `config.clientDist` overrides the location (tests use it to simulate an API-only deployment).
  const clientDist = config.clientDist ?? CLIENT_DIST;
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  } else {
    // API-only deployment (e.g. Render, with the UI hosted elsewhere): answer in JSON, not an HTML error page.
    app.get('/', (_req, res) => {
      res.json({ data: { name: 'ReviewLens API', version: APP_VERSION, health: '/api/health' } });
    });
    app.use(notFoundHandler);
  }

  app.use(errorHandler);

  /**
   * Called once at startup: resumes datasets interrupted by a restart, and
   * re-runs theme generation that was cut off mid-request.
   */
  function recoverInterruptedWork() {
    queue.resumeUnfinished();
    for (const datasetId of themes.interruptedIds()) void themeService.generateQuietly(datasetId);
  }

  return { app, queue, recoverInterruptedWork };
}
