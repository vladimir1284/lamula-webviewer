// Join temporal del overlay (D24) — casos sintéticos + el caso real
// derivado de las fixtures (un frame raster sin fila de fenómenos exacta
// con volumen vecino dentro de tolerancia).
import { describe, expect, it } from 'vitest'
import { JOIN_TOLERANCE_S, nearestWithin } from '~/utils/overlay/join'
import { joinCase, phenDay } from '../helpers/derive'

const T = [
  '2026-07-11T02:50:38',
  '2026-07-11T02:55:54',
  '2026-07-11T03:01:02',
]

describe('nearestWithin', () => {
  it('hit exacto se devuelve a sí mismo', () => {
    expect(nearestWithin(T, T[1]!)).toBe(T[1])
  })

  it('elige el más cercano en cualquier dirección', () => {
    expect(nearestWithin(T, '2026-07-11T02:54:00')).toBe(T[1]) // -114 s vs +398 s… gana T[1]
    expect(nearestWithin(T, '2026-07-11T02:57:00')).toBe(T[1])
  })

  it('empate exacto → el anterior (regla de pickClosest)', () => {
    const times = ['2026-07-11T03:00:00', '2026-07-11T03:02:00']
    expect(nearestWithin(times, '2026-07-11T03:01:00')).toBe(times[0])
  })

  it('fuera de tolerancia → null, lista vacía → null', () => {
    expect(nearestWithin(T, '2026-07-11T06:00:00')).toBeNull()
    expect(nearestWithin(T, T[0]!, 0)).toBe(T[0]) // distancia 0 ≤ 0
    expect(nearestWithin([], T[0]!)).toBeNull()
  })

  it('tolerancia personalizada se respeta', () => {
    expect(nearestWithin(T, '2026-07-11T02:52:00', 60)).toBeNull()
    expect(nearestWithin(T, '2026-07-11T02:52:00', 120)).toBe(T[0])
  })

  it('caso real de las fixtures: frame sin fila exacta casa con su vecino', () => {
    expect(joinCase.deltaS).toBeLessThanOrEqual(JOIN_TOLERANCE_S)
    const dayTimes = phenDay.site === joinCase.site ? phenDay.times : null
    // el joinCase puede caer en otro site; deriva sus times directamente
    const times = dayTimes ?? [joinCase.phenVolTime]
    expect(nearestWithin(times, joinCase.rasterVolTime)).toBe(joinCase.phenVolTime)
  })
})
