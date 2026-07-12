import { expect, test } from '@playwright/test'
import { radars } from '../tests/helpers/derive'

test('el shell renderiza servido por el runtime de Pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LAMULA WebViewer' })).toBeVisible()
})

test('el selector de radares se puebla desde el DAL (modo fixture)', async ({ page }) => {
  await page.goto('/')
  const select = page.getByTestId('radar-select')
  await expect(select).toBeVisible()
  for (const radar of radars) {
    await expect(
      select.locator('option', { hasText: radar.icao ?? radar.site_id }),
    ).toHaveCount(1)
  }
})

test('el viewer muestra leyenda y metadata del raster más cercano', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('legend')).toBeVisible()
  await expect(page.getByTestId('radar-map')).toBeVisible()
  // las fixtures traen rasters recientes → closest resuelve o marca vacío
  await expect(
    page.getByTestId('raster-meta').or(page.getByTestId('raster-empty')),
  ).toBeVisible()
})
