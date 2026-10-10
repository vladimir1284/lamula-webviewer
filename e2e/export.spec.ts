// Exportación de la vista del mapa a PNG (F7.1), en modo fixture.
//
// Dos cosas que solo se pueden probar aquí y no en unit:
//  1. El CONTRATO DE DOM de OpenLayers del que depende el compositor. Si un
//     upgrade de `ol` cambia la forma de `.ol-layers`, el export dejaría de
//     ver capas en silencio; este canario falla antes.
//  2. Que el canvas no esté contaminado — la regresión de `crossOrigin` en
//     las fuentes de teselas (decisión 40).
//
// Hidratación (hallazgo documentado): abrir el menú, abrir el diálogo y
// descargar son clicks CON EFECTO — un solo click tras 'networkidle', jamás
// reintentos.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import { mesoVolume, products, rasters } from '../tests/helpers/derive'

const row = rasters.find(
  r => r.site_id === mesoVolume.site && r.vol_time === mesoVolume.volTime,
)!

const mnemonic = products.find(p => p.code === row.product_code)!.mnemonic

const url = (query: string) =>
  `/${row.site_id}/${row.product_code}/${isoToPath(row.vol_time)}?${query}`

async function openExportDialog(page: Page, query: string) {
  await page.goto(url(query))
  await expect(page.getByTestId('radar-map')).toHaveAttribute('data-raster-loaded', 'true', {
    timeout: 30_000,
  })
  await page.waitForLoadState('networkidle')
  await page.getByTestId('layers-menu-toggle').click()
  await page.getByTestId('export-open').click()
  await expect(page.getByTestId('export-dialog')).toBeVisible()
  // el render de la captura es asíncrono: el botón se habilita al terminar
  await expect(page.getByTestId('export-download')).toBeEnabled({ timeout: 30_000 })
}

/** píxeles no transparentes del canvas de previsualización */
function previewInk(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="export-preview"]')
    if (!c) return -1
    const ctx = c.getContext('2d')
    if (!ctx) return -1
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let n = 0
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
    return n
  })
}

test('canario: la forma de .ol-layers que asume el compositor sigue vigente', async ({ page }) => {
  await page.goto(url('layers=cells,meso,wind,lightning'))
  await expect(page.getByTestId('radar-map')).toHaveAttribute('data-raster-loaded', 'true', {
    timeout: 30_000,
  })
  await page.waitForLoadState('networkidle')

  const shape = await page.evaluate(() => {
    const layers = document.querySelector('[data-testid="radar-map"] .ol-layers')
    if (!layers) return null
    return [...layers.children].map((child) => {
      const first = child.firstElementChild
      const canvas = first instanceof HTMLCanvasElement
        ? first
        : (child instanceof HTMLCanvasElement ? child : null)
      return {
        direct: child instanceof HTMLCanvasElement,
        hasCanvas: !!canvas,
        className: child.className,
        transform: canvas?.style.transform ?? '',
        width: canvas?.style.width ?? '',
        intrinsic: canvas ? [canvas.width, canvas.height] : null,
      }
    })
  })

  expect(shape, 'no existe .ol-layers: el compositor no tiene de dónde leer').not.toBeNull()
  expect(shape!.length).toBeGreaterThan(0)
  // todo hijo aporta un canvas: si deja de ser así, layerCanvasOf() cae
  for (const child of shape!) {
    expect(child.hasCanvas, `hijo sin canvas: ${child.className}`).toBe(true)
    expect(child.intrinsic![0]).toBeGreaterThan(0)
  }
  // el canvas WebGL del raster declara su tamaño CSS (rama 2 del transform)
  expect(shape!.some(c => c.transform === '' && c.width !== '')).toBe(true)
  // Viento y rayos siguen siendo canvas SUELTOS dentro de .ol-layers y sin
  // transform — ahí es donde la receta oficial de OL metería NaN y los
  // descartaría en silencio. Desde F7.3 sí declaran tamaño CSS (hace falta
  // para poder subir el búfer a 2× en el export), así que el compositor los
  // resuelve por la rama 2; la rama 3 se mantiene como respaldo.
  const custom = await page.evaluate(() =>
    ['.wind-particle-canvas', '.lightning-canvas'].map((sel) => {
      const c = document.querySelector<HTMLCanvasElement>(sel)
      return c
        ? { found: true, inLayers: !!c.closest('.ol-layers'), transform: c.style.transform, width: c.style.width }
        : { found: false, inLayers: false, transform: '', width: '' }
    }),
  )
  for (const c of custom) {
    if (!c.found) continue
    expect(c.inLayers).toBe(true)
    expect(c.transform).toBe('')
    expect(c.width).toMatch(/^\d/)
  }
})

test('exporta un PNG con las capas visibles y lo descarga con nombre canónico', async ({ page }) => {
  await openExportDialog(page, 'layers=cells,meso,wind,lightning')

  expect(await previewInk(page)).toBeGreaterThan(1000)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-download').click(),
  ])

  expect(download.suggestedFilename()).toBe(
    `lamula_${row.site_id}_${mnemonic}_${isoToPath(row.vol_time)}Z.png`,
  )

  const path = await download.path()
  const bytes = readFileSync(path)
  // magic bytes de PNG
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  // ancho/alto del IHDR
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  expect(width).toBeGreaterThan(300)
  // con la franja (default) la imagen es MÁS ALTA que el mapa
  expect(height).toBeGreaterThan(0)
})

