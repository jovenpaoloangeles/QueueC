// tests/playwright.config.js
import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export default defineConfig({
  testDir: './e2e',
  globalSetup: './global-setup.js',
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'node server/index.js',
    cwd: root,
    port: 3001,
    reuseExistingServer: false,
    env: {
      DB_PATH: '/tmp/queuec-test.db',
      PLAYERS_PATH: join(dirname(fileURLToPath(import.meta.url)), 'fixtures/players.json'),
      NODE_ENV: 'test',
    },
  },
  workers: 1,        // serial — tests share one DB
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
})
