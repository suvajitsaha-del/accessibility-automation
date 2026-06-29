// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  retries: 0,
  reporter: [
    ['list'],
  ],
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
});