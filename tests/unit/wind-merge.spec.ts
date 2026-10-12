// mergeWindGrids (D49): unión de las grillas por sitio de un dominio de
// mosaico en una sola lattice. Pura — sin canvas ni OpenLayers.
import type { WindGridFile } from '#shared/contract'
import { describe, expect, it } from 'vitest'
import { gridBounds, mergeWindGrids, sampleWind } from '../../utils/wind/grid'

/** grilla constante (u,v) sobre [lo1, lo1+(nx-1)dx] × [la1-(ny-1)dy, la1] */
function grid(lo1: number, la1: number, u: number, v: number, nx = 5, ny = 5, d = 0.25): WindGridFile {
  return {
    header: { nx, ny, lo1, la1, dx: d, dy: d, refTime: '2026-07-11T00:00:00Z', forecastHour: 3 },
    u: new Array(nx * ny).fill(u),
    v: new Array(nx * ny).fill(v),
  }
}

describe('mergeWindGrids', () => {
  it('sin grillas devuelve null; una sola se devuelve tal cual', () => {
    expect(mergeWindGrids([])).toBeNull()
    const g = grid(-82, 26, 3, 4)
    expect(mergeWindGrids([g])).toBe(g)
  })

  it('la lattice unión cubre el bbox de las dos fuentes', () => {
    const a = grid(-82, 26, 3, 0)
    const b = grid(-80, 25, 0, 5)
    const merged = mergeWindGrids([a, b])!
    const bm = gridBounds(merged)
    expect(bm.west).toBeCloseTo(-82, 6)
    expect(bm.north).toBeCloseTo(26, 6)
    expect(bm.east).toBeCloseTo(gridBounds(b).east, 6)
    expect(bm.south).toBeCloseTo(gridBounds(b).south, 6)
  })

  it('cada zona exclusiva conserva el valor de SU fuente', () => {
    const a = grid(-82, 26, 3, 0)
    const b = grid(-80, 25, 0, 5)
    const merged = mergeWindGrids([a, b])!
    expect(sampleWind(merged, -81.9, 25.9)).toEqual({ u: 3, v: 0 })
    expect(sampleWind(merged, -79.1, 24.1)).toEqual({ u: 0, v: 5 })
  })

  it('en el solape gana la PRIMERA grilla, no el promedio', () => {
    const a = grid(-82, 26, 3, 0)
    const b = grid(-81, 25.5, 9, 9)
    const merged = mergeWindGrids([a, b])!
    expect(sampleWind(merged, -81, 25.5)).toEqual({ u: 3, v: 0 })
    expect(mergeWindGrids([b, a])!.u[0]).not.toBeNaN()
    expect(sampleWind(mergeWindGrids([b, a])!, -81, 25.5)).toEqual({ u: 9, v: 9 })
  })

  it('las celdas que no cubre ninguna fuente quedan NaN (no 0) y sampleWind devuelve null ahí', () => {
    // dos grillas en esquinas opuestas: la esquina NE de la unión queda hueca
    const a = grid(-82, 26, 3, 0, 3, 3)
    const b = grid(-80, 24.5, 1, 1, 3, 3)
    const merged = mergeWindGrids([a, b])!
    const hole = sampleWind(merged, -79.6, 25.9)
    expect(hole).toBeNull()
    expect(merged.u.some(Number.isNaN)) .toBe(true)
  })

  it('conserva refTime/forecastHour de la primera fuente', () => {
    const merged = mergeWindGrids([grid(-82, 26, 1, 1), grid(-80, 25, 2, 2)])!
    expect(merged.header.refTime).toBe('2026-07-11T00:00:00Z')
    expect(merged.header.forecastHour).toBe(3)
  })

  it('engrosa el paso en vez de explotar si las fuentes están muy separadas', () => {
    const merged = mergeWindGrids([grid(-170, 60, 1, 1), grid(170, -60, 2, 2)])!
    expect(merged.header.nx).toBeLessThanOrEqual(512)
    expect(merged.header.ny).toBeLessThanOrEqual(512)
    expect(merged.header.dx).toBeGreaterThan(0.25)
  })
})
