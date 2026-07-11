import { describe, expect, it } from 'vitest'
import { minutesSince } from '~/utils/freshness'

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
