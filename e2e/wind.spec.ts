// Capa de viento (partículas GFS) end-to-end en modo fixture. Casos
// derivados de las fixtures (wind.json es sintético hasta que el pipeline
// ingiera GFS — scripts/make-wind-fixture.mjs). Sin screenshots: la
// animación es no determinista para pixel-diff; aquí se asserta URL,
// estado del panel y que el canvas realmente pinta (readback 2D).
//
// Hidratación (hallazgo documentado): el toggle tiene efecto real — un
// solo click tras 'networkidle', jamás reintentos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { naiveUtcToEpochMs } from '../shared/contract/time'
import { isoToPath } from '../shared/url/time-path'
import { rasters, windGrids } from '../tests/helpers/derive'
import { WIND_JOIN_TOLERANCE_S } from '../utils/overlay/join'

// raster cuyo site tiene viento a ≤1 h (casa) y raster cuyo site tiene
// índice de viento pero todo a >1 h (capa limpia, mensaje explícito)
function nearestWind(siteId: string, volTime: string) {
  const times = windGrids.filter(w => w.site_id === siteId)
  if (times.length === 0) return null
  const t = naiveUtcToEpochMs(volTime)
  return [...times].sort(
    (a, b) =>
      Math.abs(naiveUtcToEpochMs(a.valid_time) - t)
      - Math.abs(naiveUtcToEpochMs(b.valid_time) - t),
  )[0]!
}

const joined = (() => {
  for (const r of rasters) {
    const w = nearestWind(r.site_id, r.vol_time)
    if (w && Math.abs(naiveUtcToEpochMs(w.valid_time) - naiveUtcToEpochMs(r.vol_time))
      <= WIND_JOIN_TOLERANCE_S * 1000) {
      return { raster: r, wind: w }
    }
  }
  throw new Error('fixtures insuficientes: ningún raster casa con viento ≤1 h — regenerar con scripts/make-wind-fixture.mjs')
})()

const stale = (() => {
  for (const r of rasters) {
    const w = nearestWind(r.site_id, r.vol_time)
    if (w && Math.abs(naiveUtcToEpochMs(w.valid_time) - naiveUtcToEpochMs(r.vol_time))
      > WIND_JOIN_TOLERANCE_S * 1000) {
      return r
    }
  }
  return null
})()

const viewerUrl = (r: { site_id: string, product_code: number, vol_time: string }, query: string) =>
  `/${r.site_id}/${r.product_code}/${isoToPath(r.vol_time)}?${query}`

async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

/** píxeles con alpha > 0 en el canvas de partículas */
async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.wind-particle-canvas')
    if (!canvas || canvas.width === 0) return -1
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let painted = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 0) painted++
    }
    return painted
  })
}

test('deep link ?layers=wind: toggle marcado, ciclo GFS visible y partículas pintando', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(joined.raster, 'base=off&layers=wind'))

  await expect(page.locator('[data-testid=layer-toggle-wind]')).toBeChecked()
  const cycleH = joined.wind.cycle_time.slice(11, 13)
  const fff = String(joined.wind.forecast_hour).padStart(3, '0')
  await expect(page.locator('[data-testid=wind-info]'))
    .toHaveText(`GFS ciclo ${cycleH}Z f${fff} · ${joined.wind.valid_time.slice(11, 16)}Z`)

  // el rAF necesita unos ticks para acumular estelas
  await expect
    .poll(() => paintedPixels(page), { timeout: 10_000 })
    .toBeGreaterThan(100)
})

test('toggle: activa → ?layers=wind y pinta; desactiva → URL limpia y canvas vacío', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(joined.raster, 'base=off'))

  await page.locator('[data-testid=layer-toggle-wind]').click()
  await expect(page).toHaveURL(/layers=wind/)
  await expect(page).toHaveURL(new RegExp(isoToPath(joined.raster.vol_time))) // path intacto
  await expect
    .poll(() => paintedPixels(page), { timeout: 10_000 })
    .toBeGreaterThan(100)

  await page.locator('[data-testid=layer-toggle-wind]').click()
  await expect(page).not.toHaveURL(/layers=/)
  await expect.poll(() => paintedPixels(page), { timeout: 5_000 }).toBe(0)
})

test('frame a >1 h de todo valid_time: capa limpia y mensaje explícito (D24)', async ({ page }) => {
  test.skip(stale === null, 'las fixtures no traen un site con viento fuera de tolerancia')
  await gotoHydrated(page, viewerUrl(stale!, 'base=off&layers=wind'))

  await expect(page.locator('[data-testid=wind-info]'))
    .toHaveText('Sin dato de viento para este frame.')
  await expect.poll(() => paintedPixels(page), { timeout: 5_000 }).toBe(0)
})

test('viento solo no arrastra fenómenos: sin tabla ni markers de celdas', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(joined.raster, 'base=off&layers=wind'))
  await expect(page.locator('[data-testid=side-panel]')).toHaveCount(0)
  await expect(page.locator('[data-testid^=cell-row-]')).toHaveCount(0)
})
