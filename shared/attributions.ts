// Atribuciones de las fuentes de teselas, en dos sabores: el HTML que consume
// el control de OL y el texto plano que dibuja el chrome del export (F7).
//
// Vive en `shared/` y no en `utils/map/base-layers.ts` porque `utils/export/`
// no puede importar nada que arrastre `ol`.
import type { BaseMapId } from './basemaps'

export const ATTRIBUTION_HTML = {
  osm: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  carto:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
} as const

export const ATTRIBUTION_TEXT = {
  osm: '© OpenStreetMap contributors',
  carto: '© OpenStreetMap contributors · © CARTO',
  satellite: 'GOES — NOAA nowcoast',
  radar: 'NEXRAD Level III — NOAA/NWS',
} as const

/** Texto plano de las fuentes realmente visibles, en orden de aparición. */
export function attributionsFor(base: BaseMapId, satellite: boolean): string[] {
  const out: string[] = []
  if (base === 'osm') out.push(ATTRIBUTION_TEXT.osm)
  else if (base !== 'off') out.push(ATTRIBUTION_TEXT.carto)
  if (satellite) out.push(ATTRIBUTION_TEXT.satellite)
  out.push(ATTRIBUTION_TEXT.radar)
  return out
}
