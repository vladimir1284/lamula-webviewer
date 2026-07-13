import { expect, test } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import { radars, series } from '../tests/helpers/derive'

const VIEWER_URL_RE = /\/[A-Z0-9]{3}\/\d+\/\d{8}T\d{6}$/

test('el shell renderiza servido por el runtime de Pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LAMULA WebViewer' })).toBeVisible()
})

test('/ redirige al viewer y materializa el vol_time resuelto en la URL', async ({ page }) => {
  await page.goto('/')
  // redirect client-side a /{site}/{product} y replace al time del closest
  await expect(page).toHaveURL(VIEWER_URL_RE, { timeout: 15_000 })
  await expect(
    page.getByTestId('raster-meta').or(page.getByTestId('raster-empty')),
  ).toBeVisible()
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

test('deep link reproduce el frame exacto (puerta M3)', async ({ page }) => {
  const t = series.times[1]
  const url = `/${series.site}/${series.product}/${isoToPath(t)}`
  await page.goto(url)
  await expect(page.getByTestId('raster-meta')).toContainText(`${t}Z`)
  // la URL no se reescribe: lo pegado es lo reproducido
  await expect(page).toHaveURL(new RegExp(`${isoToPath(t)}$`))
})

test('cambiar radar navega con push (URL manda)', async ({ page }) => {
  const t = series.times[1]
  await page.goto(`/${series.site}/${series.product}/${isoToPath(t)}`)
  const otherSite = radars.find(r => r.site_id !== series.site)!.site_id
  await page.getByTestId('radar-select').selectOption(otherSite)
  await expect(page).toHaveURL(new RegExp(`/${otherSite}/${series.product}/`))
})
