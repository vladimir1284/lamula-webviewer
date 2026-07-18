// Suavizado opcional de la capa raster (prueba, D?? pendiente en
// docs/decisiones.md si se confirma). Decodifica el COG por separado
// (geotiff.js no comparte decode con ol/source/GeoTIFF, ver spike) y
// construye una textura RGBA premultiplicada para que el filtrado
// bilineal de la GPU mezcle color (fade a transparente en bordes de
// nodata/range-folded) en vez de mezclar índices de nivel crudos.
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

/** RGBA premultiplicado (alpha 0-255) — requerido para filtrado bilineal sin halo de color falso. */
export function buildPremultipliedRgba(levels: Uint8Array, table: LevelColorTable): Uint8Array {
  const rgba = new Uint8Array(levels.length * 4)
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!
    const r = table[level * 4]!
    const g = table[level * 4 + 1]!
    const b = table[level * 4 + 2]!
    const a = table[level * 4 + 3]!
    const o = i * 4
    rgba[o] = (r * a) / 255
    rgba[o + 1] = (g * a) / 255
    rgba[o + 2] = (b * a) / 255
    rgba[o + 3] = a
  }
  return rgba
}

/**
 * Fuente RGBA premultiplicada + filtrado bilineal de GPU. Un solo tile
 * cubre el raster entero (mismo esquema que ol/source/GeoTIFF con estos
 * COGs sin pirámide, ver spike). Usar con smoothedRasterStyle().
 */
export async function createSmoothedRasterSource(
  blob: Blob,
  table: LevelColorTable,
  projCode: string,
): Promise<DataTile> {
  const { data, width, height, extent } = await decodeLevels(blob)
  const rgba = buildPremultipliedRgba(data, table)
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
