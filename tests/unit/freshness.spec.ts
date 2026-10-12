import { describe, expect, it } from 'vitest'
import { freshnessParts, minutesSince } from '~/utils/freshness'

describe('minutesSince', () => {
  const now = new Date('2026-07-10T12:00:00Z')

  it('interpreta timestamps del contrato (sin sufijo de zona) como UTC', () => {
    expect(minutesSince('2026-07-10T11:45:00', now)).toBe(15)
  })

  it('acepta también timestamps con Z explícita', () => {
    expect(minutesSince('2026-07-10T11:00:00Z', now)).toBe(60)
  })

  it('redondea hacia abajo a minutos completos', () => {
    expect(minutesSince('2026-07-10T11:58:31', now)).toBe(1)
  })

  it('devuelve 0 para el instante actual', () => {
    expect(minutesSince('2026-07-10T12:00:00', now)).toBe(0)
  })

  it('lanza ante un timestamp no parseable', () => {
    expect(() => minutesSince('no-es-fecha', now)).toThrow('Timestamp inválido')
  })
})

describe('freshnessParts', () => {
  it('devuelve minutos crudos por debajo de la hora', () => {
    expect(freshnessParts(59)).toEqual({ unit: 'min', value: 59 })
  })

  it('salta a horas en el límite exacto', () => {
    expect(freshnessParts(60)).toEqual({ unit: 'hours', value: 1 })
    expect(freshnessParts(60 * 24 - 1)).toEqual({ unit: 'hours', value: 23 })
  })

  it('salta a días, meses y años en sus límites', () => {
    expect(freshnessParts(60 * 24)).toEqual({ unit: 'days', value: 1 })
    expect(freshnessParts(60 * 24 * 30)).toEqual({ unit: 'months', value: 1 })
    expect(freshnessParts(60 * 24 * 365)).toEqual({ unit: 'years', value: 1 })
  })

  it('conserva el signo con el reloj adelantado (minutos negativos)', () => {
    // La unidad se elige por el valor absoluto, pero el signo sobrevive: es el
    // componente quien pluraliza con Math.abs. El -2 (y no -1) es `Math.floor`
    // sobre un negativo — comportamiento preexistente del `formatFreshness`
    // original, conservado tal cual: redondear hacia cero sería otro cambio.
    expect(freshnessParts(-90)).toEqual({ unit: 'hours', value: -2 })
  })
})
