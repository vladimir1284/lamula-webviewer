// Puerta M3 (animación): ciclado sin errores + prefetch medido. Nota sobre
// el fixture: solo el vol_time MÁS RECIENTE de cada (site, product) tiene
// un COG golden commiteado (tests/fixtures/cogs/r2/); el resto 404 en este
// entorno offline — degradación esperada (frameFailed, no crash), no una
// limitación del código. La fluidez de 20 frames reales es la puerta
// manual contra datos vivos (docs/validaciones.md); aquí se verifica que
// la máquina nunca se cuelga y el ciclado/paginado es correcto.
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import { series } from '../tests/helpers/derive'
import { formatFull } from '../utils/time-display'

// default de reloj = hora local (D28): tz fijada en playwright.config.ts
const local = (t: string) => formatFull(t, 'local', 'America/New_York')

// La página es SSR con setup() async: justo tras el goto, la hidratación
// puede seguir en curso y el 'change'/'click' nativo se pierde antes de
// que Vue adjunte su listener (mismo hallazgo que en home.spec.ts). A
// diferencia del <select> de home.spec.ts, aquí NO sirve reintentar el
// click con toPass: cada click es un TOGGLE con efecto real (play/pause),
// así que un reintento puede alcanzar al auto-play justo cuando dispara y
// apagarlo de nuevo. Se espera 'networkidle' (hidratación completa) antes
// del único click.
//
// D36 — moveend espurio: reconstruir el pool de animación hace que OL emita
// un 'moveend' que no viene de ningún gesto, y animationMachine lo trata como
// pan/zoom real y pausa el play recién arrancado. Fix de raíz en
// `RadarMap.vue`: solo se reenvía el moveend que sigue a una interacción real
// con el viewport (pointerdown/wheel/keydown), así que este spec ya no depende
// de ninguna ventana temporal.
//
// COSTE DE ARRANQUE, medido en este contenedor (2 núcleos, WebGL por
// SwiftShader): el raster estático tarda ~8.5 s desde el goto hasta
// data-raster-loaded="true", y el pool vuelve a decodificar el mismo COG de
// 1.4 MB (capa GL nueva por frame) en otros ~6.5 s — un rAF cuesta ahí ~215 ms.
// Por eso se espera el raster estático antes de tocar play y los asserts de
// estado llevan timeouts holgados: lo que se verifica es la transición de la
// máquina, no la velocidad de decodificación.
const READY_MS = 30_000

test.describe.configure({ timeout: 90_000 })

/**
 * `expectRaster: false` para los deep links cuyo COG no existe en este entorno
 * (404): ahí `data-raster-loaded` se queda en 'false' para siempre y esperarlo
 * colgaría el test.
 */
async function gotoAndWaitHydrated(page: Page, url: string, expectRaster = true) {
  await page.goto(url)
  if (expectRaster) {
    // el raster estático ya pintado es la señal de que la página está viva y
    // de que el COG está en la caché de blobs: a partir de acá el pool solo
    // paga decodificación, no red
    await expect(page.locator('[data-testid="radar-map"][data-raster-loaded="true"]'))
      .toBeVisible({ timeout: READY_MS })
  }
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500) // assure hydration listener attached
}

test('animación: play arranca en el frame que se venía viendo, sin errores', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  const golden = series.times.at(-1)! // único vol_time con COG golden real
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(golden)}`)

  await expect(page.getByTestId('timeline-slider')).toHaveAttribute('aria-valuetext', local(golden))
  await page.getByTestId('anim-play').click()

  // arranca YA en el frame golden, no en el primero de la serie (regresión:
  // SET_FRAMES reseteaba el índice a 0 y el buffer esperaba el frame
  // equivocado hasta que el resto fallaba)
  await expect(page.getByTestId('timeline-slider')).toHaveAttribute('aria-valuetext', local(golden))
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', { timeout: READY_MS })

  await page.waitForTimeout(2000)
  expect(errors).toEqual([])
})

test('animación: buffering no se cuelga aunque el frame inicial falle (404 real)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  // primer frame de la serie: sin COG golden en este entorno → falla
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(series.times[0])}`, false)
  await page.getByTestId('anim-play').click()

  // el buffer se asienta (no queda colgado en 0/N para siempre) y el
  // ícono llega a play/pausa con normalidad
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', { timeout: READY_MS })
  await expect(page.getByTestId('timeline-slider')).toHaveAttribute('aria-valuetext', /.+/)
  expect(errors).toEqual([])
})

test('animación: pausar sincroniza la URL con el frame que quedó visible', async ({ page }) => {
  const golden = series.times.at(-1)!
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(golden)}`)
  await page.getByTestId('anim-play').click()
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', { timeout: READY_MS })

  await page.getByTestId('anim-play').click() // pausa
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Reproducir')
  // decisión F3: durante playback la URL no se toca; al pausar sí
  await expect(page).toHaveURL(new RegExp(`${isoToPath(golden)}$`))
})

test('animación: un pan real del usuario sí pausa el playback', async ({ page }) => {
  // contracara del filtro por origen de `moveend` en RadarMap: suprimir el
  // moveend espurio no puede llevarse por delante el de un gesto genuino
  const golden = series.times.at(-1)!
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(golden)}`)
  await page.getByTestId('anim-play').click()
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', { timeout: READY_MS })

  const map = page.getByTestId('radar-map')
  const box = (await map.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()

  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Reproducir', { timeout: READY_MS })
})

test('animación: un click previo sobre el mapa no se lleva puesto el play', async ({ page }) => {
  // el click marca "hubo gesto" pero no mueve la vista, así que esa marca
  // seguiría viva cuando el pool reconstruye capas y OL emite su moveend
  // propio — reconstruir el pool la limpia (decisión 41)
  const golden = series.times.at(-1)!
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(golden)}`)

  const map = page.getByTestId('radar-map')
  const box = (await map.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await page.getByTestId('anim-play').click()
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', { timeout: READY_MS })
  // y sigue reproduciendo pasado el primer ciclo de render
  await page.waitForTimeout(2000)
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar')
})
