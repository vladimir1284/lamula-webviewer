// Radio de suavizado (decisión 33): además del lerp 1-texel de
// raster-style.ts (interpolatedPaletteStyle + `interpolate` en la fuente),
// para radios > 1 se re-muestrea el nivel crudo del COG a una grilla más
// gruesa con geotiff.js (resampleMethod bilinear) y se sirve como
// `ol/source/DataTile` con `interpolate: true` — el mismo lerp de GPU pasa
// a actuar sobre un paso de grilla más ancho, dando un radio de curvatura
// mayor sin pipeline de canvas ni segunda pasada de decode+premultiply
// (la opción descartada en D32). Un solo tile (grilla del COG no es
// piramidal): tileGrid manual anclado al bbox del propio GeoTIFF, no al
// extent por defecto de la proyección registrada.
// Caveat de D32 se agrava: nivel 1 (range folded) es categórico, promediarlo
// con dBZ real da un degradado falso más ancho que con el radio 1-texel.
import { fromArrayBuffer } from 'geotiff'
import DataTileSource from 'ol/source/DataTile'
import TileGrid from 'ol/tilegrid/TileGrid'

export async function buildDownsampledDataTile(
  blob: Blob,
  factor: number,
  projCode: string,
): Promise<DataTileSource> {
  const buffer = await blob.arrayBuffer()
  const tiff = await fromArrayBuffer(buffer)
  const image = await tiff.getImage()

  const width = Math.max(1, Math.round(image.getWidth() / factor))
  const height = Math.max(1, Math.round(image.getHeight() / factor))
  const bbox = image.getBoundingBox() as [number, number, number, number]

  const rasters = await image.readRasters({ width, height, resampleMethod: 'bilinear' })
  // Float32Array, no el tipo crudo del TIFF (Uint8Array): WebGL sube un
  // Uint8Array como textura UNSIGNED_BYTE normalizada a [0,1] — el nivel
  // crudo (0-255) llegaría al estilo dividido por 255, cayendo siempre en
  // el bucket "nodata". Float32Array sube sin normalizar (mismo truco que
  // `normalize:false` en ol/source/GeoTIFF — ver su composeTile_).
  const band = Float32Array.from(rasters[0] as ArrayLike<number>)

  const tileGrid = new TileGrid({
    extent: bbox,
    origin: [bbox[0], bbox[3]],
    resolutions: [Math.max((bbox[2] - bbox[0]) / width, (bbox[3] - bbox[1]) / height)],
    tileSize: [width, height],
  })

  return new DataTileSource({
    loader: () => band,
    tileGrid,
    projection: projCode,
    bandCount: 1,
    interpolate: true,
    transition: 0,
  })
}
