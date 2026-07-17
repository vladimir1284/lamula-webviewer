// Capa de fondo GOES (NOAA nowcoast, cloud-based tras la migración de abril
// 2023 — el ArcGIS Server /arcgis/... viejo está decomisionado, devuelve 403
// de CloudFront por path no mapeado, no bot-blocking). Nuevo stack: GeoServer
// puro WMS, capturado desde el viewer oficial nowcoast.noaa.gov + confirmado
// por GetCapabilities. TileLayer/TileWMS estándar (Canvas), no WebGLTileLayer:
// es solo display, sin getData() para el cursor, así que no necesita
// crossOrigin ni comparte el contexto WebGL del frame-pool.
import TileLayer from 'ol/layer/Tile'
import TileWMS from 'ol/source/TileWMS'

export const SAT_WMS_URL = 'https://nowcoast.noaa.gov/geoserver/satellite/wms'

export type SatVariant = 'vis' | 'ir'

export const SAT_LAYER_NAMES: Record<SatVariant, string> = {
  vis: 'goes_visible_imagery',
  ir: 'goes_longwave_imagery',
}

function nowParam(): string {
  return new Date().toISOString()
}

export function createSatelliteLayer(variant: SatVariant, opacity: number): TileLayer<TileWMS> {
  return new TileLayer({
    source: new TileWMS({
      url: SAT_WMS_URL,
      params: { LAYERS: SAT_LAYER_NAMES[variant], time: nowParam() },
    }),
    opacity,
  })
}

export function setSatelliteVariant(layer: TileLayer<TileWMS>, variant: SatVariant): void {
  layer.getSource()?.updateParams({ LAYERS: SAT_LAYER_NAMES[variant] })
}

// `time` fija qué imagen sirve GeoServer y también actúa como cache-buster de
// tiles (misma URL ⇒ OL nunca refetchea). timeIso null (sin dato de radar
// resuelto aún) cae a wall-clock; si no, se pasa el vol_time del raster
// mostrado para que GOES quede alineado a ESE dato, no a "ahora".
export function setSatelliteTime(layer: TileLayer<TileWMS>, timeIso: string | null): void {
  layer.getSource()?.updateParams({ time: timeIso ?? nowParam() })
}
