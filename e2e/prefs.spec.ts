// Preferencias de usuario (D28): diálogo, persistencia en lamula:prefs v4,
// aplicación de units/clock/coverage/smooth/smoothRadius y migración desde
// v1/v2/v3 — end-to-end en modo fixture.
//
// Hidratación (hallazgo documentado en animation.spec.ts): abrir el diálogo
// y togglear controles son clicks con efecto real — UN solo click tras
// 'networkidle', jamás reintentos. Los asserts idempotentes (contenido de
// localStorage, texto) sí van en expect(...).toPass.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import { formatFull } from '../utils/time-display'
import { mesoVolume, rasters, series } from '../tests/helpers/derive'

const PREFS_KEY = 'lamula:prefs'
const local = (t: string) => formatFull(t, 'local', 'America/New_York')

const mesoRaster = rasters.find(
  r => r.site_id === mesoVolume.site && r.vol_time === mesoVolume.volTime,
)!

const viewerUrl = (r: { site_id: string, product_code: number, vol_time: string }, query = '') =>
  `/${r.site_id}/${r.product_code}/${isoToPath(r.vol_time)}${query ? `?${query}` : ''}`

async function gotoHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

function seedPrefs(page: Page, value: Record<string, unknown>) {
  return page.addInitScript(
    ([key, json]) => localStorage.setItem(key!, json!),
    [PREFS_KEY, JSON.stringify(value)],
  )
}

const readPrefs = async (page: Page) =>
  JSON.parse(await page.evaluate(key => localStorage.getItem(key) ?? 'null', PREFS_KEY))

test('el diálogo abre, togglea coverage, persiste v4 y cierra con Esc', async ({ page }) => {
  const t = series.times[1]
  await gotoHydrated(page, `/${series.site}/${series.product}/${isoToPath(t)}`)

  await page.getByTestId('prefs-open').click() // único click, post-networkidle
  await expect(page.getByTestId('prefs-dialog')).toBeVisible()

  await page.getByTestId('pref-coverage').click() // único click (toggle con efecto)
  await expect(async () => {
    const prefs = await readPrefs(page)
    expect(prefs.v).toBe(4)
    expect(prefs.coverage).toBe(false)
  }).toPass({ timeout: 5000 })

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('prefs-dialog')).not.toBeVisible()
})

test('prefs sembradas se aplican: unidades SI y reloj UTC (camino no-default)', async ({ page }) => {
  await seedPrefs(page, {
    v: 2,
    site: mesoRaster.site_id,
    product: mesoRaster.product_code,
    opacity: 0.8,
    base: 'osm',
    coverage: true,
    units: 'si',
    clock: 'utc',
    animationFrames: 12,
  })
  await gotoHydrated(page, viewerUrl(mesoRaster, 'base=off&layers=cells&panel=cells'))

  // tabla de celdas en SI
  await expect(page.locator('[data-testid=cell-table] thead')).toContainText('Alt (km)')
  // reloj utc: la meta del raster vuelve al sufijo Z histórico
  await expect(page.getByTestId('raster-meta')).toContainText(`${mesoRaster.vol_time}Z`)
})

test('sin prefs guardadas aplica el default: hora local en la meta', async ({ page }) => {
  const t = series.times[1]
  await gotoHydrated(page, `/${series.site}/${series.product}/${isoToPath(t)}`)
  await expect(page.getByTestId('raster-meta')).toContainText(local(t))
})

