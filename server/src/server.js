import { config } from './config/env.js';
import { openDatabase } from './database/db.js';
import { createLlm } from './services/llm/createLlm.js';
import { createApp } from './app.js';

const db = openDatabase(config.databasePath);
const llm = createLlm(config);
const { app, queue, recoverInterruptedWork } = createApp({ db, llm, config });

const server = app.listen(config.port, () => {
  console.log(`ReviewLens API listening on http://localhost:${config.port}`);
  console.log(
    llm.isConfigured()
      ? `LLM: ${llm.modelName}${llm.fallbackModelName ? ` (fallback: ${llm.fallbackModelName} via ${new URL(config.llmFallback.baseUrl).host})` : ''}`
      : 'LLM: NOT CONFIGURED - set LLM_BASE_URL, LLM_MODEL and LLM_API_KEY in .env (see .env.example)',
  );
  recoverInterruptedWork();
});

/**
 * Graceful shutdown:
 *  1. stop accepting HTTP requests,
 *  2. let the analysis batch in flight finish and be saved (up to SHUTDOWN_TIMEOUT_MS);
 *     no new batch starts and the dataset is re-queued, so it resumes on the next start,
 *  3. close the database and exit.
 * A second Ctrl+C exits immediately.
 */
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) {
    console.log(`${signal} received again, exiting now`);
    process.exit(1);
  }
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully (press Ctrl+C again to force)`);

  server.close();
  server.closeIdleConnections?.();

  const finished = await queue.shutdown({ timeoutMs: config.shutdownTimeoutMs });
  console.log(
    finished
      ? 'Background processing stopped cleanly; unfinished datasets resume on the next start.'
      : `Current AI batch did not finish within ${config.shutdownTimeoutMs} ms; it will be redone on the next start.`,
  );

  server.closeAllConnections?.();
  db.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
// Windows: Ctrl+Break / closing the console window.
process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
