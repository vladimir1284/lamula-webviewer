// Anotaciones sobre el mapa (F7.2), en modo fixture.
//
// Lo que solo se puede probar aquí: que el trazo queda clavado a la
// GEOGRAFÍA y no a píxeles — se dibuja, se panea el mapa y la tinta tiene
// que haberse movido con el terreno. Y que sobrevive a una recarga.
//
// Hidratación (hallazgo documentado): abrir el menú y entrar al modo
// anotación son clicks CON EFECTO — un solo click tras 'networkidle'.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import { mesoVolume, rasters } from '../tests/helpers/derive'

const row = rasters.find(
  r => r.site_id === mesoVolume.site && r.vol_time === mesoVolume.volTime,
)!

// base=off: fondo determinista y ningún amarillo del mapa base que confunda
// el conteo de píxeles de la anotación
const url = `/${row.site_id}/${row.product_code}/${isoToPath(row.vol_time)}?base=off`

/** amarillo de la paleta de anotaciones (#facc15) */
const INK = { r: 250, g: 204, b: 21 }

async function mapBox(page: Page) {
  const box = await page.getByTestId('radar-map').boundingBox()
  if (!box) throw new Error('el mapa no tiene caja')
  return box
}

/**
 * Centroide de la tinta de la anotación, en px CSS del viewport. Busca sobre
 * los canvas de `.ol-layers`: la capa de anotaciones es vectorial (Canvas2D),
 * nunca contaminada, así que se puede leer directo.
 */
async function inkCentroid(page: Page, ink: typeof INK) {
  return page.evaluate(({ ink }) => {
    const root = document.querySelector('[data-testid="radar-map"]')
    const layers = root?.querySelector('.ol-layers')
    if (!root || !layers) return null
    const viewportWidth = (root as HTMLElement).clientWidth
    let best: { count: number, x: number, y: number } | null = null

    for (const child of layers.children) {
      const first = child.firstElementChild
      const canvas = first instanceof HTMLCanvasElement
        ? first
        : (child instanceof HTMLCanvasElement ? child : null)
      if (!canvas || canvas.width === 0) continue
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      let data: Uint8ClampedArray
      try {
        data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      }
      catch {
        continue // canvas contaminado (teselas): no es el de anotaciones
      }
      let count = 0
      let sx = 0
      let sy = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 200) continue
        if (Math.abs(data[i]! - ink.r) > 40) continue
        if (Math.abs(data[i + 1]! - ink.g) > 40) continue
        if (Math.abs(data[i + 2]! - ink.b) > 40) continue
        const px = (i / 4) % canvas.width
        const py = Math.floor((i / 4) / canvas.width)
        count++
        sx += px
        sy += py
      }
      if (count > 0 && (!best || count > best.count)) {
        // px de búfer → px CSS. OL reutiliza el canvas del frame anterior y
        // lo reposiciona con `style.transform` (la rama 1 del compositor,
        // ver utils/export/transform.ts): ignorar esa matriz deja el
        // centroide desplazado varios px tras un render incremental.
        const bx = sx / count
        const by = sy / count
        const parsed = canvas.style.transform.match(/matrix\(([^)]+)\)/)
        if (parsed) {
          const m = parsed[1]!.split(',').map(Number)
          best = { count, x: m[0]! * bx + m[2]! * by + m[4]!, y: m[1]! * bx + m[3]! * by + m[5]! }
        }
        else {
          const scale = canvas.width / viewportWidth
          best = { count, x: bx / scale, y: by / scale }
        }
      }
    }
    return best
  }, { ink })
}

/**
 * Mide SIEMPRE con el modo de dibujo apagado y el puntero lejos: `Modify`
 * pinta un vértice blanco bajo el cursor que tapa parte del trazo y corre el
 * centroide ~19 px (medido). Es un artefacto de la medición, no del dibujo.
 */
async function leaveAnnotationMode(page: Page) {
  await page.getByTestId('annotation-close').click()
  await expect(page.getByTestId('annotation-bar')).toHaveCount(0)
  await page.mouse.move(2, 2)
  await page.waitForTimeout(300)
}

async function enterAnnotationMode(page: Page) {
  await page.goto(url)
  await expect(page.getByTestId('radar-map')).toHaveAttribute('data-raster-loaded', 'true', {
    timeout: 30_000,
  })
  await page.waitForLoadState('networkidle')
  await page.getByTestId('layers-menu-toggle').click()
  await page.getByTestId('annotations-open').click()
  await expect(page.getByTestId('annotation-bar')).toBeVisible()
  await page.getByTestId(`annotation-color-${'#facc15'.slice(1)}`).click()
}

