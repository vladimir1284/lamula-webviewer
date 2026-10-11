// buildMaskCircles (D46): puro, sin OL Map/canvas — un círculo (vértices en
// EPSG:3857) por sitio CONTRIBUYENTE, nada para los ausentes (su área queda
// cubierta por la máscara, ver utils/map/coverage-mask-layer.ts).
import { describe, expect, it } from 'vitest'
import { buildMaskCircles } from '../../utils/map/coverage-mask-layer'

const SITES = [
  { site_id: 'AMX', lat: 18.43, lon: -66.0 },
  { site_id: 'BYX', lat: 24.6, lon: -81.7 },
  { site_id: 'HDC', lat: 29.5, lon: -95.1 },
]

describe('buildMaskCircles', () => {
  it('un círculo por sitio contribuyente, ninguno para los ausentes', () => {
    const circles = buildMaskCircles(SITES, 230_000, new Set(['AMX', 'BYX']))
    expect(circles).toHaveLength(2)
  })

  it('con el set vacío, no hay círculos (todo el dominio queda oscuro)', () => {
    expect(buildMaskCircles(SITES, 230_000, new Set())).toHaveLength(0)
  })

  it('cada círculo trae vértices [x, y] cerrados (primero === último)', () => {
    const [circle] = buildMaskCircles(SITES.slice(0, 1), 230_000, new Set(['AMX']))
    expect(circle!.length).toBeGreaterThan(90)
    expect(circle![0]).toEqual(circle![circle!.length - 1])
    for (const [x, y] of circle!) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
    }
  })
})
