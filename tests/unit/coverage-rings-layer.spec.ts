// buildCoverageCenterFeatures (D46): puro, sin OL Map — un marcador+label
// por sitio CONTRIBUYENTE (el llamador ya filtra los ausentes antes de
// invocar esta función, ver MosaicMap.vue::updateCoverage).
import { describe, expect, it } from 'vitest'
import { buildCoverageCenterFeatures, coverageCenterStyle, COVERAGE_PROP } from '../../utils/map/coverage-rings-layer'

const SITES = [
  { site_id: 'AMX', lat: 18.43, lon: -66.0 },
  { site_id: 'BYX', lat: 24.6, lon: -81.7 },
  { site_id: 'HDC', lat: 29.5, lon: -95.1 },
]

describe('buildCoverageCenterFeatures', () => {
  it('un punto por sitio, mismo marcado contributing', () => {
    const features = buildCoverageCenterFeatures(SITES, new Set(['HDC']))
    expect(features).toHaveLength(3)
    expect(features.find(f => f.get(COVERAGE_PROP) === 'HDC')!.get('contributing')).toBe(true)
    expect(features.find(f => f.get(COVERAGE_PROP) === 'AMX')!.get('contributing')).toBe(false)
    for (const f of features) expect(f.getGeometry()!.getType()).toBe('Point')
  })
})

describe('coverageCenterStyle', () => {
  it('no lanza para ninguno de los dos estados', () => {
    const [contributing, absent] = buildCoverageCenterFeatures(SITES.slice(0, 2), new Set(['AMX']))
    expect(() => coverageCenterStyle(contributing!)).not.toThrow()
    expect(() => coverageCenterStyle(absent!)).not.toThrow()
  })
})
