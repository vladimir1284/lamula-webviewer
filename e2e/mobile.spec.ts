import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { series } from '../tests/helpers/derive'
import { isoToPath } from '../shared/url/time-path'

/**
 * Regresiones del pase móvil del timebar (F5).
 *
 * Lo que vigila, con las cifras medidas antes del arreglo a 360 px de ancho:
 *  - las etiquetas de tick se pisaban hasta 48 px (y 11 px incluso a 768 px);
 *  - la pastilla "EN VIVO" flotante se salía 18 px del viewport, tapaba 34×26
 *    px del botón ☰ y partía su texto en dos renglones;
 *  - prev/next eran de 36 px, por debajo del mínimo táctil.
 *
 * Es e2e y no unit a propósito: todo esto es geometría de layout real. Un
 * `mount` en jsdom devuelve 0 en cada `getBoundingClientRect` y no vería nada
 * de esto — de hecho el componente trata ese 0 como "sin medir".
 */

const PHONE = { width: 360, height: 640 }
const MIN_TOUCH_PX = 44

function viewerUrl(time: string): string {
  return `/${series.site}/${series.product}/${isoToPath(time)}`
}

async function gotoViewer(page: Page, time: string) {
  await page.goto(viewerUrl(time))
  await page.waitForLoadState('networkidle')
  // No se espera por `data-raster-loaded`: offline sólo está commiteado el COG
  // golden del vol_time más reciente de cada (site, product). `.ol-viewport` lo
  // inyecta OL en `onMounted` y basta para que el timebar ya esté medido.
  await expect(page.locator('[data-testid="radar-map"] .ol-viewport')).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByTestId('timeline-slider')).toBeVisible()
}

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  expect(b, 'el elemento debe estar en el layout').not.toBeNull()
  return b!
}

test.describe('timebar en móvil', () => {
  test.use({ viewport: PHONE })

  test('las etiquetas de tick no se pisan', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const labels = page.locator('[data-testid="timeline"] span.absolute')
    const count = await labels.count()
    expect(count, 'el rango del día necesita al menos sus dos extremos').toBeGreaterThanOrEqual(2)

    const boxes = []
    for (let i = 0; i < count; i++) boxes.push(await box(labels.nth(i)))
    boxes.sort((a, b) => a.x - b.x)
    for (let i = 1; i < boxes.length; i++) {
      const prev = boxes[i - 1]!
      expect(
        boxes[i]!.x,
        `la etiqueta ${i} empieza antes de que termine la ${i - 1}`,
      ).toBeGreaterThanOrEqual(prev.x + prev.width)
    }
  })

  test('nada del timebar se sale del viewport', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const timeline = await box(page.getByTestId('timeline'))
    expect(timeline.x).toBeGreaterThanOrEqual(0)
    expect(timeline.x + timeline.width).toBeLessThanOrEqual(PHONE.width)

    // La pastilla "en vivo" seguía al handle; con el handle en el extremo vivo
    // quedaba medio cuerpo fuera de la pantalla.
    const pill = await box(page.getByTestId('live-refresh-toggle-mobile'))
    expect(pill.x).toBeGreaterThanOrEqual(0)
    expect(pill.x + pill.width).toBeLessThanOrEqual(PHONE.width)

    // Y la página no gana scroll horizontal por culpa de nada de esto.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('la pastilla "en vivo" no tapa el botón de menú', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const pill = await box(page.getByTestId('live-refresh-toggle-mobile'))
    const menu = await box(page.getByTestId('timeline-menu-mobile'))
    const overlapX = Math.min(pill.x + pill.width, menu.x + menu.width) - Math.max(pill.x, menu.x)
    const overlapY = Math.min(pill.y + pill.height, menu.y + menu.height) - Math.max(pill.y, menu.y)
    expect(overlapX > 0 && overlapY > 0, 'pastilla y ☰ no pueden solaparse').toBe(false)

    // Y el ☰ responde: si estuviera tapado, este click lo comería la pastilla.
    await page.getByTestId('timeline-menu-mobile').click()
    await expect(page.getByTestId('timeline-menu-dialog')).toBeVisible()
  })

  test('los controles tienen área táctil suficiente', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    for (const id of ['timeline-prev', 'anim-play', 'timeline-next', 'timeline-menu-mobile', 'live-refresh-toggle-mobile']) {
      const b = await box(page.getByTestId(id))
      expect(Math.min(b.width, b.height), `${id} mide ${b.width}×${b.height}`).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    }
  })

  test('el móvil usa la pastilla inline, no la flotante', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    await expect(page.getByTestId('live-refresh-toggle-mobile')).toBeVisible()
    await expect(page.getByTestId('live-refresh-toggle')).toBeHidden()
    await expect(page.getByTestId('timeline-menu')).toBeHidden()
  })
})

