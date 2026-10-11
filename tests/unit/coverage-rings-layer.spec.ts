// buildCoverageFeatures/buildCoverageCenterFeatures (D43/P4): puro, sin OL
// Map — un anillo/centro por sitio, marcado contribuyente o ausente según
// el `contributing` del slot mostrado.
import { describe, expect, it } from 'vitest'
import {
  buildCoverageCenterFeatures,
  buildCoverageFeatures,
  COVERAGE_PROP,
  coverageCenterStyle,
  coverageRingStyle,
} from '../../utils/map/coverage-rings-layer'

const SITES = [
  { site_id: 'AMX', lat: 18.43, lon: -66.0 },
  { site_id: 'BYX', lat: 24.6, lon: -81.7 },
  { site_id: 'HDC', lat: 29.5, lon: -95.1 },
]

describe('buildCoverageFeatures', () => {
  it('una feature por sitio, marcada contributing según el set dado', () => {
    const features = buildCoverageFeatures(SITES, 230_000, new Set(['AMX', 'BYX']))
    expect(features).toHaveLength(3)
    expect(features.map(f => f.get(COVERAGE_PROP))).toEqual(['AMX', 'BYX', 'HDC'])
    expect(features.map(f => f.get('contributing'))).toEqual([true, true, false])
  })

  it('cada feature trae un polígono (círculo esférico reproyectado a 3857)', () => {
    const [feature] = buildCoverageFeatures(SITES.slice(0, 1), 230_000, new Set())
    const geom = feature!.getGeometry()
    expect(geom).toBeDefined()
    expect(geom!.getType()).toBe('Polygon')
  })

  it('con el set vacío, nadie es contributing', () => {
    const features = buildCoverageFeatures(SITES, 230_000, new Set())
    expect(features.every(f => f.get('contributing') === false)).toBe(true)
  })
})

describe('buildCoverageCenterFeatures', () => {
  it('un punto por sitio, mismo marcado contributing', () => {
    const features = buildCoverageCenterFeatures(SITES, new Set(['HDC']))
    expect(features).toHaveLength(3)
    expect(features.find(f => f.get(COVERAGE_PROP) === 'HDC')!.get('contributing')).toBe(true)
    expect(features.find(f => f.get(COVERAGE_PROP) === 'AMX')!.get('contributing')).toBe(false)
    for (const f of features) expect(f.getGeometry()!.getType()).toBe('Point')
  })
})

describe('estilos — no lanzan y distinguen contributing de ausente', () => {
  it('coverageRingStyle: trazo sólido para contributing, punteado para ausente', () => {
    const [contributing, absent] = buildCoverageFeatures(SITES.slice(0, 2), 230_000, new Set(['AMX']))
    const styleContributing = coverageRingStyle(contributing!)
    const styleAbsent = coverageRingStyle(absent!)
    expect(styleContributing.getStroke()?.getLineDash()).toBeNull()
    expect(styleAbsent.getStroke()?.getLineDash()).toEqual([6, 6])
  })

  it('coverageCenterStyle: no lanza para ninguno de los dos estados', () => {
    const [contributing, absent] = buildCoverageCenterFeatures(SITES.slice(0, 2), new Set(['AMX']))
    expect(() => coverageCenterStyle(contributing!)).not.toThrow()
    expect(() => coverageCenterStyle(absent!)).not.toThrow()
  })
})
