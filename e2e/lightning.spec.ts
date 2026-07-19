// Capa de rayos (bucle GLM) end-to-end en modo fixture. Casos derivados de
// las fixtures (lightning.json es sintético hasta que el pipeline ingiera
// GLM — scripts/make-lightning-fixture.mjs). Sin screenshots: el bucle es
// tiempo-dependiente, no sirve para pixel-diff; aquí se asserta URL, panel
// y que el canvas realmente pinta destellos (readback 2D con poll — en una
// fase dada puede no haber ninguno vivo, el poll absorbe eso).
//
// Hidratación (hallazgo documentado): el toggle tiene efecto real — un
// solo click tras 'networkidle', jamás reintentos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { naiveUtcToEpochMs } from '../shared/contract/time'
import { isoToPath } from '../shared/url/time-path'
import { lightningBuckets, rasters } from '../tests/helpers/derive'
import { LIGHTNING_WINDOW_FALLBACK_S } from '../utils/overlay/lightning-join'

/** ventana de observación del frame tal como la computa el viewer:
 * (prev raster del mismo site+product+día, vol], recortada a 600 s */
function windowFor(r: { site_id: string, product_code: number, vol_time: string }) {
  const endMs = naiveUtcToEpochMs(r.vol_time)
  const prev = rasters
    .filter(x =>
      x.site_id === r.site_id
      && x.product_code === r.product_code
      && x.vol_time.slice(0, 10) === r.vol_time.slice(0, 10)
      && x.vol_time < r.vol_time,
    )
    .map(x => x.vol_time)
    .sort()
    .at(-1)
  const floorMs = endMs - LIGHTNING_WINDOW_FALLBACK_S * 1000
  const startMs = prev ? Math.max(naiveUtcToEpochMs(prev), floorMs) : floorMs
  return { startMs, endMs }
}

/** cubos con strikes del site que solapan la ventana */
function bucketsHit(siteId: string, w: { startMs: number, endMs: number }) {
  return lightningBuckets.filter((b) => {
    if (b.site_id !== siteId || b.strike_count === 0) return false
    const startMs = naiveUtcToEpochMs(b.bucket_start)
    return startMs <= w.endMs && startMs + b.bucket_s * 1000 > w.startMs
  })
}

// raster cuya ventana toca cubos con strikes (pinta) y raster de un site
// con índice de rayos pero ninguno en ventana (capa limpia, mensaje D24)
const joined = (() => {
  for (const r of rasters) {
    if (bucketsHit(r.site_id, windowFor(r)).length > 0) return r
  }
  throw new Error('fixtures insuficientes: ninguna ventana de raster toca cubos con strikes — regenerar con scripts/make-lightning-fixture.mjs')
})()

const stale = (() => {
  const sitesWithBuckets = new Set(lightningBuckets.map(b => b.site_id))
  for (const r of rasters) {
    if (sitesWithBuckets.has(r.site_id) && bucketsHit(r.site_id, windowFor(r)).length === 0) {
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

/** píxeles con alpha > 0 en el canvas de rayos */
async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.lightning-canvas')
    if (!canvas || canvas.width === 0) return -1
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let painted = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 0) painted++
    }
    return painted
  })
}

test('deep link ?layers=lightning: toggle marcado, contador visible y destellos pintando', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(joined, 'base=off&layers=lightning'))

  await expect(page.locator('[data-testid=layer-toggle-lightning]')).toBeChecked()
  await expect(page.locator('[data-testid=lightning-info]'))
    .toHaveText(/\d+ descargas en el intervalo del frame\./)

  // el bucle tiene fases sin destellos vivos — el poll espera una con ellos
  await expect
    .poll(() => paintedPixels(page), { timeout: 10_000 })
    .toBeGreaterThan(20)
})

test('toggle: activa → ?layers=lightning y pinta; desactiva → URL limpia y canvas vacío', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(joined, 'base=off'))

  await page.locator('[data-testid=layer-toggle-lightning]').click()
  await expect(page).toHaveURL(/layers=lightning/)
  await expect(page).toHaveURL(new RegExp(isoToPath(joined.vol_time))) // path intacto
  await expect
    .poll(() => paintedPixels(page), { timeout: 10_000 })
    .toBeGreaterThan(20)

  await page.locator('[data-testid=layer-toggle-lightning]').click()
  await expect(page).not.toHaveURL(/layers=/)
  await expect.poll(() => paintedPixels(page), { timeout: 5_000 }).toBe(0)
})

test('ventana sin cubos con strikes: capa limpia y mensaje explícito (D24)', async ({ page }) => {
  test.skip(stale === null, 'las fixtures no traen un site con rayos fuera de toda ventana')
  await gotoHydrated(page, viewerUrl(stale!, 'base=off&layers=lightning'))

  await expect(page.locator('[data-testid=lightning-info]'))
    .toHaveText('Sin descargas registradas para este frame.')
  await expect.poll(() => paintedPixels(page), { timeout: 5_000 }).toBe(0)
})

test('rayos solo no arrastran fenómenos: sin tabla ni markers de celdas', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(joined, 'base=off&layers=lightning'))
  await expect(page.locator('[data-testid=side-panel]')).toHaveCount(0)
  await expect(page.locator('[data-testid^=cell-row-]')).toHaveCount(0)
})
