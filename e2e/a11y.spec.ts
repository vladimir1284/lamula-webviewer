import { expect, test, type Page } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import { series } from '../tests/helpers/derive'

// Contrato de accesibilidad por teclado. Lo que se verifica acá no es
// cosmético: son las tres piezas que un refactor deshace sin que nada más
// chille.
//
//  1. El viewport del mapa es focusable. Sin `tabindex` las interacciones
//     KeyboardPan/KeyboardZoom que `defaults()` de OL ya monta nunca disparan,
//     y el mapa queda inoperable sin ratón.
//  2. Las flechas pertenecen a quien tiene el foco. La página escucha flechas
//     en `window` para saltar de frame; si ese listener no se inhibe sobre el
//     mapa, un ArrowLeft panea Y retrocede un volumen a la vez.
//  3. El foco se ve. El repo no tenía NINGÚN estilo de foco y seis inputs
//     llevaban `focus:outline-none`; el anillo global vive en
//     `assets/css/tailwind.css`.
//
// NO se espera por `data-raster-loaded`: offline solo está commiteado el COG
// golden del vol_time MÁS RECIENTE de cada (site, product), así que en
// cualquier otro instante el raster da 404 por diseño y ese atributo se queda
// en 'false' para siempre. Nada de lo que se verifica acá depende de que haya
// píxeles: el mapa de OL se monta igual, y el contrato de teclado también.
// Lo que sí hace falta es hidratación — la carrera de siempre con `page.goto`
// crudo (ver CLAUDE.md), que se cubre con `networkidle` + esperar al viewport
// que OL crea dentro del contenedor.

const viewerUrl = (time: string) =>
  `/${series.site}/${series.product}/${isoToPath(time)}`

async function gotoViewer(page: Page, time: string) {
  await page.goto(viewerUrl(time))
  await page.waitForLoadState('networkidle')
  // `.ol-viewport` lo inyecta OL en `onMounted`: su presencia prueba que el
  // mapa está montado y escuchando teclado, sin depender del raster.
  await expect(page.locator('[data-testid="radar-map"] .ol-viewport')).toBeVisible({
    timeout: 30_000,
  })
}

test('el mapa es focusable y se anuncia como aplicación', async ({ page }) => {
  await gotoViewer(page, series.times[1]!)

  const map = page.getByTestId('radar-map')
  await expect(map).toHaveAttribute('tabindex', '0')
  await expect(map).toHaveAttribute('role', 'application')
  // nombre accesible: debe existir y no estar vacío
  const label = await map.getAttribute('aria-label')
  expect(label?.trim().length ?? 0).toBeGreaterThan(0)

  await map.focus()
  await expect(map).toBeFocused()
})

test('con el foco en el mapa las flechas panean y NO saltan de frame', async ({ page }) => {
  const start = series.times[1]!
  await gotoViewer(page, start)
  const urlBefore = new URL(page.url()).pathname

  const map = page.getByTestId('radar-map')
  await map.focus()

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  // Se deja correr la animación de paneo de OL (100 ms por defecto) y un
  // margen extra: si el listener global se colara, la URL ya habría cambiado.
  await page.waitForTimeout(1_000)
  expect(new URL(page.url()).pathname, 'el frame no se mueve con el foco en el mapa').toBe(urlBefore)
})

test('el PRIMER arrastre con ratón panea el mapa', async ({ page }) => {
  // Regresión de D54: poner `tabindex` en el target de OL activa el
  // `onFocusOnly: true` con el que `ol/Map.js` construye sus interacciones por
  // defecto, y entonces `DragPan` exige que el mapa YA tenga el foco. El foco
  // llega en `mousedown`, posterior al `pointerdown` donde OL evalúa la
  // condición, así que el primer arrastre tras cargar no movía nada — un fallo
  // de ratón introducido por un arreglo de teclado. El fix son interacciones
  // explícitas con `onFocusOnly: false`; esto lo vigila.
  await gotoViewer(page, series.times.at(-1)!)
  // Este sí espera el raster: es el único vol_time con COG golden commiteado,
  // y sin píxeles la captura de pantalla no puede probar que la vista se movió.
  await expect(page.getByTestId('radar-map')).toHaveAttribute('data-raster-loaded', 'true', {
    timeout: 40_000,
  })
  await page.waitForTimeout(1_000)

  const map = page.getByTestId('radar-map')
  const before = await map.screenshot()
  const box = (await map.boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  // Sin `.focus()` previo a propósito: el primer gesto de un usuario real llega
  // con el foco todavía en el <body>.
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 120, cy, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(1_500)

  const after = await map.screenshot()
  expect(Buffer.compare(before, after), 'el primer arrastre debe mover la vista').not.toBe(0)
})

test('con el foco en el slider las flechas SÍ saltan de frame', async ({ page }) => {
  const start = series.times[2]!
  await gotoViewer(page, start)
  const pathBefore = new URL(page.url()).pathname

  const slider = page.getByTestId('timeline-slider')
  await expect(slider).toHaveAttribute('role', 'slider')
  await slider.focus()
  await expect(slider).toBeFocused()

  await page.keyboard.press('ArrowLeft')
  await expect.poll(
    () => new URL(page.url()).pathname,
    { timeout: 10_000 },
  ).not.toBe(pathBefore)

  // Home salta al primer volumen del día — lo promete `role="slider"` y antes
  // no estaba implementado (solo había flechas, y venían del listener global).
  await page.keyboard.press('Home')
  await expect.poll(
    () => new URL(page.url()).pathname,
    { timeout: 10_000 },
  ).toBe(viewerUrl(series.times[0]!))
})

test('el foco por teclado deja un anillo visible', async ({ page }) => {
  await gotoViewer(page, series.times[1]!)

  // Tab hasta que algo dentro del documento tenga foco real.
  await page.keyboard.press('Tab')
  const outline = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const s = getComputedStyle(el)
    return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor }
  })
  expect(outline, 'Tab debe mover el foco a un control del viewer').not.toBeNull()
  expect(outline!.style).not.toBe('none')
  expect(parseFloat(outline!.width)).toBeGreaterThanOrEqual(2)
})

test('las pestañas del panel de datos cumplen el patrón ARIA tabs', async ({ page }) => {
  await gotoViewer(page, series.times[1]!)
  await page.goto(`${viewerUrl(series.times[1]!)}?panel=cells`)
  await page.waitForLoadState('networkidle')

  const tablist = page.getByRole('tablist')
  await expect(tablist).toBeVisible()

  const cellsTab = page.getByTestId('data-modal-tab-cells')
  await expect(cellsTab).toHaveAttribute('aria-selected', 'true')
  await expect(cellsTab).toHaveAttribute('aria-controls', 'data-modal-panel-cells')
  await expect(cellsTab).toHaveAttribute('tabindex', '0')

  // tabindex rodante: las pestañas inactivas salen del orden de tabulación
  await expect(page.getByTestId('data-modal-tab-trend')).toHaveAttribute('tabindex', '-1')

  // flecha derecha mueve de pestaña y el foco la sigue (activación automática)
  await cellsTab.focus()
  await page.keyboard.press('ArrowRight')
  const trendTab = page.getByTestId('data-modal-tab-trend')
  await expect(trendTab).toHaveAttribute('aria-selected', 'true')
  await expect(trendTab).toBeFocused()
  await expect(page.getByTestId('data-modal-tab-cells')).toHaveAttribute('aria-selected', 'false')
})