test.describe('timebar en móvil horizontal', () => {
  // 640×360: un móvil girado. El corte de layout es `sm:` (640 px) justo por
  // este caso — con la pila vertical el timebar se comía 146 px de 360.
  test.use({ viewport: { width: 640, height: 360 } })

  test('en horizontal cabe en una sola fila y gasta menos alto', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const timeline = await box(page.getByTestId('timeline'))
    expect(timeline.height).toBeLessThan(100)
    await expect(page.getByTestId('live-refresh-toggle')).toBeVisible()
    await expect(page.getByTestId('live-refresh-toggle-mobile')).toBeHidden()
  })
})

test.describe('timebar en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('escritorio conserva las 6 etiquetas y la pastilla flotante', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    await expect(page.locator('[data-testid="timeline"] span.absolute')).toHaveCount(6)
    await expect(page.getByTestId('live-refresh-toggle')).toBeVisible()
    await expect(page.getByTestId('live-refresh-toggle-mobile')).toBeHidden()
  })
})

/**
 * Regresiones del chip de identidad (D56). Cifras medidas antes del arreglo:
 *  - el título se truncaba a TODOS los anchos (197 px de texto en 177 px de
 *    caja a 1280 px; a 360 px sólo quedaban 73 px y se leía "AMX · ");
 *  - la insignia de frescura envolvía a 3 renglones ≤414 px y pisaba el enlace
 *    "mosaico" 29 px a 360 px y 44 px a 320 px;
 *  - el botón ⓘ medía 28×28 px.
 */
function chipParts(page: Page) {
  return {
    title: page.locator('[data-testid="radar-chip-toggle"] span.flex-1'),
    time: page.locator('[data-testid="radar-chip-toggle"] + div span.font-mono'),
    badge: page.locator('[data-testid="radar-chip-toggle"] + div span.rounded'),
    link: page.getByTestId('mosaic-enter-link'),
  }
}

/** Solape horizontal máximo entre cajas que comparten franja vertical. */
async function worstOverlap(parts: Locator[]): Promise<number> {
  const boxes = []
  for (const p of parts) boxes.push(await box(p))
  let worst = 0
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!
      const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (ox > 0 && oy > 0) worst = Math.max(worst, ox)
    }
  }
  return worst
}

test.describe('chip de identidad en móvil', () => {
  test.use({ viewport: PHONE })

  test('el título se lee entero', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const cut = await chipParts(page).title.evaluate(
      el => el.scrollWidth - el.clientWidth,
    )
    expect(cut, 'el título no puede quedar cortado: envuelve, no trunca').toBeLessThanOrEqual(1)
  })

  test('nada del chip se pisa ni se sale', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const { title, time, badge, link } = chipParts(page)
    expect(await worstOverlap([title, time, badge, link])).toBe(0)

    const card = await box(page.locator('[data-testid="radar-chip-toggle"]').locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]'))
    expect(card.x).toBeGreaterThanOrEqual(0)
    expect(card.x + card.width).toBeLessThanOrEqual(PHONE.width)
  })

  test('la insignia de frescura ocupa un solo renglón', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const b = await box(chipParts(page).badge)
    expect(b.height, 'con `whitespace-nowrap` la insignia nunca envuelve').toBeLessThanOrEqual(24)
  })

  test('el enlace a mosaico sigue visible y es tocable', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const b = await box(chipParts(page).link)
    expect(b.height, `el enlace mide ${b.width}×${b.height}`).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
  })

  test('un solo despliegue abre selectores y detalle', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    // Ya no hay un segundo botón ⓘ: el ⌄ gobierna los dos bloques.
    await expect(page.getByTestId('radar-details-toggle')).toHaveCount(0)
    await expect(page.getByTestId('raster-meta')).toBeHidden()

    await page.getByTestId('radar-chip-toggle').click()
    await expect(page.getByTestId('radar-select')).toBeVisible()
    await expect(page.getByTestId('raster-meta')).toBeVisible()
  })
})

