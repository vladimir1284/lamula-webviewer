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
    trace: 'on',
    // El default de la pref de reloj es la hora local (D28): tz fija para
    // asserts deterministas, y NO-UTC a propósito — una tz UTC enmascararía
    // bugs de conversión. Los specs computan lo esperado con formatFull.
    timezoneId: 'America/New_York',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /golden\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Goldens visuales aparte y en serie: N contextos WebGL simultáneos
      // (SwiftShader) provocan pérdida de contexto → canvas en blanco.
      name: 'goldens',
      testMatch: /golden\.spec\.ts/,
      dependencies: ['chromium'],
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // COGs golden commiteados con el mismo layout de claves que R2 —
      // NUXT_PUBLIC_R2_BASE_URL apunta aquí para que cog_url resuelva
      // offline y determinista (los goldens visuales dependen de esto).
      command: 'node scripts/serve-cogs.mjs 8790',
      url: 'http://127.0.0.1:8790',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command:
        'pnpm exec wrangler pages dev --port 8788 --ip 127.0.0.1'
        + ' --binding NUXT_DAL_ADAPTER=fixture'
        + ' --binding NUXT_PUBLIC_R2_BASE_URL=http://127.0.0.1:8790',
      url: 'http://127.0.0.1:8788',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
