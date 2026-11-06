import { defineConfig } from '@playwright/test'

const PORT = 4173

/**
 * E2E against the production build (served under /static/ exactly as Django serves it).
 * The API is mocked per test with page.route, so runs are deterministic and offline-safe.
 * Uses the installed Microsoft Edge (channel "msedge") or set PW_CHANNEL=chrome; set
 * PW_CHANNEL=chromium after `npx playwright install chromium` on CI.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/static/`,
    channel: process.env.PW_CHANNEL ?? 'msedge',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/static/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
