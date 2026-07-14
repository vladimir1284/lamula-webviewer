import { describe, expect, it } from 'vitest'
import { isoToPath, PATH_TIME_RE, pathToIso } from '../../shared/url/time-path'

describe('time-path (datetime compacto en el path)', () => {
  it('roundtrip iso ↔ path', () => {
    const iso = '2026-07-11T03:16:49'
    const seg = isoToPath(iso)
    expect(seg).toBe('20260711T031649')
    expect(PATH_TIME_RE.test(seg)).toBe(true)
    expect(pathToIso(seg)).toBe(iso)
  })

  it('conserva el orden lexicográfico', () => {
    const a = isoToPath('2026-07-11T03:03:49')
    const b = isoToPath('2026-07-11T03:16:49')
    expect(a < b).toBe(true)
  })

  it('rechaza segmentos malformados', () => {
    for (const seg of [
      '',
      'foo',
      '2026-07-11T03:16:49', // ISO con separadores no es un segmento válido
      '20260711T0316', // sin segundos
      '20260711031649', // sin la T
      '20260711T031649Z', // sufijo Z
      '20260711T031649123', // con fracción
    ]) {
      expect(pathToIso(seg), seg).toBeNull()
    }
  })

  it('rechaza fechas que pasan la regex pero no existen', () => {
    for (const seg of [
      '20261311T000000', // mes 13
      '20260732T000000', // día 32
      '20260711T250000', // hora 25
      '20260711T036099', // segundo 99
      '20260229T000000', // 2026 no es bisiesto
    ]) {
      expect(pathToIso(seg), seg).toBeNull()
    }
    expect(pathToIso('20240229T000000')).toBe('2024-02-29T00:00:00') // bisiesto real
  })
})
