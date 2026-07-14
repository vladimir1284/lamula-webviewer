// Features + estilos de la capa vectorial de fenómenos (F4).
//
// Posición de celda/meso: columnas lat/lon de la fila (EPSG:4326 → mapa).
// Tracks past/forecast: [x_km, y_km] AEQD radar-céntricos → metros
// (utils/overlay/tracks.ts) → transform desde la proyección registrada del
// radar (`AEQD:{site}` — registerRadarProjection). Convención de dibujo
// SCIT: pasado punteado con puntos por vértice, pronóstico continuo con
// cruces. Estilos CACHEADOS por clave — con 100+ celdas por volumen, un
// `new Style` por feature y por frame tira el frame budget.
import type { Phenomenon } from '#shared/contract'
import { mesoAttrs, stormCellAttrs } from '#shared/contract'
import Feature from 'ol/Feature'
import { LineString, MultiPoint, Point } from 'ol/geom'
import { circular } from 'ol/geom/Polygon'
import { fromLonLat, transform } from 'ol/proj'
import Fill from 'ol/style/Fill'
import RegularShape from 'ol/style/RegularShape'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'
import Text from 'ol/style/Text'
import { trackChain } from '../overlay/tracks'

/** discriminador de estilo/hit-testing, en la prop 'f4' de cada feature */
export type OverlayFeatureKind =
  | 'cell'
  | 'past'
  | 'pastDot'
  | 'forecast'
  | 'forecastDot'
  | 'meso'
  | 'tvs'

const CELL_COLOR = '#e2e8f0' // slate-200
const CELL_SELECTED = '#facc15' // yellow-400
const MESO_COLOR = '#f59e0b' // amber-500
const SEVERE_COLOR = '#ef4444' // red-500
/** mesociclón con strength_rank ≥ 5: convención NWS de "fuerte" */
const MESO_SEVERE_RANK = 5

/**
 * Features de un volumen de fenómenos, ya filtrado por capas activas.
 * `projCode` es la AEQD registrada del radar (para los tracks).
 */
export function buildPhenomenaFeatures(
  phenomena: Phenomenon[],
  selectedCell: string | null,
  projCode: string,
): Feature[] {
  const features: Feature[] = []

  for (const row of phenomena) {
    if (row.kind === 'storm_cell') {
      const attrs = stormCellAttrs(row.attrs)
      const pos = fromLonLat([row.lon, row.lat])
      const selected = row.cell_id !== null && row.cell_id === selectedCell

      const marker = new Feature(new Point(pos))
      marker.setProperties({
        f4: 'cell' satisfies OverlayFeatureKind,
        cellId: row.cell_id,
        selected,
      })
      features.push(marker)

      const chain = trackChain(attrs)
      const toMap = ([x, y]: [number, number]) => transform([x, y], projCode, 'EPSG:3857')
      if (chain.past.length > 0) {
        const pts = chain.past.map(toMap)
        const line = new Feature(new LineString([...pts, pos]))
        line.set('f4', 'past' satisfies OverlayFeatureKind)
        const dots = new Feature(new MultiPoint(pts))
        dots.set('f4', 'pastDot' satisfies OverlayFeatureKind)
        features.push(line, dots)
      }
      if (chain.forecast.length > 0) {
        const pts = chain.forecast.map(toMap)
        const line = new Feature(new LineString([pos, ...pts]))
        line.set('f4', 'forecast' satisfies OverlayFeatureKind)
        const crosses = new Feature(new MultiPoint(pts))
        crosses.set('f4', 'forecastDot' satisfies OverlayFeatureKind)
        features.push(line, crosses)
      }
    }
    else if (row.kind === 'meso') {
      const attrs = mesoAttrs(row.attrs)
      const radiusM = (attrs.radius_km ?? 5) * 1000
      const circle = circular([row.lon, row.lat], radiusM, 64)
        .transform('EPSG:4326', 'EPSG:3857')
      const ring = new Feature(circle)
      ring.setProperties({
        f4: 'meso' satisfies OverlayFeatureKind,
        severe: (attrs.strength_rank ?? 0) >= MESO_SEVERE_RANK,
        stormId: attrs.storm_id ?? null,
      })
      features.push(ring)

      if (attrs.tvs === true) {
        const tvs = new Feature(new Point(fromLonLat([row.lon, row.lat])))
        tvs.set('f4', 'tvs' satisfies OverlayFeatureKind)
        features.push(tvs)
      }
    }
  }
  return features
}

const styleCache = new Map<string, Style>()

function cached(key: string, make: () => Style): Style {
  let style = styleCache.get(key)
  if (!style) {
    style = make()
    styleCache.set(key, style)
  }
  return style
}

function cellStyle(cellId: string | null, selected: boolean): Style {
  const color = selected ? CELL_SELECTED : CELL_COLOR
  return cached(`cell|${cellId ?? ''}|${selected}`, () =>
    new Style({
      image: new RegularShape({
        points: 3,
        radius: selected ? 9 : 7,
        stroke: new Stroke({ color, width: 2 }),
        fill: new Fill({ color: selected ? 'rgba(250,204,21,0.25)' : 'rgba(226,232,240,0.15)' }),
      }),
      text: new Text({
        text: cellId ?? '',
        font: 'bold 11px ui-monospace, monospace',
        fill: new Fill({ color }),
        stroke: new Stroke({ color: 'rgba(15,23,42,0.9)', width: 3 }),
        offsetY: -14,
      }),
    }))
}

/** styleFunction de la VectorLayer del overlay */
export function overlayStyle(feature: { get(key: string): unknown }): Style {
  const kind = feature.get('f4') as OverlayFeatureKind
  switch (kind) {
    case 'cell':
      return cellStyle(feature.get('cellId') as string | null, feature.get('selected') === true)
    case 'past':
      return cached('past', () =>
        new Style({
          stroke: new Stroke({ color: 'rgba(226,232,240,0.75)', width: 1.5, lineDash: [3, 6] }),
        }))
    case 'pastDot':
      return cached('pastDot', () =>
        new Style({
          image: new RegularShape({
            points: 12,
            radius: 2.5,
            fill: new Fill({ color: 'rgba(226,232,240,0.75)' }),
          }),
        }))
    case 'forecast':
      return cached('forecast', () =>
        new Style({
          stroke: new Stroke({ color: CELL_COLOR, width: 1.5 }),
        }))
    case 'forecastDot':
      return cached('forecastDot', () =>
        new Style({
          image: new RegularShape({
            points: 4,
            radius: 5,
            radius2: 0,
            angle: Math.PI / 4,
            stroke: new Stroke({ color: CELL_COLOR, width: 1.5 }),
          }),
        }))
    case 'meso': {
      const severe = feature.get('severe') === true
      return cached(`meso|${severe}`, () =>
        new Style({
          stroke: new Stroke({
            color: severe ? SEVERE_COLOR : MESO_COLOR,
            width: severe ? 3 : 2,
          }),
        }))
    }
    case 'tvs':
      return cached('tvs', () =>
        new Style({
          image: new RegularShape({
            points: 3,
            radius: 8,
            rotation: Math.PI, // triángulo invertido: convención TVS
            fill: new Fill({ color: SEVERE_COLOR }),
            stroke: new Stroke({ color: '#fff', width: 1 }),
          }),
        }))
  }
}
