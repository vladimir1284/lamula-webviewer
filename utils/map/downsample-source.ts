// Radio de suavizado (decisión 33): además del lerp 1-texel de
// raster-style.ts (interpolatedPaletteStyle + `interpolate` en la fuente),
// para radios > 1 se re-muestrea el nivel crudo del COG a una grilla más
// gruesa con geotiff.js (resampleMethod bilinear) y se re-empaqueta como un
// GeoTIFF sintético en memoria — se sirve exactamente igual que el COG
// original (`ol/source/GeoTIFF`, mismo `normalize:false` + `interpolate:true`),
// sin tocar tileGrid/reproyección a mano.
//
// Enfoques previos descartados:
// - `ol/source/DataTile` con tileGrid manual (1 solo tile, 1 sola
//   resolución): reproyectaba con `ReprojDataTile` de OL sin la malla de
//   resoluciones auxiliar que `ol/source/GeoTIFF` siempre agrega (ver su
//   `configure_`: pad a ≥3 resoluciones) — producía una retícula regular de
//   artefactos (costuras de la triangulación de reproyección) visible en
//   TODO el raster, no solo cerca de celdas.
// - `geotiff.writeArrayBuffer()` (el writer de geotiff.js) para el GeoTIFF
//   sintético: correcto pero demasiado lento para un COG de este tamaño
//   (radio 2 sobre un COG 3680×3680 → ~7s, radio 1 extrapola a >40s —
//   inaceptable para un control interactivo). Encoder propio abajo, mismo
//   tag set mínimo verificado por round-trip con geotiff.js, sin el
//   overhead por-píxel del writer genérico: <15ms incluso al tamaño nativo.
import { fromArrayBuffer } from 'geotiff'

// TIFF mínimo: 1 IFD, 1 strip sin comprimir, georef vía ModelPixelScale +
// ModelTiepoint (sin GeoKeys — `ol/source/GeoTIFF` recibe la `projection`
// explícita por opción del constructor, nunca lee geokeys del archivo).
function encodeMinimalGeoTiff(
  width: number,
  height: number,
  band: Uint8Array | Uint16Array | Float32Array,
  originX: number,
  originY: number,
  resX: number,
  resY: number,
): ArrayBuffer {
  let bitsPerSample: number
  let sampleFormat: number
  if (band instanceof Float32Array) { bitsPerSample = 32; sampleFormat = 3 }
  else if (band instanceof Uint16Array) { bitsPerSample = 16; sampleFormat = 1 }
  else { bitsPerSample = 8; sampleFormat = 1 }

  const tagCount = 13 // debe quedar en orden ascendente de tag (requisito TIFF)
  const headerSize = 8
  const ifdSize = 2 + tagCount * 12 + 4
  const ifdStart = headerSize
  let cursor = ifdStart + ifdSize
  const modelPixelScaleOffset = cursor; cursor += 24
  const modelTiepointOffset = cursor; cursor += 48
  const pixelDataOffset = cursor
  const total = pixelDataOffset + band.byteLength

  const buf = new ArrayBuffer(total)
  const view = new DataView(buf)

  view.setUint8(0, 0x49); view.setUint8(1, 0x49) // 'II' — little-endian
  view.setUint16(2, 42, true)
  view.setUint32(4, ifdStart, true)

  let p = ifdStart
  view.setUint16(p, tagCount, true); p += 2

  function entry(tag: number, type: number, count: number, writeValue: (valueOffset: number) => void) {
    view.setUint16(p, tag, true)
    view.setUint16(p + 2, type, true)
    view.setUint32(p + 4, count, true)
    writeValue(p + 8)
    p += 12
  }

  entry(256, 4, 1, o => view.setUint32(o, width, true)) // ImageWidth (LONG)
  entry(257, 4, 1, o => view.setUint32(o, height, true)) // ImageLength (LONG)
  entry(258, 3, 1, o => view.setUint16(o, bitsPerSample, true)) // BitsPerSample (SHORT)
  entry(259, 3, 1, o => view.setUint16(o, 1, true)) // Compression = none
  entry(262, 3, 1, o => view.setUint16(o, 1, true)) // PhotometricInterpretation = BlackIsZero
  entry(273, 4, 1, o => view.setUint32(o, pixelDataOffset, true)) // StripOffsets
  entry(277, 3, 1, o => view.setUint16(o, 1, true)) // SamplesPerPixel = 1 (1 banda)
  entry(278, 4, 1, o => view.setUint32(o, height, true)) // RowsPerStrip = alto completo (1 strip)
  entry(279, 4, 1, o => view.setUint32(o, band.byteLength, true)) // StripByteCounts
  entry(284, 3, 1, o => view.setUint16(o, 1, true)) // PlanarConfiguration
  entry(339, 3, 1, o => view.setUint16(o, sampleFormat, true)) // SampleFormat
  entry(33550, 12, 3, (o) => { // ModelPixelScale (DOUBLE×3)
    view.setUint32(o, modelPixelScaleOffset, true)
    view.setFloat64(modelPixelScaleOffset, resX, true)
    view.setFloat64(modelPixelScaleOffset + 8, resY, true)
    view.setFloat64(modelPixelScaleOffset + 16, 0, true)
  })
  entry(33922, 12, 6, (o) => { // ModelTiepoint (DOUBLE×6): raster (0,0,0) → (originX,originY,0)
    view.setUint32(o, modelTiepointOffset, true)
    view.setFloat64(modelTiepointOffset, 0, true)
    view.setFloat64(modelTiepointOffset + 8, 0, true)
    view.setFloat64(modelTiepointOffset + 16, 0, true)
    view.setFloat64(modelTiepointOffset + 24, originX, true)
    view.setFloat64(modelTiepointOffset + 32, originY, true)
    view.setFloat64(modelTiepointOffset + 40, 0, true)
  })
  view.setUint32(p, 0, true) // next IFD = ninguno

  new Uint8Array(buf).set(new Uint8Array(band.buffer, band.byteOffset, band.byteLength), pixelDataOffset)
  return buf
}

export async function buildDownsampledCogBlob(blob: Blob, factor: number): Promise<Blob> {
  const buffer = await blob.arrayBuffer()
  const tiff = await fromArrayBuffer(buffer)
  const image = await tiff.getImage()

  const width = Math.max(1, Math.round(image.getWidth() / factor))
  const height = Math.max(1, Math.round(image.getHeight() / factor))

  const origin = image.getOrigin()
  const resolution = image.getResolution()

  const rasters = await image.readRasters({ width, height, resampleMethod: 'bilinear' })
  const band = rasters[0] as Uint8Array | Uint16Array | Float32Array

  const out = encodeMinimalGeoTiff(
    width,
    height,
    band,
    origin[0],
    origin[1],
    resolution[0] * factor,
    -resolution[1] * factor,
  )
  return new Blob([out])
}
