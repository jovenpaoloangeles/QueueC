// tests/playwright.config.js
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // stale client/dist looks like a pile of false failures — mtime-check and
  // rebuild before workers spawn (fast no-op when the dist is fresh)
  globalSetup: './scripts/ensure-build.js',
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  // Each worker owns a server + DB (see fixtures.js); files parallelize, tests within a file stay ordered.
  fullyParallel: false,
  // 8 measured ~46-48s vs ~55s at 5 (both fully green, twice) — 8 servers +
  // chromium instances fit this machine; PW_WORKERS still overrides.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 8,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
})
