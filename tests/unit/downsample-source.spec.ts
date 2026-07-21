import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fromArrayBuffer } from 'geotiff'
import { describe, expect, it } from 'vitest'
import { buildDownsampledDataTile } from '../../utils/map/downsample-source'

const FIXTURE = join(__dirname, '../fixtures/cogs/AMX_N0B_20260706_154517.tif')

function loadBlob(): Blob {
  const buf = readFileSync(FIXTURE)
  return new Blob([buf])
}

describe('buildDownsampledDataTile', () => {
  it('tileGrid: 1 tile, tamaño reducido por el factor, anclado al bbox real del COG', async () => {
    const buffer = readFileSync(FIXTURE).buffer
    const tiff = await fromArrayBuffer(buffer as ArrayBuffer)
    const image = await tiff.getImage()
    const nativeWidth = image.getWidth()
    const nativeHeight = image.getHeight()
    const bbox = image.getBoundingBox() as [number, number, number, number]

    const source = await buildDownsampledDataTile(loadBlob(), 2, 'EPSG:3857')
    const tileGrid = source.getTileGrid()!

    expect(tileGrid.getExtent()).toEqual(bbox)
    expect(tileGrid.getTileSize(0)).toEqual([
      Math.round(nativeWidth / 2),
      Math.round(nativeHeight / 2),
    ])
    expect(tileGrid.getResolutions()).toHaveLength(1)
  })

  it('factor 1: tamaño igual al nativo (sin reducción)', async () => {
    const buffer = readFileSync(FIXTURE).buffer
    const tiff = await fromArrayBuffer(buffer as ArrayBuffer)
    const image = await tiff.getImage()

    const source = await buildDownsampledDataTile(loadBlob(), 1, 'EPSG:3857')
    const tileGrid = source.getTileGrid()!

    expect(tileGrid.getTileSize(0)).toEqual([image.getWidth(), image.getHeight()])
  })

  it('bandCount 1 e interpolate activado (radio actúa sobre la grilla reducida)', async () => {
    const source = await buildDownsampledDataTile(loadBlob(), 4, 'EPSG:3857')
    expect(source.getInterpolate()).toBe(true)
  })

  // Canario: si el loader vuelve a devolver el TypedArray crudo del TIFF
  // (Uint8Array) en vez de Float32Array, WebGL sube la textura como
  // UNSIGNED_BYTE normalizada a [0,1] — el nivel crudo (0-255) le llega al
  // estilo dividido por 255 y el raster queda invisible sin ningún error
  // (bug real encontrado por verificación visual, no por tests — decisión 33).
  it('la data del tile es Float32Array con niveles crudos sin normalizar', async () => {
    const source = await buildDownsampledDataTile(loadBlob(), 2, 'EPSG:3857')
    const tile = source.getTile(0, 0, 0, 1, source.getProjection()!)!
    const data = await new Promise<unknown>((resolve, reject) => {
      tile.addEventListener('change', () => {
        if (tile.getState() === 2) resolve((tile as unknown as { getData: () => unknown }).getData())
        if (tile.getState() === 3) reject(new Error('tile load error'))
      })
      tile.load()
    })
    expect(data).toBeInstanceOf(Float32Array)
    // al menos un nivel > 1 crudo (nunca normalizado a [0,1]) — hay eco real
    // en este fixture golden (AMX N0B, decisión 10)
    let max = 0
    for (const v of data as Float32Array) max = Math.max(max, v)
    expect(max).toBeGreaterThan(1)
  })
})
