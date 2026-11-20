import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** server/ folder. */
export const SERVER_ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Repository root (one level above server/). */
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

// The single `.env` lives in the repo root. Real environment variables win.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: path.join(REPO_ROOT, '.env') });
}

const intFromEnv = (fallback, min, max) => z.coerce.number().int().min(min).max(max).default(fallback);

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: intFromEnv(4000, 1, 65535),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_PATH: z.string().default('./data/reviewlens.db'),
  MAX_UPLOAD_MB: intFromEnv(2, 1, 50),
  MAX_CSV_ROWS: intFromEnv(5000, 1, 100000),

  LLM_API_KEY: z.string().default(''),
  LLM_BASE_URL: z.string().default(''),
  LLM_MODEL: z.string().default(''),
  LLM_TIMEOUT_MS: intFromEnv(30000, 1000, 300000),
  LLM_MAX_RETRIES: intFromEnv(4, 0, 10),
  LLM_RETRY_BASE_DELAY_MS: intFromEnv(1000, 0, 60000),
  LLM_RETRY_MAX_DELAY_MS: intFromEnv(30000, 0, 300000),
  ANALYSIS_BATCH_SIZE: intFromEnv(5, 1, 20),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message instead of a stack trace deep in the app.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  databasePath: path.resolve(SERVER_ROOT, env.DATABASE_PATH),
  maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
  maxCsvRows: env.MAX_CSV_ROWS,
  batchSize: env.ANALYSIS_BATCH_SIZE,
  llm: {
    apiKey: env.LLM_API_KEY.trim(),
    baseUrl: env.LLM_BASE_URL.trim().replace(/\/+$/, ''),
    model: env.LLM_MODEL.trim(),
    timeoutMs: env.LLM_TIMEOUT_MS,
    maxRetries: env.LLM_MAX_RETRIES,
    retryBaseDelayMs: env.LLM_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: env.LLM_RETRY_MAX_DELAY_MS,
  },
};
