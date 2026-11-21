import { analyseReviews } from '../services/analysis/reviewAnalyser.js';
import { PROMPT_VERSION } from '../services/analysis/prompts.js';
import { LlmNotConfiguredError, LlmPermanentError } from '../services/llm/errors.js';

/**
 * Processes uploaded datasets one at a time, in the background.
 *
 * For each dataset:
 *  1. canonical (non-duplicate) pending reviews are looked up in the cache
 *  2. the rest are sent to the LLM in sequential batches of `batchSize`
 *  3. after every batch results are saved, counters refreshed and duplicates
 *     synced — so GET /status always reflects real progress
 *  4. optional `afterDataset` hook (AI theme generation) runs once it finished
 *
 * Every analysis records the model that really produced it, and every HTTP
 * request is counted per model in `usage` (primary vs fallback).
 *
 * Graceful shutdown: `shutdown()` lets the batch in flight finish and be saved,
 * then stops before the next batch. The dataset goes back to 'queued' and is
 * resumed on the next boot (`resumeUnfinished`), so no work is lost or redone.
 */
export function createProcessingQueue({
  datasets,
  reviews,
  cache,
  llm,
  usage,
  batchSize,
  afterDataset = null,
  logger = console,
}) {
  const queue = [];
  let running = false;
  let stopping = false;
  let idleWaiters = [];
  // In-memory progress of the batch being analysed right now (not persisted).
  let live = null;
  // Cache entries are only reused when produced by the same model and prompt version.
  const analyserId = `${llm.modelName}@${PROMPT_VERSION}`;

  async function processDataset(datasetId) {
    const startedAt = Date.now();
    datasets.markProcessing(datasetId);

    try {
      // --- 1. cache lookup --------------------------------------------------
      const pending = reviews.pendingCanonical(datasetId);
      const toAnalyse = [];
      let cacheHits = 0;
      for (const review of pending) {
        const cached = cache.get(review.text_hash, analyserId);
        if (cached) {
          reviews.saveAnalysis(review.id, cached.analysis, 'cache', cached.producedBy);
          cacheHits++;
        } else {
          toAnalyse.push(review);
        }
      }
      reviews.syncDuplicates(datasetId);
      datasets.addCounters(datasetId, { cacheHits, sentToAi: toAnalyse.length });
      datasets.refreshCounts(datasetId);

      if (toAnalyse.length > 0 && !llm.isConfigured()) throw new LlmNotConfiguredError();

      // --- 2. sequential LLM batches ---------------------------------------
      const totalBatches = Math.ceil(toAnalyse.length / batchSize);
      for (let i = 0; i < toAnalyse.length; i += batchSize) {
        if (stopping) {
          // Shutting down: everything analysed so far is saved; the rest is resumed on next boot.
          datasets.markQueued(datasetId);
          datasets.addProcessingTime(datasetId, Date.now() - startedAt);
          logger.log?.(`[queue] dataset ${datasetId} paused for shutdown after ${i} of ${toAnalyse.length} reviews`);
          return;
        }

        const batch = toAnalyse.slice(i, i + batchSize);
        live = {
          datasetId,
          batch: i / batchSize + 1,
          totalBatches,
          reviewsInBatch: batch.length,
          batchStartedAt: new Date().toISOString(),
        };
        const outcomes = await analyseReviews(
          batch.map((r) => ({ key: r.id, product: r.product, text: r.review_text })),
          llm,
          {
            // Counted as each request starts, so the UI sees calls (and retries) in real time.
            onAiCall: ({ model } = {}) => {
              datasets.addCounters(datasetId, { aiCalls: 1 });
              usage?.add(datasetId, model ?? llm.modelName, 'analysis');
            },
          },
        );

        for (const review of batch) {
          const outcome = outcomes.get(review.id);
          if (outcome.ok) {
            reviews.saveAnalysis(review.id, outcome.analysis, 'ai', outcome.model);
            cache.put(review.text_hash, outcome.analysis, analyserId, outcome.model);
          } else {
            reviews.markFailed(review.id, outcome.reason);
          }
        }
        reviews.syncDuplicates(datasetId);
        datasets.refreshCounts(datasetId);
      }
      live = null;

      const dataset = datasets.get(datasetId);
      datasets.finish(datasetId, {
        status: dataset.failed_rows > 0 ? 'completed_with_errors' : 'completed',
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      live = null;
      // Configuration problems (missing key, rejected key, unknown model) stop the
      // job: every remaining review is marked failed with the reason so nothing is lost silently.
      const known = error instanceof LlmNotConfiguredError || error instanceof LlmPermanentError;
      const message = known ? error.message : 'Unexpected error while processing the dataset.';
      logger.error(`[queue] dataset ${datasetId} failed:`, known ? message : error);
      for (const review of reviews.pendingCanonical(datasetId)) reviews.markFailed(review.id, message);
      reviews.syncDuplicates(datasetId);
      datasets.refreshCounts(datasetId);
      datasets.finish(datasetId, { status: 'failed', errorMessage: message, elapsedMs: Date.now() - startedAt });
    } finally {
      live = null;
    }

    // --- 3. follow-up work (AI themes); never affects the dataset status -----
    if (afterDataset && !stopping) {
      try {
        await afterDataset(datasetId);
      } catch (error) {
        logger.error(`[queue] follow-up for dataset ${datasetId} failed:`, error?.message ?? error);
      }
    }
  }

  async function drain() {
    if (running || stopping) return;
    running = true;
    while (queue.length > 0 && !stopping) {
      const id = queue.shift();
      await processDataset(id);
    }
    running = false;
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters = [];
  }

  const onIdle = () =>
    running || (queue.length > 0 && !stopping) ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve();

  return {
    enqueue(datasetId) {
      if (!queue.includes(datasetId)) queue.push(datasetId);
      // Start on the next tick so the HTTP response is sent before work begins.
      // While shutting down nothing starts; the dataset stays 'queued' in the DB and resumes on boot.
      setImmediate(() => void drain());
    },
    /** Re-queues datasets interrupted by a restart. */
    resumeUnfinished() {
      for (const id of datasets.unfinishedIds()) {
        datasets.markQueued(id);
        this.enqueue(id);
      }
    },
    /**
     * Live progress for a dataset that is being analysed right now, or null.
     * { batch, totalBatches, reviewsInBatch, batchStartedAt, model, usingFallback }
     */
    getLiveProgress(datasetId) {
      if (!live || live.datasetId !== datasetId) return null;
      const route = llm.currentRoute?.() ?? null;
      const { datasetId: _id, ...progress } = live;
      return { ...progress, model: route?.model ?? llm.modelName, usingFallback: Boolean(route?.isFallback) };
    },
    /** Resolves when the queue is empty (used by tests). */
    onIdle,
    /** True once shutdown() was called. */
    isStopping: () => stopping,
    /**
     * Graceful stop: no new batch starts; the batch in flight may finish and is saved.
     * Resolves to true if the queue went idle within `timeoutMs`, false if it timed out
     * (the interrupted dataset is still 'processing' in the DB and resumes on next boot).
     */
    async shutdown({ timeoutMs = 30_000 } = {}) {
      stopping = true;
      if (!running) return true;
      let timer;
      const timedOut = new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      });
      const finished = await Promise.race([onIdle().then(() => true), timedOut]);
      clearTimeout(timer);
      return finished;
    },
  };
}
