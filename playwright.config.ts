import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: process.env.HBUK_BASE_URL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  },
  timeout: 30_000,
});
