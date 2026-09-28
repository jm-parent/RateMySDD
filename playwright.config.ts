import { defineConfig } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT?.trim() || '5179';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node dist/server/server/index.js',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: 'test',
      RMSDD_TEST_MODE: '1',
      GITHUB_OAUTH_CLIENT_ID: 'test',
      PORT: port,
    },
  },
});
