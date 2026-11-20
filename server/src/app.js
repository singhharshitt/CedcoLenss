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
import { createProcessingQueue } from './jobs/processingQueue.js';
import { createReplyService } from './services/replyService.js';
import { createDatasetRoutes } from './routes/datasetRoutes.js';
import { createReviewRoutes } from './routes/reviewRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const SAMPLE_CSV = path.join(REPO_ROOT, 'reviews.csv');
const CLIENT_DIST = path.join(REPO_ROOT, 'client', 'dist');

/**
 * Builds the Express app. Dependencies (db, llm provider, config) are passed in
 * so tests can use an in-memory database and a fake LLM.
 */
export function createApp({ db, llm, config, logger = console }) {
  const datasets = createDatasetRepository(db);
  const reviews = createReviewRepository(db);
  const cache = createCacheRepository(db);
  const queue = createProcessingQueue({ datasets, reviews, cache, llm, batchSize: config.batchSize, logger });
  const replyService = createReplyService({ reviews, llm });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
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
        database,
        llm: { configured: llm.isConfigured(), model: llm.isConfigured() ? llm.modelName : null },
        batchSize: config.batchSize,
        maxUploadBytes: config.maxUploadBytes,
        cachedAnalyses: cache.count(),
      },
    });
  });

  app.get('/api/sample-csv', (_req, res) => {
    res.download(SAMPLE_CSV, 'reviews.csv');
  });

  app.post('/api/datasets', expensiveLimit);
  app.use('/api/datasets', createDatasetRoutes({ datasets, reviews, queue, config }));
  app.use('/api/reviews', expensiveLimit, createReviewRoutes({ replyService }));
  app.use('/api', notFoundHandler);

  // In production the built React app is served by the same server (one port, no CORS).
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.use(errorHandler);

  return { app, queue };
}
