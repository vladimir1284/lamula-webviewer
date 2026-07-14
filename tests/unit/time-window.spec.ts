import { describe, expect, it } from 'vitest'
import { dayWindow72h } from '../../utils/time-window'

describe('dayWindow72h (ventana de retención, decisión 11)', () => {
  it('medianoche exacta: la ventana toca 4 días calendario (72h de duración)', () => {
    expect(dayWindow72h('2026-07-11T00:00:00')).toEqual([
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
    ])
  })

  it('mitad de día: la ventana cae en 4 días distintos', () => {
    expect(dayWindow72h('2026-07-11T12:00:00')).toEqual([
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
    ])
  })

  it('cruce de mes', () => {
    expect(dayWindow72h('2026-08-01T05:00:00')).toEqual([
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ])
  })

  it('cruce de año', () => {
    expect(dayWindow72h('2026-01-01T00:00:00')).toEqual([
      '2025-12-29',
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
    ])
  })

  it('siempre ascendente y termina en el día del propio lastSeenAt', () => {
    const days = dayWindow72h('2026-07-11T03:16:49')
    expect(days).toEqual([...days].sort())
    expect(days.at(-1)).toBe('2026-07-11')
  })
})
