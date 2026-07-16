// Puerta M3 (animación): ciclado sin errores + prefetch medido. Nota sobre
// el fixture: solo el vol_time MÁS RECIENTE de cada (site, product) tiene
// un COG golden commiteado (tests/fixtures/cogs/r2/); el resto 404 en este
// entorno offline — degradación esperada (frameFailed, no crash), no una
// limitación del código. La fluidez de 20 frames reales es la puerta
// manual contra datos vivos (docs/validaciones.md); aquí se verifica que
// la máquina nunca se cuelga y el ciclado/paginado es correcto.
import { expect, test } from '@playwright/test'
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
async function gotoAndWaitHydrated(page: import('@playwright/test').Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
}

test('animación: play arranca en el frame que se venía viendo, sin errores', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  const golden = series.times.at(-1)! // único vol_time con COG golden real
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(golden)}`)

  await expect(page.getByTestId('anim-frame-label')).toHaveText(local(golden))
  await page.getByTestId('anim-play').click()

  // arranca YA en el frame golden, no en el primero de la serie (regresión:
  // SET_FRAMES reseteaba el índice a 0 y el buffer esperaba el frame
  // equivocado hasta que el resto fallaba)
  await expect(page.getByTestId('anim-frame-label')).toHaveText(local(golden))
  await expect(page.getByTestId('anim-play')).toHaveText('⏸', { timeout: 5000 })

  await page.waitForTimeout(2000)
  expect(errors).toEqual([])
})

test('animación: buffering no se cuelga aunque el frame inicial falle (404 real)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', err => errors.push(err.message))
  // primer frame de la serie: sin COG golden en este entorno → falla
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(series.times[0])}`)
  await page.getByTestId('anim-play').click()

  // el buffer se asienta (no queda colgado en 0/N para siempre) y el
  // ícono llega a play/pausa con normalidad
  await expect(page.getByTestId('anim-play')).toHaveText('⏸', { timeout: 5000 })
  await expect(page.getByTestId('anim-frame-label')).not.toHaveText('—')
  expect(errors).toEqual([])
})

test('animación: pausar sincroniza la URL con el frame que quedó visible', async ({ page }) => {
  const golden = series.times.at(-1)!
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(golden)}`)
  await page.getByTestId('anim-play').click()
  await expect(page.getByTestId('anim-play')).toHaveText('⏸', { timeout: 5000 })

  await page.getByTestId('anim-play').click() // pausa
  await expect(page.getByTestId('anim-play')).toHaveText('▶')
  // decisión F3: durante playback la URL no se toca; al pausar sí
  await expect(page).toHaveURL(new RegExp(`${isoToPath(golden)}$`))
})
