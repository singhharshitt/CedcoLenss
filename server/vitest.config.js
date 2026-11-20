import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // Tests must never reach a real LLM provider.
    env: { NODE_ENV: 'test', LLM_API_KEY: '', LLM_BASE_URL: '', LLM_MODEL: '' },
  },
});
