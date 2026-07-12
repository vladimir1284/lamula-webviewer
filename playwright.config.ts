import { defineConfig, devices } from '@playwright/test'

// Corre contra el build real de Pages (wrangler pages dev sirve dist/
// con el runtime workerd). Requiere `pnpm build` previo. El DAL corre en
// modo fixture (grabaciones commiteadas): flujos completos deterministas
// sin D1 real, sobre el mismo runtime que producción.
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
    command:
      'pnpm exec wrangler pages dev --port 8788 --ip 127.0.0.1 --binding NUXT_DAL_ADAPTER=fixture',
    url: 'http://127.0.0.1:8788',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
