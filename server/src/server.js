import { config } from './config/env.js';
import { openDatabase } from './database/db.js';
import { createOpenAiCompatibleProvider } from './services/llm/openaiCompatibleProvider.js';
import { createApp } from './app.js';

const db = openDatabase(config.databasePath);
const llm = createOpenAiCompatibleProvider(config.llm);
const { app, queue } = createApp({ db, llm, config });

const server = app.listen(config.port, () => {
  console.log(`ReviewLens API listening on http://localhost:${config.port}`);
  console.log(
    llm.isConfigured()
      ? `LLM: ${config.llm.model} via ${new URL(config.llm.baseUrl).host}`
      : 'LLM: NOT CONFIGURED - set LLM_BASE_URL, LLM_MODEL and LLM_API_KEY in .env (see .env.example)',
  );
  queue.resumeUnfinished();
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
