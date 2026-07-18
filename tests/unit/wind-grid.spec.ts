// Muestreo bilineal del campo GFS: contra un campo bilineal exacto la
// interpolación debe reproducirlo sin error (propiedad, no aproximación).
import type { WindGridFile } from '#shared/contract'
import { describe, expect, it } from 'vitest'
import { gridBounds, sampleWind } from '../../utils/wind/grid'

// u = 2·lon + lat, v = lon − 3·lat (bilineal ⇒ la interpolación es exacta)
function analyticGrid(): WindGridFile {
  const header = { nx: 5, ny: 4, lo1: -82, la1: 26, dx: 0.25, dy: 0.25, refTime: '2026-07-11T00:00:00Z', forecastHour: 0 }
  const u: number[] = []
  const v: number[] = []
  for (let j = 0; j < header.ny; j++) {
    for (let i = 0; i < header.nx; i++) {
      const lon = header.lo1 + i * header.dx
      const lat = header.la1 - j * header.dy
      u.push(2 * lon + lat)
      v.push(lon - 3 * lat)
    }
  }
  return { header, u, v }
}

describe('gridBounds', () => {
  it('extensión desde la esquina NO (la1 = norte, lo1 = oeste)', () => {
    expect(gridBounds(analyticGrid())).toEqual({
      west: -82,
      east: -81,
      north: 26,
      south: 25.25,
    })
  })
})

describe('sampleWind', () => {
  const grid = analyticGrid()
  const exact = (lon: number, lat: number) => ({ u: 2 * lon + lat, v: lon - 3 * lat })

  it('en los nodos devuelve el valor exacto de la grilla', () => {
    expect(sampleWind(grid, -82, 26)).toEqual(exact(-82, 26)) // esquina NO
    expect(sampleWind(grid, -81, 25.25)).toEqual(exact(-81, 25.25)) // esquina SE
    expect(sampleWind(grid, -81.5, 25.75)).toEqual(exact(-81.5, 25.75))
  })

  it('entre nodos interpola bilinealmente (exacto para un campo bilineal)', () => {
    for (const [lon, lat] of [[-81.87, 25.93], [-81.1, 25.3], [-81.62, 25.51]] as const) {
      const s = sampleWind(grid, lon, lat)!
      expect(s.u).toBeCloseTo(exact(lon, lat).u, 10)
      expect(s.v).toBeCloseTo(exact(lon, lat).v, 10)
    }
  })

  it('fuera de la grilla → null (bordes exactos incluidos dentro)', () => {
    expect(sampleWind(grid, -82.01, 25.5)).toBeNull()
    expect(sampleWind(grid, -80.99, 25.5)).toBeNull()
    expect(sampleWind(grid, -81.5, 26.01)).toBeNull()
    expect(sampleWind(grid, -81.5, 25.24)).toBeNull()
    expect(sampleWind(grid, -81.5, 25.25)).not.toBeNull()
  })
})
