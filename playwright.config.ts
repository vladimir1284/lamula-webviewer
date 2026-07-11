import { defineConfig, devices } from '@playwright/test'

// Corre contra el build real de Pages (wrangler pages dev sirve dist/
// con el runtime workerd). Requiere `pnpm build` previo. Sin binding D1
// real la página debe degradar a su estado de error explícito.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8788',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm exec wrangler pages dev --port 8788 --ip 127.0.0.1',
    url: 'http://127.0.0.1:8788',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
