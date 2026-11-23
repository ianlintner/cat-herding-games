import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/smoke.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: BASE_URL,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
});