test.describe('chip de identidad en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('el título deja de truncarse también en escritorio', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    const cut = await chipParts(page).title.evaluate(el => el.scrollWidth - el.clientWidth)
    expect(cut).toBeLessThanOrEqual(1)
    // El detalle sigue visible sin desplegar nada, como antes.
    await expect(page.getByTestId('raster-meta')).toBeVisible()
  })
})

/**
 * Regresiones del pase móvil de `LayersMenu.vue` (F5). Cifras medidas antes
 * del arreglo a 360 px de ancho, panel abierto:
 *  - el botón cerrar (✕) medía 29×32 px;
 *  - las filas de checkbox (satélite/fenómenos/viento/rayos, trayectorias,
 *    meso, suavizado, mostrar paleta) medían solo 20 px de alto — la etiqueta
 *    entera es el área clicable, pero su caja era más baja que el mínimo
 *    táctil;
 *  - los botones de acción (Celdas/Tendencia/VWP, preferencias, anotaciones,
 *    export, feedback) medían 34 px de alto.
 * Ninguno se solapaba ni se salía del viewport — eso ya estaba bien.
 */
async function rowBox(locator: Locator) {
  const r = await locator.evaluate((node) => {
    const row = node.closest('label, button') ?? node
    const b = row.getBoundingClientRect()
    return { x: b.x, y: b.y, width: b.width, height: b.height }
  })
  return r
}

const LAYERS_MENU_ROW_IDS = [
  'smooth-toggle',
  'show-palette-toggle',
  'sat-toggle',
  'layer-toggle-cells',
  'layer-toggle-track-past',
  'layer-toggle-track-future',
  'layer-toggle-meso',
  'layer-toggle-wind',
  'layer-toggle-lightning',
  'panel-open-cells',
  'panel-open-trend',
  'vwp-open',
  'prefs-open',
  'annotations-open',
  'export-open',
  'menu-feedback-open',
]

test.describe('menú de capas en móvil', () => {
  test.use({ viewport: PHONE })

  test('el panel abre a pantalla completa sin desbordar el viewport', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    await page.getByTestId('layers-menu-toggle').click()
    const panel = await box(page.getByTestId('layers-menu'))
    expect(panel.x).toBeGreaterThanOrEqual(0)
    expect(panel.x + panel.width).toBeLessThanOrEqual(PHONE.width)

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('el botón cerrar y las filas de capas tienen área táctil suficiente', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    await page.getByTestId('layers-menu-toggle').click()
    await expect(page.getByTestId('layers-menu')).toBeVisible()

    const close = await box(page.getByTestId('layers-menu-close'))
    expect(Math.min(close.width, close.height), `cerrar mide ${close.width}×${close.height}`).toBeGreaterThanOrEqual(MIN_TOUCH_PX)

    for (const id of LAYERS_MENU_ROW_IDS) {
      const locator = page.getByTestId(id)
      if (!await locator.isVisible()) continue
      const b = await rowBox(locator)
      expect(b.height, `fila ${id} mide ${b.height}px de alto`).toBeGreaterThanOrEqual(MIN_TOUCH_PX)
    }
  })
})

test.describe('menú de capas en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('los controles vuelven a su tamaño compacto, no se quedan agrandados', async ({ page }) => {
    await gotoViewer(page, series.times.at(-1)!)
    await page.getByTestId('layers-menu-toggle').click()
    await expect(page.getByTestId('layers-menu')).toBeVisible()

    // El arreglo móvil usa `md:` para revertir el alto — en escritorio no
    // debería quedar ningún control a 44 px si antes medía menos.
    const close = await box(page.getByTestId('layers-menu-close'))
    expect(close.height).toBeLessThan(MIN_TOUCH_PX)

    const smooth = await rowBox(page.getByTestId('smooth-toggle'))
    expect(smooth.height).toBeLessThan(MIN_TOUCH_PX)
  })
})
