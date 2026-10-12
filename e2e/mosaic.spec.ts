// Vista de mosaico end-to-end en modo fixture (D48/D49): paridad de chrome
// con el viewer de un solo radar y las tres capas recuperadas (satélite,
// viento, rayos) más las celdas multi-radar. Casos DERIVADOS de las
// fixtures (mosaic-*.json/wind.json/lightning.json son sintéticos hasta la
// próxima re-grabación completa), nunca hardcodeados.
//
// Sin screenshots: viento y rayos animan. Readback 2D del canvas, igual que
// e2e/wind.spec.ts y e2e/lightning.spec.ts.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { LightningBucketMeta } from '../shared/contract'
import { naiveUtcToEpochMs } from '../shared/contract/time'
import { isoToPath } from '../shared/url/time-path'
import { lightningBuckets, mosaicDay, windGrids } from '../tests/helpers/derive'
import { WIND_JOIN_TOLERANCE_S } from '../utils/overlay/join'
import { bucketsInWindow, observationWindow } from '../utils/overlay/lightning-join'

/** primer slot del día cuyo intervalo (slot anterior, slot] trae descargas
 * de algún radar del dominio */
const slotWithLightning = (() => {
  const { slotTimes, members } = mosaicDay
  for (let i = 0; i < slotTimes.length; i++) {
    const w = observationWindow(slotTimes[i]!, i > 0 ? slotTimes[i - 1]! : null)
    const metas = lightningBuckets.filter(
      b => members.includes(b.site_id),
    ) as unknown as LightningBucketMeta[]
    if (bucketsInWindow(metas, w).length > 0) return slotTimes[i]!
  }
  return null
})()

/** primer slot con viento de algún radar del dominio dentro de tolerancia */
const slotWithWind = (() => {
  const { slotTimes, members } = mosaicDay
  const grids = windGrids.filter(w => members.includes(w.site_id))
  return slotTimes.find(t =>
    grids.some(
      g => Math.abs(naiveUtcToEpochMs(g.valid_time) - naiveUtcToEpochMs(t))
        <= WIND_JOIN_TOLERANCE_S * 1000,
    ),
  ) ?? null
})()

const mosaicUrl = (slot: string, query: string) =>
  `/mosaic/${mosaicDay.domain}/${mosaicDay.product}/${isoToPath(slot)}?${query}`

async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

async function paintedPixels(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const canvas = document.querySelector<HTMLCanvasElement>(sel)
    if (!canvas || canvas.width === 0) return -1
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let painted = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! > 0) painted++
    }
    return painted
  }, selector)
}

test('chrome compartido: misma cinta de marca y mismo menú de capas que el radar único', async ({ page }) => {
  await gotoHydrated(page, mosaicUrl(mosaicDay.slotTimes[0]!, 'base=off'))

  await expect(page.locator('[data-testid=mosaic-chip-toggle]')).toBeVisible()
  // enlace de vuelta en el chip, no en la cinta de marca (D48)
  await expect(page.locator('[data-testid=mosaic-exit-link]')).toBeVisible()

  await page.locator('[data-testid=layers-menu-toggle]').click()
  await expect(page.locator('[data-testid=layers-menu]')).toBeVisible()
  // las capas que SÍ existen acá
  await expect(page.locator('[data-testid=layer-toggle-cells]')).toBeVisible()
  await expect(page.locator('[data-testid=layer-toggle-wind]')).toBeVisible()
  await expect(page.locator('[data-testid=layer-toggle-lightning]')).toBeVisible()
  await expect(page.locator('[data-testid=sat-toggle]')).toBeVisible()
  // las que no: meso/trayectorias y los paneles de datos del radar único
  await expect(page.locator('[data-testid=layer-toggle-meso]')).toHaveCount(0)
  await expect(page.locator('[data-testid=vwp-open]')).toHaveCount(0)
  await expect(page.locator('[data-testid=export-open]')).toHaveCount(0)
})

test('timeline: dibuja la ventana de observaciones, no el día entero', async ({ page }) => {
  await gotoHydrated(page, mosaicUrl(mosaicDay.slotTimes.at(-1)!, 'base=off'))
  // la strip es un `div role=slider` (no un <input range>): la ventana se
  // lee en aria-valuemax. `animationFrames` 12 por defecto ⇒ índices 0..11,
  // nunca los 288 slots de 300 s que tiene un día completo
  const slider = page.locator('[data-testid=timeline-slider]')
  await expect(slider).toBeVisible()
  expect(Number(await slider.getAttribute('aria-valuemax'))).toBeLessThanOrEqual(11)
  expect(await page.locator('[data-testid=timeline-tick]').count()).toBeLessThanOrEqual(12)
  // sin botón play (no hay animación en esta vista todavía)
  await expect(page.locator('[data-testid=anim-play]')).toHaveCount(0)
})

test('celdas: apagadas por defecto, ?layers=cells las enciende y la URL lo refleja', async ({ page }) => {
  await gotoHydrated(page, mosaicUrl(mosaicDay.slotTimes[0]!, 'base=off'))
  await expect(page.locator('[data-testid=mosaic-cell-list]')).toHaveCount(0)

  await page.locator('[data-testid=layers-menu-toggle]').click()
  await page.locator('[data-testid=layer-toggle-cells]').click()
  await expect(page).toHaveURL(/layers=cells/)
  await expect(page.locator('[data-testid=layers-menu-close]')).toBeVisible()
})

test('viento: ?layers=wind une las grillas de los radares del dominio y pinta', async ({ page }) => {
  test.skip(slotWithWind === null, 'las fixtures no traen viento en tolerancia para este dominio')
  await gotoHydrated(page, mosaicUrl(slotWithWind!, 'base=off&layers=wind'))

  await page.locator('[data-testid=layers-menu-toggle]').click()
  await expect(page.locator('[data-testid=layer-toggle-wind]')).toBeChecked()
  await expect
    .poll(() => paintedPixels(page, '.wind-particle-canvas'), { timeout: 15_000 })
    .toBeGreaterThan(100)
})

test('rayos: ?layers=lightning pinta las descargas del intervalo del slot', async ({ page }) => {
  test.skip(slotWithLightning === null, 'las fixtures no traen descargas en ningún intervalo del dominio')
  await gotoHydrated(page, mosaicUrl(slotWithLightning!, 'base=off&layers=lightning'))

  await page.locator('[data-testid=layers-menu-toggle]').click()
  await expect(page.locator('[data-testid=layer-toggle-lightning]')).toBeChecked()
  await expect(page.locator('[data-testid=lightning-info]')).toContainText(/descargas|Sin descargas/)
  await expect
    .poll(() => paintedPixels(page, '.lightning-canvas'), { timeout: 15_000 })
    .toBeGreaterThan(0)
})
