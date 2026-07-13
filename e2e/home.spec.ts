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

test('day picker: ventana de 72h, día activo marcado, día vacío no navega', async ({ page }) => {
  const t = series.times[1]
  const url = `/${series.site}/${series.product}/${isoToPath(t)}`
  await page.goto(url)

  const active = page.getByTestId(`day-option-${series.day}`)
  await expect(active).toHaveAttribute('aria-pressed', 'true')
  // ventana de 72h ancla a last_seen_at, no a wall-clock: 4 días visibles
  await expect(page.getByTestId('day-picker').getByRole('button')).toHaveCount(4)

  // un día de la ventana sin datos grabados: SELECT_DAY no encuentra a qué
  // frame saltar, la URL no cambia y la timeline muestra el vacío explícito
  const emptyDay = '2026-07-09'
  await page.getByTestId(`day-option-${emptyDay}`).click()
  await expect(page.getByTestId('timeline-empty')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${isoToPath(t)}$`))
})

test('timeline: un tick por vol_time, click salta al frame exacto', async ({ page }) => {
  await page.goto(`/${series.site}/${series.product}/${isoToPath(series.times[0])}`)
  const ticks = page.getByTestId('timeline-tick')
  await expect(ticks).toHaveCount(series.times.length)

  const target = series.times[3]
  await page.locator(`[data-testid="timeline-tick"][data-time="${target}"]`).click()
  await expect(page).toHaveURL(new RegExp(`${isoToPath(target)}$`))
  await expect(page.getByTestId('raster-meta')).toContainText(`${target}Z`)
})

test('timeline: stepping con botones y teclado (←/→), replace en la URL', async ({ page }) => {
  const t1 = series.times[1]
  const t2 = series.times[2]
  await page.goto(`/${series.site}/${series.product}/${isoToPath(t1)}`)

  await page.getByTestId('timeline-next').click()
  await expect(page).toHaveURL(new RegExp(`${isoToPath(t2)}$`))
  await expect(page.getByTestId('raster-meta')).toContainText(`${t2}Z`)

  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(new RegExp(`${isoToPath(t1)}$`))

  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(new RegExp(`${isoToPath(t2)}$`))
})

test('timeline: extremo real de la serie deshabilita esa dirección (404 silencioso)', async ({ page }) => {
  const first = series.times[0]
  await page.goto(`/${series.site}/${series.product}/${isoToPath(first)}`)
  await expect(page.getByTestId('timeline-prev')).toBeEnabled()

  await page.getByTestId('timeline-prev').click()
  // sin frame anterior en toda la serie grabada: se queda en el mismo frame,
  // sin error visible, y el botón se deshabilita tras la respuesta 404
  await expect(page.getByTestId('timeline-prev')).toBeDisabled()
  await expect(page).toHaveURL(new RegExp(`${isoToPath(first)}$`))
  await expect(page.getByTestId('raster-meta')).toContainText(`${first}Z`)
})

test('radar sin datos: degradación visible, sin errores de consola (puerta M3)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  const deadRadar = radars.find(r => r.site_id === 'ICT')!
  await page.goto(`/${deadRadar.site_id}/${series.product}/${isoToPath(series.times[0])}`)

  await expect(page.getByTestId('raster-empty')).toBeVisible()
  await expect(page.getByTestId('timeline-empty')).toBeVisible()
  await expect(page.getByTestId('raster-error')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('cambiar radar navega con push (URL manda)', async ({ page }) => {
  const t = series.times[1]
  await page.goto(`/${series.site}/${series.product}/${isoToPath(t)}`)
  const otherSite = radars.find(r => r.site_id !== series.site)!.site_id
  // La app SSR es una página async (varios useFetch top-level): justo tras
  // el goto, la hidratación puede seguir en curso y el 'change' nativo
  // llega antes de que Vue adjunte su listener (se pierde sin error, y la
  // hidratación revierte el <select> a su valor SSR). toPass reintenta la
  // interacción hasta que la app está hidratada — no es una espera fija.
  await expect(async () => {
    await page.getByTestId('radar-select').selectOption(otherSite)
    await expect(page).toHaveURL(new RegExp(`/${otherSite}/${series.product}/`), { timeout: 500 })
  }).toPass({ timeout: 5000 })
})
