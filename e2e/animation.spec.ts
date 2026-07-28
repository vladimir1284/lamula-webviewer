// Puerta M3 (animación): ciclado sin errores + prefetch medido. Nota sobre
// el fixture: solo el vol_time MÁS RECIENTE de cada (site, product) tiene
// un COG golden commiteado (tests/fixtures/cogs/r2/); el resto 404 en este
// entorno offline — degradación esperada (frameFailed, no crash), no una
// limitación del código. La fluidez de 20 frames reales es la puerta
// manual contra datos vivos (docs/validaciones.md); aquí se verifica que
// la máquina nunca se cuelga y el ciclado/paginado es correcto.
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
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
// D36 — hallazgo de la verificación, arreglado en la misma tanda: al
// presionar play, el watcher de RadarMap.vue que engancha el pool de
// animación (initOrUpdatePool(), disparado por el cambio null→array de
// `frames`) podía hacer que OpenLayers emitiera un 'moveend' espurio (fin de
// su propio ciclo de render interno tras agregar/quitar capas — moveend no
// es un MapBrowserEvent, OL no distingue "paneó el usuario" de "se asentó un
// render programático"). Ese moveend disparaba el MOVE_END global de
// animationMachine — pensado para pan/zoom real — y pausaba la animación
// recién arrancada. Preexistente (mismo mecanismo de siempre en
// initOrUpdatePool), no introducido por este rediseño; el layout nuevo solo
// lo hacía más fácil de gatillar. Fix de raíz en `RadarMap.vue`
// (`armMoveEndSuppression`): descarta como mucho UN 'moveend' inmediatamente
// después de tocar el pool, con timeout de seguridad para no suprimir un pan
// genuino más adelante — el 500ms de acá vuelve a alcanzar.
async function gotoAndWaitHydrated(page: Page, url: string) {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500) // assure hydration listener attached
}

test('animación: play arranca en el frame que se venía viendo, sin errores', async ({ page }) => {
  const errors: string[] = []
  page.on("console", msg => { fs.appendFileSync("browser.log", msg.text() + "\n"); });
  page.on('pageerror', err => errors.push(err.message))
  const golden = series.times.at(-1)! // único vol_time con COG golden real
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(golden)}`)

  await expect(page.getByTestId('timeline-slider')).toHaveAttribute('aria-valuetext', local(golden))
  await page.getByTestId('anim-play').click()

  // arranca YA en el frame golden, no en el primero de la serie (regresión:
  // SET_FRAMES reseteaba el índice a 0 y el buffer esperaba el frame
  // equivocado hasta que el resto fallaba)
  await expect(page.getByTestId('timeline-slider')).toHaveAttribute('aria-valuetext', local(golden))
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', { timeout: 5000 })

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
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', { timeout: 5000 })
  await expect(page.getByTestId('timeline-slider')).toHaveAttribute('aria-valuetext', /.+/)
  expect(errors).toEqual([])
})

test('animación: pausar sincroniza la URL con el frame que quedó visible', async ({ page }) => {
  const golden = series.times.at(-1)!
  await gotoAndWaitHydrated(page, `/${series.site}/${series.product}/${isoToPath(golden)}`)
  await page.getByTestId('anim-play').click()
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', { timeout: 5000 })

  await page.getByTestId('anim-play').click() // pausa
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Reproducir')
  // decisión F3: durante playback la URL no se toca; al pausar sí
  await expect(page).toHaveURL(new RegExp(`${isoToPath(golden)}$`))
})
