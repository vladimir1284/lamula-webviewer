import { describe, expect, it } from 'vitest'
import { linearScale } from '~/utils/charts/scale'

describe('linearScale', () => {
  it('mapea linealmente e invierte rangos (eje y de pantalla)', () => {
    const s = linearScale([0, 100], [200, 0])
    expect(s.map(0)).toBe(200)
    expect(s.map(100)).toBe(0)
    expect(s.map(25)).toBe(150)
  })

  it('dominio degenerado (serie constante) → centro del rango, tick único', () => {
    const s = linearScale([42, 42], [0, 100])
    expect(s.map(42)).toBe(50)
    expect(s.ticks()).toEqual([42])
  })

  it('ticks 1/2/5×10^k dentro del dominio', () => {
    expect(linearScale([0, 100], [0, 1]).ticks(5)).toEqual([0, 20, 40, 60, 80, 100])
    expect(linearScale([13, 61], [0, 1]).ticks(5)).toEqual([20, 30, 40, 50, 60])
    for (const t of linearScale([0.3, 2.7], [0, 1]).ticks(4)) {
      expect(t).toBeGreaterThanOrEqual(0.3)
      expect(t).toBeLessThanOrEqual(2.7)
    }
  })

  it('ticks con decimales no acumulan ruido de coma flotante', () => {
    expect(linearScale([0, 1], [0, 1]).ticks(5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })
})
