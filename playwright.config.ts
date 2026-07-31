import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      name: 'Worker',
      command: 'pnpm --filter @knucklebones/worker dev:test',
      wait: { stdout: /Ready on http:\/\/localhost:8787/ },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      name: 'Frontend',
      command: 'pnpm --filter @knucklebones/front dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
})
