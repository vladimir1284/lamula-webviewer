// Bucle visual de rayos: proporcionalidad (QA #3), empalme sin costura del
// bucle (QA #2) y curva de enfriamiento estilo Windy — todo puro, reloj
// inyectado como fase 0–1.
import { describe, expect, it } from 'vitest'
import {
  drawList,
  LIFE_FRACTION,
  lifeFactor,
  LOOP_MS,
  loopPhase,
  strikeColor,
  strikeRadius,
} from '~/utils/lightning/anim'

describe('loopPhase', () => {
  it('mapea el reloj a fase 0–1 con módulo', () => {
    expect(loopPhase(1000, 1000)).toBe(0)
    expect(loopPhase(1000 + LOOP_MS / 2, 1000)).toBe(0.5)
    expect(loopPhase(1000 + LOOP_MS * 7.25, 1000)).toBe(0.25)
  })
})

describe('lifeFactor', () => {
  it('recién caído → 1; extinto tras LIFE_FRACTION → null', () => {
    expect(lifeFactor(0.5, 0.5)).toBe(1)
    expect(lifeFactor(0.5, 0.5 + LIFE_FRACTION / 2)).toBeCloseTo(0.5, 10)
    expect(lifeFactor(0.5, 0.5 + LIFE_FRACTION + 0.01)).toBeNull()
  })

  it('aún no cayó en el tiempo del bucle → null (proporcionalidad: lo del final solo al final)', () => {
    expect(lifeFactor(0.99, 0.5)).toBeNull()
    expect(lifeFactor(0.99, 0.995)).not.toBeNull()
  })

  it('empalme sin costura: un rayo del final sigue muriendo tras reiniciar la fase', () => {
    const life = lifeFactor(0.98, 0.05) // edad modular 0.07 < 0.15
    expect(life).toBeCloseTo(1 - 0.07 / LIFE_FRACTION, 10)
  })
})

describe('curva de enfriamiento', () => {
  it('color: blanco al nacer, púrpura al morir, cálidos en medio', () => {
    expect(strikeColor(1)).toEqual([255, 255, 255])
    expect(strikeColor(0)).toEqual([156, 39, 176])
    const [r, g, b] = strikeColor(0.5)
    expect(r).toBe(255) // zona amarillo→naranja
    expect(g).toBeGreaterThan(100)
    expect(b).toBeLessThan(60)
  })

  it('radio crece monótonamente mientras muere', () => {
    expect(strikeRadius(1)).toBe(3)
    expect(strikeRadius(0)).toBeGreaterThan(strikeRadius(0.5))
    expect(strikeRadius(0.5)).toBeGreaterThan(strikeRadius(1))
  })
})

describe('drawList', () => {
  const strikes = [
    { lon: -81, lat: 24, progress: 0.1 },
    { lon: -81.1, lat: 24.1, progress: 0.5 },
    { lon: -81.2, lat: 24.2, progress: 0.9 },
  ]

  it('solo pinta las descargas vivas en la fase actual', () => {
    const dots = drawList(strikes, 0.55)
    expect(dots).toHaveLength(1)
    expect(dots[0]!.lon).toBe(-81.1)
    expect(dots[0]!.alpha).toBe(dots[0]!.life)
  })

  it('fase al final del bucle pinta lo del final, no lo del inicio', () => {
    const dots = drawList(strikes, 0.95)
    expect(dots.map(d => d.lon)).toEqual([-81.2])
  })

  it('determinista: misma fase → misma lista', () => {
    expect(drawList(strikes, 0.55)).toEqual(drawList(strikes, 0.55))
  })
})
