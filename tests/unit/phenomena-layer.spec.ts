// buildPhenomenaFeatures/overlayStyle: geometrías por kind, tolerancia a
// attrs vacíos y cache de estilos. Proyección AEQD real de las fixtures.
import type { Phenomenon } from '#shared/contract'
import type Feature from 'ol/Feature'
import type { LineString, Point } from 'ol/geom'
import { toLonLat } from 'ol/proj'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { registerRadarProjection } from '~/utils/map/projection'
import { buildPhenomenaFeatures, overlayStyle } from '~/utils/map/phenomena-layer'
import { radars } from '../helpers/derive'

// happy-dom no implementa canvas 2D (getContext('2d') → null) y cellIcon
// dibuja el marker en un canvas propio: stub con la superficie que usa —
// aquí se asserta identidad/cache de estilos, la fidelidad visual la cubre
// el golden e2e (BYX-overlay) sobre Chromium real.
beforeAll(() => {
  if (document.createElement('canvas').getContext('2d') !== null) return
  const noop = () => {}
  const ctx = {
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    beginPath: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    moveTo: noop,
    lineTo: noop,
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(ctx as unknown as ReturnType<HTMLCanvasElement['getContext']>)
})

const radar = radars[0]!
const projCode = registerRadarProjection(radar.site_id, radar.proj4)

function cell(patch: Partial<Phenomenon> = {}, attrs: Record<string, unknown> = {}): Phenomenon {
  return {
    site_id: radar.site_id,
    product_code: 58,
    vol_time: '2026-07-11T03:00:00',
    kind: 'storm_cell',
    cell_id: 'D4',
    lat: radar.lat + 0.5,
    lon: radar.lon + 0.5,
    azimuth_deg: 45,
    range_km: 70,
    attrs,
    ...patch,
  }
}

const kinds = (features: Feature[]) => features.map(f => f.get('f4'))

// tests de geometría/estilo: tracks siempre visibles, el toggle se prueba aparte
const SHOW_ALL_TRACKS = { pastVisible: () => true, futureVisible: () => true }

describe('buildPhenomenaFeatures', () => {
  it('celda sin tracks → solo el marker, con cell_id y flag selected', () => {
    const [marker, ...rest] = buildPhenomenaFeatures([cell()], 'D4', projCode, SHOW_ALL_TRACKS)
    expect(rest).toHaveLength(0)
    expect(marker!.get('f4')).toBe('cell')
    expect(marker!.get('cellId')).toBe('D4')
    expect(marker!.get('selected')).toBe(true)
    const [lon, lat] = toLonLat((marker!.getGeometry() as Point).getCoordinates())
    expect(lon).toBeCloseTo(radar.lon + 0.5, 6)
    expect(lat).toBeCloseTo(radar.lat + 0.5, 6)
  })

  it('tracks generan línea + vértices; el past termina en la posición actual', () => {
    const features = buildPhenomenaFeatures(
      [cell({}, { past: [[10, 10], [20, 20]], forecast: [[-5, -5]] })],
      null,
      projCode,
      SHOW_ALL_TRACKS,
    )
    expect(kinds(features)).toEqual(['cell', 'past', 'pastDot', 'forecast', 'forecastDot'])
    const past = features[1]!.getGeometry() as LineString
    // orden de dibujo viejo→reciente→posición actual: [20,20]km, [10,10]km, pos
    expect(past.getCoordinates()).toHaveLength(3)
    const marker = features[0]!.getGeometry() as Point
    expect(past.getLastCoordinate()).toEqual(marker.getCoordinates())
    const forecast = features[3]!.getGeometry() as LineString
    expect(forecast.getFirstCoordinate()).toEqual(marker.getCoordinates())
  })

  it('meso → anillo con severidad por strength_rank; tvs añade su marker', () => {
    const rows: Phenomenon[] = [
      cell({ kind: 'meso', cell_id: '366' }, { radius_km: 6, strength_rank: 5, tvs: true, storm_id: 'D4' }),
      cell({ kind: 'meso', cell_id: '812' }, { radius_km: 4, strength_rank: 3, tvs: false }),
    ]
    const features = buildPhenomenaFeatures(rows, null, projCode, SHOW_ALL_TRACKS)
    expect(kinds(features)).toEqual(['meso', 'tvs', 'meso'])
    expect(features[0]!.get('severe')).toBe(true)
    expect(features[0]!.get('stormId')).toBe('D4')
    expect(features[2]!.get('severe')).toBe(false)
  })

  it('attrs vacío ({} del mapper) no lanza: marker/anillo con defaults', () => {
    const features = buildPhenomenaFeatures(
      [cell({}, {}), cell({ kind: 'meso', cell_id: '1' }, {})],
      null,
      projCode,
      SHOW_ALL_TRACKS,
    )
    expect(kinds(features)).toEqual(['cell', 'meso'])
  })
})

describe('overlayStyle', () => {
  it('cachea por clave: misma feature-shape → misma instancia Style', () => {
    const [a] = buildPhenomenaFeatures([cell()], null, projCode, SHOW_ALL_TRACKS)
    const [b] = buildPhenomenaFeatures([cell()], null, projCode, SHOW_ALL_TRACKS)
    expect(overlayStyle(a!)).toBe(overlayStyle(b!))
  })

  it('seleccionada y no seleccionada difieren; cada kind resuelve estilo', () => {
    const [sel] = buildPhenomenaFeatures([cell()], 'D4', projCode, SHOW_ALL_TRACKS)
    const [unsel] = buildPhenomenaFeatures([cell()], null, projCode, SHOW_ALL_TRACKS)
    expect(overlayStyle(sel!)).not.toBe(overlayStyle(unsel!))
    const all = buildPhenomenaFeatures(
      [
        cell({}, { past: [[1, 1]], forecast: [[2, 2]] }),
        cell({ kind: 'meso', cell_id: '9' }, { tvs: true }),
      ],
      null,
      projCode,
      SHOW_ALL_TRACKS,
    )
    for (const f of all) expect(overlayStyle(f)).toBeTruthy()
  })
})
