// Fuentes OL del catálogo de mapas base (shared/basemaps.ts). Los tiles de
// OSM traen los nombres horneados (no hay labels aparte → nunca se duplica);
// las variantes CARTO son un par *_nolabels (base, zIndex 0) + *_only_labels
// (capa de nombres en zIndex 18: sobre raster/cobertura/viento, bajo la capa
// de fenómenos en 20).
import OSM from 'ol/source/OSM'
import XYZ from 'ol/source/XYZ'
import type TileSource from 'ol/source/Tile'
import type { BaseMapId } from '#shared/basemaps'

const CARTO_ATTRIBUTION
  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

// estilos raster de basemaps.cartocdn.com — voyager cuelga de rastertiles/,
// positron/dark usan los nombres light_/dark_ del CDN
const CARTO_STYLES: Record<string, { base: string, labels: string }> = {
  'carto-voyager': { base: 'rastertiles/voyager_nolabels', labels: 'rastertiles/voyager_only_labels' },
  'carto-positron': { base: 'light_nolabels', labels: 'light_only_labels' },
  'carto-dark': { base: 'dark_nolabels', labels: 'dark_only_labels' },
}

function cartoSource(style: string): XYZ {
  // OL no expande el token {r} de CARTO — resolver @2x aquí una vez
  const retina = typeof devicePixelRatio !== 'undefined' && devicePixelRatio > 1
  return new XYZ({
    url: `https://{a-d}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}${retina ? '@2x' : ''}.png`,
    tilePixelRatio: retina ? 2 : 1,
    attributions: CARTO_ATTRIBUTION,
  })
}

export interface BaseMapSources {
  base: TileSource | null
  /** null = sin capa de labels (OSM los trae horneados, 'off' apaga todo) */
  labels: TileSource | null
}

export function createBaseMapSources(id: BaseMapId): BaseMapSources {
  if (id === 'off') return { base: null, labels: null }
  if (id === 'osm') return { base: new OSM(), labels: null }
  const style = CARTO_STYLES[id]!
  return { base: cartoSource(style.base), labels: cartoSource(style.labels) }
}