function stored(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('lamula:annotations')
    return raw ? JSON.parse(raw) as { v: number, bySite: Record<string, unknown[]> } : null
  })
}

test('una flecha se guarda por sitio y queda clavada a la geografía', async ({ page }) => {
  test.setTimeout(90_000)
  await enterAnnotationMode(page)
  const box = await mapBox(page)

  const from = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.45 }
  const to = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.45 }
  await page.mouse.click(from.x, from.y)
  await page.mouse.click(to.x, to.y)

  const saved = await stored(page)
  expect(saved?.v).toBe(1)
  const items = saved!.bySite[row.site_id] as { kind: string, coords: number[][] }[]
  expect(items).toHaveLength(1)
  expect(items[0]!.kind).toBe('arrow')
  expect(items[0]!.coords).toHaveLength(2)

  // salir del modo dibujo: con el Draw activo, arrastrar dibujaría en vez de panear
  await leaveAnnotationMode(page)

  const drawn = await inkCentroid(page, INK)
  expect(drawn, 'la anotación no pintó tinta visible').not.toBeNull()
  const expectedX = (from.x + to.x) / 2 - box.x
  expect(Math.abs(drawn!.x - expectedX)).toBeLessThan(25)

  // paneo de 120 px a la derecha: la tinta tiene que viajar con el terreno
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x + 120, center.y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(800)

  const moved = await inkCentroid(page, INK)
  expect(moved).not.toBeNull()
  expect(moved!.x - drawn!.x).toBeGreaterThan(100)
  expect(moved!.x - drawn!.x).toBeLessThan(140)
  expect(Math.abs(moved!.y - drawn!.y)).toBeLessThan(12)
})

test('las anotaciones sobreviven a una recarga', async ({ page }) => {
  test.setTimeout(90_000)
  await enterAnnotationMode(page)
  const box = await mapBox(page)
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5)
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await leaveAnnotationMode(page)
  const before = await inkCentroid(page, INK)
  expect(before).not.toBeNull()

  await page.reload()
  await expect(page.getByTestId('radar-map')).toHaveAttribute('data-raster-loaded', 'true', {
    timeout: 30_000,
  })
  await page.waitForLoadState('networkidle')

  const after = await inkCentroid(page, INK)
  expect(after, 'la anotación no volvió tras recargar').not.toBeNull()
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(12)
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(12)
})

test('deshacer y borrar todo limpian el mapa y el almacenamiento', async ({ page }) => {
  test.setTimeout(90_000)
  await enterAnnotationMode(page)
  const box = await mapBox(page)

  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4)
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4)
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.6)
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.6)
  expect((await stored(page))!.bySite[row.site_id]).toHaveLength(2)

  await page.getByTestId('annotation-undo').click()
  expect((await stored(page))!.bySite[row.site_id]).toHaveLength(1)

  await page.getByTestId('annotation-clear').click()
  // sin anotaciones la clave se borra entera, no queda un objeto vacío
  expect(await stored(page)).toBeNull()
  expect(await inkCentroid(page, INK)).toBeNull()
})

test('el rótulo exige texto antes de marcar el punto', async ({ page }) => {
  test.setTimeout(90_000)
  await enterAnnotationMode(page)
  const box = await mapBox(page)

  await page.getByTestId('annotation-tool-text').click()
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
  expect(await stored(page)).toBeNull() // sin rótulo no se crea nada

  await page.getByTestId('annotation-text').fill('eco gancho')
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
  const items = (await stored(page))!.bySite[row.site_id] as { kind: string, text: string }[]
  expect(items).toHaveLength(1)
  expect(items[0]!.kind).toBe('text')
  expect(items[0]!.text).toBe('eco gancho')
})

// La capa de anotaciones es una VectorLayer real de OL, así que al compositor
// del export le llega por la rama 1 de layerDrawTransform sin que
// utils/export/ sepa nada de ella. Esto lo verifica de punta a punta.
test('la anotación entra en la imagen exportada', async ({ page }) => {
  test.setTimeout(90_000)
  await enterAnnotationMode(page)
  const box = await mapBox(page)
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5)
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await leaveAnnotationMode(page)

  await page.getByTestId('layers-menu-toggle').click()
  await page.getByTestId('export-open').click()
  await expect(page.getByTestId('export-download')).toBeEnabled({ timeout: 30_000 })

  const yellow = await page.evaluate(({ ink }) => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="export-preview"]')
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return -1
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let n = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 200) continue
      if (Math.abs(data[i]! - ink.r) > 40) continue
      if (Math.abs(data[i + 1]! - ink.g) > 40) continue
      if (Math.abs(data[i + 2]! - ink.b) > 40) continue
      n++
    }
    return n
  }, { ink: INK })

  expect(yellow).toBeGreaterThan(5)
})
