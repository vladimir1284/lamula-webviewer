// F4 (puerta M4 automatizable): overlays de fenómenos + panel derecho +
// VWP end-to-end en modo fixture. Casos derivados de las grabaciones
// (tests/helpers/derive.ts) — nunca sites/valores hardcodeados.
//
// Hidratación (mismo hallazgo documentado que animation.spec.ts): los
// toggles y clicks de fila tienen efecto real (navegan) — un solo click
// tras 'networkidle', jamás reintentos.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import {
  joinCase,
  mesoVolume,
  phenomena,
  rasters,
  vwp,
} from '../tests/helpers/derive'

// raster que coincide exacto con el volumen que tiene mesociclones (las
// fixtures lo garantizan: los productos volumétricos comparten vol_time)
const mesoRaster = rasters.find(
  r => r.site_id === mesoVolume.site && r.vol_time === mesoVolume.volTime,
)!
if (!mesoRaster) throw new Error('fixtures insuficientes: el volumen con meso no tiene raster')

const mesoCells = phenomena.filter(
  p => p.site_id === mesoVolume.site && p.vol_time === mesoVolume.volTime && p.kind === 'storm_cell',
)
const topCell = [...mesoCells].sort((a, b) => {
  const dbz = (p: typeof a) => (JSON.parse(p.attrs) as { dbz_max?: number }).dbz_max ?? -Infinity
  return dbz(b) - dbz(a)
})[0]!

// site con VWP pero sin fenómenos (JUA en las grabaciones actuales) — la
// degradación de una señal no debe arrastrar a la otra
const phenSites = new Set(phenomena.map(p => p.site_id))
const vwpOnly = (() => {
  for (const v of vwp) {
    if (phenSites.has(v.site_id)) continue
    const raster = rasters.find(r => r.site_id === v.site_id && r.vol_time === v.vol_time)
    if (raster) {
      const levels = vwp.filter(l => l.site_id === v.site_id && l.vol_time === v.vol_time)
      return { raster, levels }
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

test('combo completo: tabla de celdas del volumen con meso, ordenada por dBZ', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(mesoRaster, 'base=off&layers=cells,meso&panel=cells'))

  const rows = page.locator('[data-testid^=cell-row-]')
  await expect(rows).toHaveCount(mesoCells.length)
  // primera fila = celda con dBZ máx más alto (derivado)
  await expect(rows.first()).toHaveAttribute('data-testid', `cell-row-${topCell.cell_id}`)
  // el volumen tiene ≥1 meso → algún flag MESO en la tabla
  await expect(page.locator('[data-testid=cell-table]')).toContainText('MESO')
})

test('click en una fila selecciona la celda (?cell=) y la resalta', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(mesoRaster, 'base=off&layers=cells&panel=cells'))
  const row = page.locator(`[data-testid=cell-row-${topCell.cell_id}]`)
  await row.click()
  await expect(page).toHaveURL(new RegExp(`cell=${topCell.cell_id}`))
  await expect(row).toHaveClass(/text-yellow-200/)
})

test('join temporal: frame sin fila exacta muestra el volumen vecino', async ({ page }) => {
  const neighborCells = phenomena.filter(
    p => p.site_id === joinCase.site && p.vol_time === joinCase.phenVolTime && p.kind === 'storm_cell',
  )
  await gotoHydrated(page, viewerUrl(
    { site_id: joinCase.site, product_code: joinCase.product, vol_time: joinCase.rasterVolTime },
    'base=off&layers=cells&panel=cells',
  ))
  await expect(page.locator('[data-testid^=cell-row-]')).toHaveCount(neighborCells.length)
})

test('degradación: site sin fenómenos avisa, y el VWP sigue funcionando', async ({ page }) => {
  test.skip(vwpOnly === null, 'las grabaciones actuales no traen un site con VWP y sin fenómenos')
  await gotoHydrated(page, viewerUrl(vwpOnly!.raster, 'base=off&layers=cells&panel=vwp'))

  await expect(page.locator('[data-testid=overlay-info]'))
    .toContainText('Sin datos de celdas')
  const vwpRows = page.locator('[data-testid=vwp-table] tbody tr')
  await expect(vwpRows).toHaveCount(vwpOnly!.levels.length)
})

test('deep link completo reproduce capas + panel + celda tras hidratar', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(
    mesoRaster,
    `base=off&layers=cells,meso&panel=trend&cell=${topCell.cell_id}`,
  ))
  await expect(page.locator('[data-testid=layer-toggle-cells]')).toBeChecked()
  await expect(page.locator('[data-testid=layer-toggle-meso]')).toBeChecked()
  await expect(page.locator('[data-testid=side-panel]')).toContainText(topCell.cell_id!)
  await expect(page.locator('[data-testid=trend-chart]').first()).toBeVisible()
})

test('toggle de capa refleja el estado en la URL sin tocar el path', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(mesoRaster, 'base=off'))
  await page.locator('[data-testid=layer-toggle-cells]').click()
  await expect(page).toHaveURL(/layers=cells/)
  await expect(page).toHaveURL(new RegExp(isoToPath(mesoRaster.vol_time)))
  await page.locator('[data-testid=layer-toggle-cells]').click()
  await expect(page).not.toHaveURL(/layers=/)
})

test('params de overlay inválidos degradan al default, no rompen la ruta', async ({ page }) => {
  await gotoHydrated(page, viewerUrl(mesoRaster, 'base=off&layers=bogus,cells&panel=nope&cell=inv@lid'))
  await expect(page.locator('[data-testid=layer-toggle-cells]')).toBeChecked()
  await expect(page.locator('[data-testid=layer-toggle-meso]')).not.toBeChecked()
  await expect(page.locator('[data-testid=side-panel]')).toHaveCount(0)
})
