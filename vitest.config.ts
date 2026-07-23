import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // config.ts validates required env vars at import time; give tests dummy values
    env: {
      GITHUB_TOKEN: 'test-token',
      COMET_API_KEY: 'test-key',
    },
  },
});
