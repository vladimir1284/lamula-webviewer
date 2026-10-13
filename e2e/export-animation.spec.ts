// Exportación animada (F7.3), en modo fixture.
//
// Lo que solo se puede probar aquí: que el reloj inyectado hace DETERMINISTA
// una captura que por defecto no lo es. `renderSync()` estampa
// `frameState.time = Date.now()` (ol/Map.js), así que sin la inyección de
// fase de rayos, el sub-paso del viento y la resiembra de partículas al
// entrar en modo export, dos GIF de la misma vista nunca coincidirían.
//
// Los tiempos son los medidos en este contenedor (ver decisión 41): 2 núcleos
// y WebGL por SwiftShader. Una tirada de 20 frames cuesta segundos, no
// milisegundos — los timeouts generosos no son dejadez.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import { mesoVolume, products, rasters } from '../tests/helpers/derive'

const row = rasters.find(
  r => r.site_id === mesoVolume.site && r.vol_time === mesoVolume.volTime,
)!
const mnemonic = products.find(p => p.code === row.product_code)!.mnemonic

const READY_MS = 30_000

test.describe.configure({ timeout: 240_000 })

const url = (query: string) =>
  `/${row.site_id}/${row.product_code}/${isoToPath(row.vol_time)}?${query}`

async function openExportDialog(page: Page, query: string) {
  await page.goto(url(query))
  await expect(page.getByTestId('radar-map')).toHaveAttribute('data-raster-loaded', 'true', {
    timeout: READY_MS,
  })
  await page.waitForLoadState('networkidle')
  // clicks CON EFECTO: uno solo tras networkidle, nunca reintentos
  await page.getByTestId('layers-menu-toggle').click()
  await page.getByTestId('export-open').click()
  await expect(page.getByTestId('export-dialog')).toBeVisible()
  await expect(page.getByTestId('export-download')).toBeEnabled({ timeout: READY_MS })
}

/** Genera la animación y devuelve los bytes del fichero descargado. */
async function generateGif(page: Page): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    page.getByTestId('export-anim-run').click(),
  ])
  expect(download.suggestedFilename()).toBe(
    `lamula_${row.site_id}_${mnemonic}_${isoToPath(row.vol_time)}Z.gif`,
  )
  return readFileSync(await download.path())
}

/**
 * Recorre los bloques del GIF y cuenta descriptores de imagen. Buscar el byte
 * 0x2C a ojo daría falsos positivos dentro de los datos LZW: hay que caminar
 * la estructura.
 */
function gifFrameCount(bytes: Buffer): number {
  const packed = bytes[10]!
  let p = 13
  if (packed & 0x80) p += 3 * (2 << (packed & 7)) // tabla de color global
  let frames = 0
  while (p < bytes.length) {
    const block = bytes[p]!
    if (block === 0x3B) break // trailer
    if (block === 0x21) { // extensión: etiqueta + sub-bloques
      p += 2
      while (bytes[p] !== 0) p += bytes[p]! + 1
      p += 1
      continue
    }
    if (block === 0x2C) { // descriptor de imagen
      frames += 1
      const localFlags = bytes[p + 9]!
      p += 10
      if (localFlags & 0x80) p += 3 * (2 << (localFlags & 7)) // tabla local
      p += 1 // tamaño mínimo de código LZW
      while (bytes[p] !== 0) p += bytes[p]! + 1
      p += 1
      continue
    }
    break // byte inesperado: estructura rota
  }
  return frames
}

