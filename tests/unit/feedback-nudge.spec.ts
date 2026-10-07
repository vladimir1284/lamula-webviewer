import { describe, expect, it } from 'vitest'
import { calcSnoozeUntil, shouldShowNudge } from '~/utils/feedback/nudge'

describe('shouldShowNudge', () => {
  const startMs = 1000000000000

  it('no muestra nudge antes de 90 segundos de sesión', () => {
    const nudge = { shownCount: 0, snoozeUntil: null, submitted: false }
    const nowMs = startMs + 89000 // 89 s
    expect(shouldShowNudge(nudge, startMs, nowMs)).toBe(false)
  })

  it('muestra nudge tras 90 segundos de sesión', () => {
    const nudge = { shownCount: 0, snoozeUntil: null, submitted: false }
    const nowMs = startMs + 90000 // 90 s
    expect(shouldShowNudge(nudge, startMs, nowMs)).toBe(true)
  })

  it('no muestra nudge si ya fue enviado', () => {
    const nudge = { shownCount: 1, snoozeUntil: null, submitted: true }
    const nowMs = startMs + 100000
    expect(shouldShowNudge(nudge, startMs, nowMs)).toBe(false)
  })

  it('no muestra nudge si ya se mostró 3 o más veces', () => {
    const nudge = { shownCount: 3, snoozeUntil: null, submitted: false }
    const nowMs = startMs + 100000
    expect(shouldShowNudge(nudge, startMs, nowMs)).toBe(false)
  })

  it('no muestra nudge si está dentro del período de snooze', () => {
    const nowMs = startMs + 100000
    const nudge = { shownCount: 1, snoozeUntil: nowMs + 10000, submitted: false }
    expect(shouldShowNudge(nudge, startMs, nowMs)).toBe(false)
  })

  it('calcula fecha de posposición "later" (+3 días) y "never" (+7 días)', () => {
    const nowMs = 1000000000000
    const later = calcSnoozeUntil('later', nowMs)
    const never = calcSnoozeUntil('never', nowMs)

    expect(later).toBe(nowMs + 3 * 24 * 3600 * 1000)
    expect(never).toBe(nowMs + 7 * 24 * 3600 * 1000)
  })
})
