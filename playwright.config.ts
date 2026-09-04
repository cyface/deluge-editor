import { defineConfig } from '@playwright/test'

// End-to-end specs against the built app (`vite preview`), see tests/e2e/.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // A stray `.only` would let a half-tested build deploy: CI refuses it.
  forbidOnly: !!process.env.CI,
  // A failure keeps its trace so a CI-only failure can be replayed locally
  // (`pnpm exec playwright show-trace`).
  use: { baseURL: 'http://localhost:4173', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
