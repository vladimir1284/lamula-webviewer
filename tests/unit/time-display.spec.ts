// Formateo de hora para display (D28). En UTC el output es byte-idéntico
// al render histórico (slice/`${iso}Z`) — los tests lo fijan como contrato.
// Para local se pasa tz explícita (America/New_York, EDT en julio = UTC-4).
import { describe, expect, it } from 'vitest'
import { clockSuffix, formatFull, formatHhmm } from '../../utils/time-display'

const NY = 'America/New_York'

describe('utils/time-display — formatHhmm', () => {
  it('utc: byte-idéntico a iso.slice(11,16)', () => {
    expect(formatHhmm('2026-07-11T03:08:18', 'utc')).toBe('03:08')
  })

  it('local con tz fija', () => {
    expect(formatHhmm('2026-07-11T03:08:18', 'local', NY)).toBe('23:08')
  })

  it('local: cruce de medianoche (el día local difiere del UTC)', () => {
    expect(formatHhmm('2026-07-11T02:30:00', 'local', NY)).toBe('22:30')
  })
})

describe('utils/time-display — formatFull', () => {
  it('utc: byte-idéntico al render histórico `${iso}Z`', () => {
    expect(formatFull('2026-07-11T03:08:18', 'utc')).toBe('2026-07-11T03:08:18Z')
  })

  it('local con tz fija: fecha local + abreviatura de zona', () => {
    expect(formatFull('2026-07-11T03:08:18', 'local', NY)).toBe('2026-07-10 23:08:18 EDT')
  })

  it('local en invierno cambia la abreviatura (EST)', () => {
    expect(formatFull('2026-01-11T03:08:18', 'local', NY)).toBe('2026-01-10 22:08:18 EST')
  })
})

describe('utils/time-display — clockSuffix', () => {
  it('Z solo en utc', () => {
    expect(clockSuffix('utc')).toBe('Z')
    expect(clockSuffix('local')).toBe('')
  })
})
