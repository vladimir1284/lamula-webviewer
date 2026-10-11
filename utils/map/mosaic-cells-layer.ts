// Features + estilo de celdas multi-radar sobre el mapa de mosaico (P5,
// D45). Hermano reducido de phenomena-layer.ts: solo `storm_cell` (sin
// meso/TVS/tracks — esos overlays siguen siendo por-radar, ver
// machines/mosaic-viewer.ts), pero coloreado por sitio de origen en vez de
// por selección/severidad, porque acá la pregunta del usuario es "¿qué
// radar vio esta celda?", no "¿qué tan severa es?".
import type { Phenomenon } from '#shared/contract'
import { stormCellAttrs } from '#shared/contract'
import Feature from 'ol/Feature'
import { Point } from 'ol/geom'
import { fromLonLat } from 'ol/proj'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import CircleStyle from 'ol/style/Circle'
import Style from 'ol/style/Style'
import Text from 'ol/style/Text'
import { dbzToRadius } from './phenomena-layer'
import { mosaicCellId, siteColor } from '../overlay/mosaic-cells'

const SELECTED_FILL = '#ffffff'
const HALO_WHITE = '#ffffff'

/** una feature Point por celda, SIN deduplicar entre sitios (decisión explícita) */
export function buildMosaicCellFeatures(
  phenomena: Phenomenon[],
  siteOrder: readonly string[],
  selectedCellId: string | null,
): Feature[] {
  const features: Feature[] = []
  for (const row of phenomena) {
    if (row.kind !== 'storm_cell' || row.cell_id === null) continue
    const attrs = stormCellAttrs(row.attrs)
    const id = mosaicCellId(row.site_id, row.cell_id)
    const feature = new Feature(new Point(fromLonLat([row.lon, row.lat])))
    feature.setProperties({
      f4: 'cell',
      cellId: id,
      site: row.site_id,
      color: siteColor(row.site_id, siteOrder),
      selected: id === selectedCellId,
      dbzMax: attrs.dbz_max ?? null,
    })
    features.push(feature)
  }
  return features
}

const styleCache = new Map<string, Style>()

/** styleFunction de la VectorLayer de celdas del mosaico */
export function mosaicCellStyle(feature: { get(key: string): unknown }): Style {
  const dbzMax = feature.get('dbzMax') as number | null
  const color = feature.get('color') as string
  const selected = feature.get('selected') === true
  const cellId = feature.get('cellId') as string
  const radiusKey = Math.round(dbzToRadius(dbzMax))
  const key = `${cellId}|${color}|${selected}|${radiusKey}`
  let style = styleCache.get(key)
  if (!style) {
    style = new Style({
      zIndex: 10,
      image: new CircleStyle({
        radius: radiusKey,
        fill: new Fill({ color: selected ? SELECTED_FILL : color }),
        stroke: new Stroke({ color, width: selected ? 3 : 2 }),
      }),
      text: new Text({
        text: cellId,
        font: 'bold 10px ui-monospace, monospace',
        fill: new Fill({ color }),
        stroke: new Stroke({ color: HALO_WHITE, width: 3 }),
        offsetY: -14,
      }),
    })
    styleCache.set(key, style)
  }
  return style
}