test('migración: un v1 guardado arranca con defaults nuevos y el primer cambio escribe v4', async ({ page }) => {
  await seedPrefs(page, {
    v: 1,
    site: series.site,
    product: series.product,
    opacity: 0.5,
    base: 'osm',
  })
  const t = series.times[1]
  await gotoHydrated(page, `/${series.site}/${series.product}/${isoToPath(t)}`)

  // defaults nuevos activos (clock local)
  await expect(page.getByTestId('raster-meta')).toContainText(local(t))

  // primer cambio materializa v4 conservando lo guardado en v1
  await page.getByTestId('prefs-open').click()
  await page.getByTestId('pref-units-si').click()
  await expect(async () => {
    const prefs = await readPrefs(page)
    expect(prefs).toMatchObject({ v: 4, opacity: 0.5, units: 'si', clock: 'local', smooth: false, smoothRadius: 1 })
  }).toPass({ timeout: 5000 })
})

test('migración: un v2 guardado (pre-smooth) arranca con smooth off y el primer cambio escribe v4', async ({ page }) => {
  await seedPrefs(page, {
    v: 2,
    site: series.site,
    product: series.product,
    opacity: 0.8,
    base: 'osm',
    coverage: true,
    units: 'imperial',
    clock: 'local',
    animationFrames: 12,
  })
  const t = series.times[1]
  await gotoHydrated(page, `/${series.site}/${series.product}/${isoToPath(t)}`)

  await expect(page.getByTestId('smooth-toggle')).not.toBeChecked()

  await page.getByTestId('smooth-toggle').click() // único click (toggle con efecto)
  await expect(async () => {
    const prefs = await readPrefs(page)
    expect(prefs).toMatchObject({ v: 4, opacity: 0.8, coverage: true, smooth: true, smoothRadius: 1 })
  }).toPass({ timeout: 5000 })
})

test('migración: un v3 guardado (pre-smoothRadius) arranca con radio 1 y el selector persiste el cambio', async ({ page }) => {
  await seedPrefs(page, {
    v: 3,
    site: series.site,
    product: series.product,
    opacity: 0.8,
    base: 'osm',
    coverage: true,
    units: 'imperial',
    clock: 'local',
    animationFrames: 12,
    smooth: true,
  })
  const t = series.times[1]
  await gotoHydrated(page, `/${series.site}/${series.product}/${isoToPath(t)}`)

  const select = page.getByTestId('smooth-radius-select')
  await expect(select).toHaveValue('1')

  // <select>: acción idempotente — reintento seguro ante la carrera de hidratación
  await expect(async () => {
    await select.selectOption('4')
    await expect(select).toHaveValue('4')
  }).toPass({ timeout: 10_000 })

  await expect(async () => {
    const prefs = await readPrefs(page)
    expect(prefs).toMatchObject({ v: 4, smooth: true, smoothRadius: 4 })
  }).toPass({ timeout: 5000 })
})

test('selector de mapa base: refleja ?base= en la URL y persiste en prefs', async ({ page }) => {
  const t = series.times[1]
  await gotoHydrated(page, `/${series.site}/${series.product}/${isoToPath(t)}`)

  // <select>: acción idempotente — reintento seguro ante la carrera de hidratación
  await expect(async () => {
    await page.getByTestId('base-select').selectOption('carto-voyager')
    await expect(page).toHaveURL(/base=carto-voyager/, { timeout: 2000 })
  }).toPass({ timeout: 10_000 })

  await expect(async () => {
    expect((await readPrefs(page)).base).toBe('carto-voyager')
  }).toPass({ timeout: 5000 })
})

test('coverage off sembrado: el viewer arranca sin la máscara y el toggle la restaura', async ({ page }) => {
  await seedPrefs(page, {
    v: 2,
    site: series.site,
    product: series.product,
    opacity: 0.8,
    base: 'osm',
    coverage: false,
    units: 'imperial',
    clock: 'local',
    animationFrames: 12,
  })
  const t = series.times[1]
  await gotoHydrated(page, `/${series.site}/${series.product}/${isoToPath(t)}`)

  await page.getByTestId('prefs-open').click()
  const checkbox = page.getByTestId('pref-coverage')
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await expect(async () => {
    expect((await readPrefs(page)).coverage).toBe(true)
  }).toPass({ timeout: 5000 })
})