test('con mapa base encendido no se omite ninguna capa (guarda de CORS)', async ({ page }) => {
  await openExportDialog(page, 'base=osm')
  await expect(page.getByTestId('export-notice')).toHaveCount(0)
  await expect(page.getByTestId('export-error')).toHaveCount(0)
  expect(await previewInk(page)).toBeGreaterThan(1000)
})

// El tamaño CSS del mapa puede ser fraccionario (layout flex), así que el
// redondeo a píxeles enteros se hace una vez por resolución y 2× no es
// exactamente el doble de 1×: puede diferir en 1 px. Eso es correcto, no un
// bug — lo que importa es que no haya un factor mal aplicado.
test('la resolución 2× duplica la salida de 1× (±1 px de redondeo)', async ({ page }) => {
  await openExportDialog(page, 'base=off')

  const size = async () => {
    const text = await page.getByTestId('export-dialog').innerText()
    const m = text.match(/(\d+)\s*×\s*(\d+)\s*px/)
    return m ? { w: Number(m[1]), h: Number(m[2]) } : null
  }

  await page.getByTestId('export-scale-1').click()
  await expect(page.getByTestId('export-download')).toBeEnabled({ timeout: 30_000 })
  const one = await size()
  expect(one).not.toBeNull()

  await page.getByTestId('export-scale-2').click()
  await expect(page.getByTestId('export-download')).toBeEnabled({ timeout: 30_000 })
  await expect.poll(async () => (await size())?.w).toBeGreaterThan(one!.w)
  const two = (await size())!
  expect(Math.abs(two.w - one!.w * 2)).toBeLessThanOrEqual(1)
  expect(Math.abs(two.h - one!.h * 2)).toBeLessThanOrEqual(1)
})

test('la franja crece la imagen por debajo; sin datos queda al tamaño del mapa', async ({ page }) => {
  await openExportDialog(page, 'base=off')

  const height = async () => {
    const m = (await page.getByTestId('export-dialog').innerText()).match(/(\d+)\s*×\s*(\d+)\s*px/)
    return m ? Number(m[2]) : null
  }

  const withBar = await height()
  await page.getByTestId('export-chrome-none').click()
  await expect.poll(height).toBeLessThan(withBar!)

  const none = await height()

  await page.getByTestId('export-chrome-overlay').click()
  await expect(page.getByTestId('export-download')).toBeEnabled({ timeout: 30_000 })
  // superpuesto no añade alto: mismo canvas que sin datos, el del viewport
  await expect.poll(height).toBe(none)
  expect(none).toBeLessThan(withBar!)
})

// Verificación que el plan de F7 pedía hacer en navegador: todas las capas
// del frame-pool comparten UN canvas WebGL y un render target, así que "gana
// la opacidad de la última capa para todo el target" era un modo de fallo
// plausible. Si el slider fuese un no-op, el export lo reproduciría fielmente
// y alguien culparía al exportador.
test('el export respeta la opacidad del raster', async ({ page }) => {
  // dos cargas completas de mapa + captura en un solo test
  test.setTimeout(120_000)
  const grab = async (query: string) => {
    await openExportDialog(page, query)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ])
    return readFileSync(await download.path())
  }

  const opaque = await grab('base=off&opacity=1')
  const faint = await grab('base=off&opacity=0.2')
  expect(faint.equals(opaque)).toBe(false)
})

test('dos exports seguidos de la misma vista dan el MISMO fichero (puerta F7.1)', async ({ page }) => {
  await openExportDialog(page, 'base=off')

  const grab = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ])
    return readFileSync(await download.path())
  }

  const a = await grab()
  const b = await grab()
  expect(a.length).toBeGreaterThan(1000)
  expect(b.equals(a)).toBe(true)
})

// F7.2: la marca de agua se dibuja sobre el ÁREA DEL MAPA en los tres modos
// de chrome, así que su interruptor tiene que cambiar los bytes también con
// el chrome apagado.
test('la marca de agua se puede apagar y cambia la imagen', async ({ page }) => {
  test.setTimeout(120_000)
  await openExportDialog(page, 'base=off')
  await page.getByTestId('export-chrome-none').click()
  await expect(page.getByTestId('export-download')).toBeEnabled({ timeout: 30_000 })

  const grab = async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ])
    return readFileSync(await download.path())
  }

  const conMarca = await grab()
  await page.getByTestId('export-part-watermark').uncheck()
  await expect(page.getByTestId('export-download')).toBeEnabled({ timeout: 30_000 })
  const sinMarca = await grab()

  expect(sinMarca.equals(conMarca)).toBe(false)
  // sin foto cargada, incluir el avatar no es una opción activable
  await expect(page.getByTestId('export-part-avatar')).toBeDisabled()
})
