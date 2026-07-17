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
import CircleStyle from 'ol/style/Circle'
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

const CELL_SELECTED = '#facc15' // yellow-400
const MESO_COLOR = '#f59e0b' // amber-500
const SEVERE_COLOR = '#ef4444' // red-500
/** mesociclón con strength_rank ≥ 5: convención NWS de "fuerte" */
const MESO_SEVERE_RANK = 5

// Combo marca+halo compartido con las etiquetas de TimelineStrip.vue
// (TICK_NAVY) — si uno cambia, el otro debe cambiar a mano.
const TRACK_NAVY = '#0C447C'
const HALO_WHITE = '#ffffff'

/** rango dBZ estándar NWS → radio del marker de celda, en px, clamp fuera de rango */
const DBZ_MIN = 5
const DBZ_MAX = 75
const RADIUS_MIN = 5
const RADIUS_MAX = 14
const RADIUS_FALLBACK = 7 // sin dbz_max: tamaño previo por defecto

function dbzToRadius(dbzMax: number | null | undefined): number {
  if (dbzMax === null || dbzMax === undefined || Number.isNaN(dbzMax)) return RADIUS_FALLBACK
  const clamped = Math.min(DBZ_MAX, Math.max(DBZ_MIN, dbzMax))
  const t = (clamped - DBZ_MIN) / (DBZ_MAX - DBZ_MIN)
  return RADIUS_MIN + t * (RADIUS_MAX - RADIUS_MIN)
}

/** trayectorias pasado/futuro: visibles solo si el caller las habilita (default oculto) */
export interface TrackVisibility {
  pastVisible: (cellId: string | null) => boolean
  futureVisible: (cellId: string | null) => boolean
}

/**
 * Features de un volumen de fenómenos, ya filtrado por capas activas.
 * `projCode` es la AEQD registrada del radar (para los tracks).
 */
export function buildPhenomenaFeatures(
  phenomena: Phenomenon[],
  selectedCell: string | null,
  projCode: string,
  trackVis: TrackVisibility,
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
        dbzMax: attrs.dbz_max ?? null,
      })
      features.push(marker)

      const chain = trackChain(attrs)
      const toMap = ([x, y]: [number, number]) => transform([x, y], projCode, 'EPSG:3857')
      if (chain.past.length > 0 && trackVis.pastVisible(row.cell_id)) {
        const pts = chain.past.map(toMap)
        const line = new Feature(new LineString([...pts, pos]))
        line.set('f4', 'past' satisfies OverlayFeatureKind)
        const dots = new Feature(new MultiPoint(pts))
        dots.set('f4', 'pastDot' satisfies OverlayFeatureKind)
        features.push(line, dots)
      }
      if (chain.forecast.length > 0 && trackVis.futureVisible(row.cell_id)) {
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
const styleArrCache = new Map<string, Style[]>()

function cached(key: string, make: () => Style): Style {
  let style = styleCache.get(key)
  if (!style) {
    style = make()
    styleCache.set(key, style)
  }
  return style
}

function cachedArr(key: string, make: () => Style[]): Style[] {
  let styles = styleArrCache.get(key)
  if (!styles) {
    styles = make()
    styleArrCache.set(key, styles)
  }
  return styles
}

function cellStyle(cellId: string | null, selected: boolean, dbzMax: number | null): Style {
  const color = selected ? CELL_SELECTED : TRACK_NAVY
  const radius = dbzToRadius(dbzMax)
  const radiusKey = Math.round(radius)
  return cached(`cell|${cellId ?? ''}|${selected}|${radiusKey}`, () =>
    new Style({
      // el marker de la celda SIEMPRE gana el declutter frente a los puntos
      // de su propia trayectoria (pastDot/forecastDot caen justo al lado —
      // sin zIndex, declutter elegía cuál de los dos pintar según el orden
      // del índice espacial, y a veces tapaba la celda misma)
      zIndex: 10,
      image: new CircleStyle({
        radius,
        fill: new Fill({ color }),
      }),
      text: new Text({
        text: cellId ?? '',
        font: 'bold 11px ui-monospace, monospace',
        fill: new Fill({ color: TRACK_NAVY }),
        stroke: new Stroke({ color: HALO_WHITE, width: 3 }),
        offsetY: -14,
      }),
    }))
}

/** styleFunction de la VectorLayer del overlay */
export function overlayStyle(feature: { get(key: string): unknown }): Style | Style[] {
  const kind = feature.get('f4') as OverlayFeatureKind
  switch (kind) {
    case 'cell':
      return cellStyle(
        feature.get('cellId') as string | null,
        feature.get('selected') === true,
        feature.get('dbzMax') as number | null,
      )
    case 'past':
      return cachedArr('past', () => [
        new Style({
          stroke: new Stroke({ color: HALO_WHITE, width: 6, lineDash: [3, 6] }),
        }),
        new Style({
          stroke: new Stroke({ color: TRACK_NAVY, width: 2.5, lineDash: [3, 6] }),
        }),
      ])
    case 'pastDot':
      // un solo Style (mismo motivo que cellStyle: declutter descarta el 2º
      // Style con imagen en el mismo punto)
      return cached('pastDot', () =>
        new Style({
          zIndex: 1, // cede el declutter al marker de la celda (ver cellStyle)
          image: new CircleStyle({
            radius: 4.5,
            fill: new Fill({ color: '#000000' }),
            stroke: new Stroke({ color: HALO_WHITE, width: 2 }),
          }),
        }))
    case 'forecast':
      return cachedArr('forecast', () => [
        new Style({
          stroke: new Stroke({ color: HALO_WHITE, width: 6 }),
        }),
        new Style({
          stroke: new Stroke({ color: TRACK_NAVY, width: 2.5 }),
        }),
      ])
    case 'forecastDot':
      // radius2:0 colapsa el relleno a área cero (4 puntas degeneradas) —
      // lo único que pinta píxeles es el stroke, así que el color visible
      // de la cruz es el stroke, no el fill (confirmado: con fill negro +
      // stroke blanco la cruz se veía blanca, no negra)
      return cached('forecastDot', () =>
        new Style({
          zIndex: 1, // cede el declutter al marker de la celda (ver cellStyle)
          image: new RegularShape({
            points: 4,
            radius: 8,
            radius2: 0,
            angle: Math.PI / 4,
            stroke: new Stroke({ color: '#000000', width: 3 }),
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
