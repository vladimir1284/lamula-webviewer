import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fromArrayBuffer } from 'geotiff'
import { describe, expect, it } from 'vitest'
import { buildDownsampledCogBlob } from '../../utils/map/downsample-source'

const FIXTURE = join(__dirname, '../fixtures/cogs/AMX_N0B_20260706_154517.tif')

function loadBlob(): Blob {
  const buf = readFileSync(FIXTURE)
  return new Blob([buf])
}

describe('buildDownsampledCogBlob', () => {
  it('GeoTIFF sintético: tamaño reducido por el factor, georef consistente con el original', async () => {
    const buffer = readFileSync(FIXTURE).buffer
    const nativeTiff = await fromArrayBuffer(buffer as ArrayBuffer)
    const nativeImage = await nativeTiff.getImage()
    const nativeWidth = nativeImage.getWidth()
    const nativeHeight = nativeImage.getHeight()
    const nativeOrigin = nativeImage.getOrigin()
    const nativeResolution = nativeImage.getResolution()

    const outBlob = await buildDownsampledCogBlob(loadBlob(), 2)
    const outBuffer = await outBlob.arrayBuffer()
    const outTiff = await fromArrayBuffer(outBuffer)
    const outImage = await outTiff.getImage()

    expect(outImage.getWidth()).toBe(Math.round(nativeWidth / 2))
    expect(outImage.getHeight()).toBe(Math.round(nativeHeight / 2))
    expect(outImage.getOrigin()).toEqual(nativeOrigin)
    // resolución 2x más gruesa en ambos ejes, mismo signo (Y negativo, north-up)
    expect(outImage.getResolution()[0]).toBeCloseTo(nativeResolution[0] * 2, 6)
    expect(outImage.getResolution()[1]).toBeCloseTo(nativeResolution[1] * 2, 6)
  })

  it('factor 1: tamaño igual al nativo (sin reducción)', async () => {
    const buffer = readFileSync(FIXTURE).buffer
    const nativeTiff = await fromArrayBuffer(buffer as ArrayBuffer)
    const nativeImage = await nativeTiff.getImage()

    const outBlob = await buildDownsampledCogBlob(loadBlob(), 1)
    const outTiff = await fromArrayBuffer(await outBlob.arrayBuffer())
    const outImage = await outTiff.getImage()

    expect(outImage.getWidth()).toBe(nativeImage.getWidth())
    expect(outImage.getHeight()).toBe(nativeImage.getHeight())
  })

  it('conserva niveles reales (no todo nodata) — hay eco en este fixture golden', async () => {
    const outBlob = await buildDownsampledCogBlob(loadBlob(), 4)
    const outTiff = await fromArrayBuffer(await outBlob.arrayBuffer())
    const outImage = await outTiff.getImage()
    const rasters = await outImage.readRasters()
    const band = rasters[0] as ArrayLike<number>
    let max = 0
    for (let i = 0; i < band.length; i++) max = Math.max(max, band[i]!)
    expect(max).toBeGreaterThan(1)
  })
})