test('GIF del bucle de rayos: cabecera, bucle infinito y un frame por fase', async ({ page }) => {
  await openExportDialog(page, 'base=off&layers=wind,lightning')

  // sin pool de animación (nunca se pulsó play) solo cabe el bucle de fases
  await expect(page.getByTestId('export-anim-phase')).toHaveAttribute('aria-pressed', 'true')

  const bytes = await generateGif(page)

  expect(bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a')
  // extensión Netscape = bucle infinito; sin ella el GIF se congela al final
  expect(bytes.includes(Buffer.from('NETSCAPE2.0', 'latin1'))).toBe(true)
  // PHASE_FRAMES en components/ExportDialog.vue
  expect(gifFrameCount(bytes)).toBe(20)

  // ancho/alto del descriptor de pantalla lógica (little endian)
  const width = bytes.readUInt16LE(6)
  const height = bytes.readUInt16LE(8)
  expect(width).toBeGreaterThan(100)
  expect(width).toBeLessThanOrEqual(960) // GIF_MAX_WIDTH
  expect(height).toBeGreaterThan(100)

  // presupuesto acordado en el plan de F7
  expect(bytes.length).toBeLessThan(8 * 1024 * 1024)

  await expect(page.getByTestId('export-anim-notice')).toContainText('20 frames')
  await expect(page.getByTestId('export-error')).toHaveCount(0)
})

// LA puerta de F7.3. Cubre de una vez la semilla del viento (resembrada al
// entrar en modo export), la fase de rayos inyectada, el sub-paso de dt y el
// determinismo del encoder. Con el mapa base apagado no hay teselas de red
// que puedan llegar en distinto orden.
test('dos GIF seguidos de la misma vista son byte-idénticos', async ({ page }) => {
  await openExportDialog(page, 'base=off&layers=wind,lightning')

  const first = await generateGif(page)
  await expect(page.getByTestId('export-anim-run')).toBeEnabled({ timeout: READY_MS })
  const second = await generateGif(page)

  expect(second.length).toBe(first.length)
  expect(second.equals(first)).toBe(true)
})

// Serie con varios volúmenes: el caso BYX con meso solo tiene UN raster de su
// producto ese día, así que no da secuencia. De los 6 volúmenes de AMX/153
// solo el último tiene COG golden (el resto da 404 por diseño, ver CLAUDE.md):
// esos frames salen en blanco, que es exactamente lo que se ve en pantalla.
const seqRows = rasters
  .filter(r => r.site_id === 'AMX' && r.product_code === 153)
  .sort((a, b) => a.vol_time.localeCompare(b.vol_time))
const seqRow = seqRows.at(-1)!
const seqMnemonic = products.find(p => p.code === seqRow.product_code)!.mnemonic

test('la secuencia del radar exige haber reproducido la animación', async ({ page }) => {
  const seqUrl = `/${seqRow.site_id}/${seqRow.product_code}/${isoToPath(seqRow.vol_time)}?base=off`
  await page.goto(seqUrl)
  await expect(page.getByTestId('radar-map')).toHaveAttribute('data-raster-loaded', 'true', {
    timeout: READY_MS,
  })
  await page.waitForLoadState('networkidle')

  await page.getByTestId('layers-menu-toggle').click()
  await page.getByTestId('export-open').click()
  // sin pool: el botón de secuencia está deshabilitado y se explica por qué
  await expect(page.getByTestId('export-anim-sequence')).toBeDisabled()
  await expect(page.getByTestId('export-dialog')).toContainText('reproduce primero la animación')
  await page.getByTestId('export-close').click()

  // arrancar la animación crea el pool; pausar deja los frames quietos
  await page.getByTestId('anim-play').click()
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Pausar', {
    timeout: READY_MS,
  })
  await page.getByTestId('anim-play').click()
  await expect(page.getByTestId('anim-play')).toHaveAttribute('aria-label', 'Reproducir', {
    timeout: READY_MS,
  })

  // abrir el diálogo cierra el menú de capas: hay que volver a desplegarlo
  await page.getByTestId('layers-menu-toggle').click()
  await page.getByTestId('export-open').click()
  await expect(page.getByTestId('export-anim-sequence')).toBeEnabled()
  await expect(page.getByTestId('export-anim-sequence')).toHaveAttribute('aria-pressed', 'true')

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    page.getByTestId('export-anim-run').click(),
  ])
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^lamula_${seqRow.site_id}_${seqMnemonic}_\\d{8}T\\d{6}Z\\.gif$`),
  )
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a')
  // un frame de salida por volumen de la ventana de animación
  expect(gifFrameCount(bytes)).toBe(seqRows.length)
})
