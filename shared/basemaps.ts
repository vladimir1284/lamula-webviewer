// Catálogo de mapas base (puro, sin OpenLayers): la máquina, el parseo de
// ruta y las prefs lo importan desde node (unit tests) sin arrastrar OL.
// La factoría de capas OL vive en utils/map/base-layers.ts.
//
// 'off' NO es un mapa: apaga base y labels (goldens/e2e deterministas) y por
// eso no aparece en el catálogo ni en el selector.

export const BASE_MAP_IDS = ['osm', 'carto-voyager', 'carto-positron', 'carto-dark'] as const

export type BaseMapId = (typeof BASE_MAP_IDS)[number] | 'off'

export const BASE_MAP_LABELS: Record<(typeof BASE_MAP_IDS)[number], string> = {
  'osm': 'OSM',
  'carto-voyager': 'CARTO Voyager',
  'carto-positron': 'CARTO Positron',
  'carto-dark': 'CARTO Oscuro',
}

export function isBaseMapId(v: unknown): v is BaseMapId {
  return v === 'off' || (BASE_MAP_IDS as readonly string[]).includes(v as string)
}
