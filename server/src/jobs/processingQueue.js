import { analyseReviews } from '../services/analysis/reviewAnalyser.js';
import { LlmNotConfiguredError, LlmPermanentError } from '../services/llm/errors.js';

/**
 * Processes uploaded datasets one at a time, in the background.
 *
 * For each dataset:
 *  1. canonical (non-duplicate) pending reviews are looked up in the cache
 *  2. the rest are sent to the LLM in sequential batches of `batchSize`
 *  3. after every batch results are saved, counters refreshed and duplicates
 *     synced — so GET /status always reflects real progress
 *
 * Datasets left 'queued'/'processing' by a server restart are resumed on boot.
 */
export function createProcessingQueue({ datasets, reviews, cache, llm, batchSize, logger = console }) {
  const queue = [];
  let running = false;
  let idleWaiters = [];

  async function processDataset(datasetId) {
    const startedAt = Date.now();
    datasets.markProcessing(datasetId);

    try {
      // --- 1. cache lookup --------------------------------------------------
      const pending = reviews.pendingCanonical(datasetId);
      const toAnalyse = [];
      let cacheHits = 0;
      for (const review of pending) {
        const cached = cache.get(review.text_hash);
        if (cached) {
          reviews.saveAnalysis(review.id, cached, 'cache');
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
      for (let i = 0; i < toAnalyse.length; i += batchSize) {
        const batch = toAnalyse.slice(i, i + batchSize);
        let aiCalls = 0;
        const outcomes = await analyseReviews(
          batch.map((r) => ({ key: r.id, product: r.product, text: r.review_text })),
          llm,
          { onAiCall: () => aiCalls++ },
        );

        for (const review of batch) {
          const outcome = outcomes.get(review.id);
          if (outcome.ok) {
            reviews.saveAnalysis(review.id, outcome.analysis, 'ai');
            cache.put(review.text_hash, outcome.analysis, llm.modelName);
          } else {
            reviews.markFailed(review.id, outcome.reason);
          }
        }
        reviews.syncDuplicates(datasetId);
        datasets.addCounters(datasetId, { aiCalls });
        datasets.refreshCounts(datasetId);
      }

      const dataset = datasets.get(datasetId);
      datasets.finish(datasetId, {
        status: dataset.failed_rows > 0 ? 'completed_with_errors' : 'completed',
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      // Configuration problems (missing key, rejected key, unknown model) stop the
      // job: every remaining review is marked failed with the reason so nothing is lost silently.
      const known = error instanceof LlmNotConfiguredError || error instanceof LlmPermanentError;
      const message = known ? error.message : 'Unexpected error while processing the dataset.';
      logger.error(`[queue] dataset ${datasetId} failed:`, known ? message : error);
      for (const review of reviews.pendingCanonical(datasetId)) reviews.markFailed(review.id, message);
      reviews.syncDuplicates(datasetId);
      datasets.refreshCounts(datasetId);
      datasets.finish(datasetId, { status: 'failed', errorMessage: message, elapsedMs: Date.now() - startedAt });
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    while (queue.length > 0) {
      const id = queue.shift();
      await processDataset(id);
    }
    running = false;
    idleWaiters.forEach((resolve) => resolve());
    idleWaiters = [];
  }

  return {
    enqueue(datasetId) {
      if (!queue.includes(datasetId)) queue.push(datasetId);
      // Start on the next tick so the HTTP response is sent before work begins.
      setImmediate(() => void drain());
    },
    /** Re-queues datasets interrupted by a restart. */
    resumeUnfinished() {
      for (const id of datasets.unfinishedIds()) {
        datasets.markQueued(id);
        this.enqueue(id);
      }
    },
    /** Resolves when the queue is empty (used by tests and graceful shutdown). */
    onIdle: () => (running || queue.length > 0 ? new Promise((resolve) => idleWaiters.push(resolve)) : Promise.resolve()),
  };
}
