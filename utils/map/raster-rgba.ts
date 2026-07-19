// Suavizado opcional de la capa raster (prueba, D?? pendiente en
// docs/decisiones.md si se confirma). Decodifica el COG por separado
// (geotiff.js no comparte decode con ol/source/GeoTIFF, ver spike),
// aplica blur gaussiano en espacio de color recto (evaluado contra
// bilineal solo — descartado, bordes seguían grano; gaussiano da forma
// orgánica real) y entrega la textura ya premultiplicada + bilineal de
// GPU para el resample de reproyección — no índices de nivel crudos,
// evitando fringing de color falso en bordes nodata/range-folded.
import { fromBlob } from 'geotiff'
import DataTile from 'ol/source/DataTile'
import TileGrid from 'ol/tilegrid/TileGrid'
import type { LevelColorTable } from '#shared/products'

export interface DecodedLevels {
  data: Uint8Array
  width: number
  height: number
  /** [minX, minY, maxX, maxY] en las unidades de la proyección AEQD del COG. */
  extent: [number, number, number, number]
}

export async function decodeLevels(blob: Blob): Promise<DecodedLevels> {
  const tiff = await fromBlob(blob)
  const image = await tiff.getImage()
  const width = image.getWidth()
  const height = image.getHeight()
  const [band] = await image.readRasters({ interleave: false }) as unknown as Uint8Array[]
  const extent = image.getBoundingBox() as [number, number, number, number]
  return { data: band, width, height, extent }
}

/** RGBA de alpha recto (no premultiplicado) — lo que espera ImageData/Canvas2D. */
export function buildStraightRgba(levels: Uint8Array, table: LevelColorTable): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(levels.length * 4)
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!
    const o = i * 4
    rgba[o] = table[level * 4]!
    rgba[o + 1] = table[level * 4 + 1]!
    rgba[o + 2] = table[level * 4 + 2]!
    rgba[o + 3] = table[level * 4 + 3]!
  }
  return rgba
}

/** Premultiplica alpha recto → requerido para filtrado bilineal de GPU sin halo de color falso. */
export function premultiply(straight: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(straight.length)
  for (let i = 0; i < straight.length; i += 4) {
    const a = straight[i + 3]!
    out[i] = (straight[i]! * a) / 255
    out[i + 1] = (straight[i + 1]! * a) / 255
    out[i + 2] = (straight[i + 2]! * a) / 255
    out[i + 3] = a
  }
  return out
}

/**
 * Blur gaussiano vía filtro nativo de Canvas2D (Skia/Chromium ya maneja
 * premultiplicación internamente para el compositing — por eso se opera
 * en alpha recto y se premultiplica DESPUÉS, no antes). `ctx.filter` no
 * aplica a putImageData (bypassa el pipeline de compositing), de ahí el
 * canvas intermedio + drawImage.
 */
export function gaussianBlurRgba(straight: Uint8ClampedArray, width: number, height: number, radiusPx: number): Uint8ClampedArray {
  const raw = new OffscreenCanvas(width, height)
  raw.getContext('2d')!.putImageData(new ImageData(straight as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0)

  const blurred = new OffscreenCanvas(width, height)
  const bctx = blurred.getContext('2d')!
  bctx.filter = `blur(${radiusPx}px)`
  bctx.drawImage(raw, 0, 0)

  return bctx.getImageData(0, 0, width, height).data
}

/**
 * Fuente RGBA suavizada (blur gaussiano en color recto + bilineal de GPU
 * al resamplear). Un solo tile cubre el raster entero (mismo esquema que
 * ol/source/GeoTIFF con estos COGs sin pirámide, ver spike). Usar con
 * smoothedRasterStyle().
 */
export async function createSmoothedRasterSource(
  blob: Blob,
  table: LevelColorTable,
  projCode: string,
  radiusPx = 4,
): Promise<DataTile> {
  const { data, width, height, extent } = await decodeLevels(blob)
  const straight = gaussianBlurRgba(buildStraightRgba(data, table), width, height, radiusPx)
  const rgba = premultiply(straight)

  const [minX, , maxX, maxY] = extent
  const tileGrid = new TileGrid({
    extent,
    origin: [minX, maxY],
    resolutions: [(maxX - minX) / width],
    tileSize: [width, height],
  })
  return new DataTile({
    loader: () => rgba,
    bandCount: 4,
    interpolate: true,
    projection: projCode,
    tileGrid,
    transition: 0,
  })
}
