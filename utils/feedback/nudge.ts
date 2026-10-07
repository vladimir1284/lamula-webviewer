export interface NudgeState {
  shownCount: number
  snoozeUntil: number | null
  submitted: boolean
}

const MIN_SESSION_DURATION_MS = 90000 // 90 segundos

export function shouldShowNudge(
  nudge: NudgeState,
  sessionStartTimeMs: number,
  nowMs: number,
): boolean {
  if (nudge.submitted) return false
  if (nudge.shownCount >= 3) return false

  if (nudge.snoozeUntil !== null && nowMs < nudge.snoozeUntil) {
    return false
  }

  return nowMs - sessionStartTimeMs >= MIN_SESSION_DURATION_MS
}

export function calcSnoozeUntil(action: 'later' | 'never', nowMs: number): number | null {
  if (action === 'later') {
    return nowMs + 3 * 24 * 3600 * 1000 // 3 días
  }
  if (action === 'never') {
    return nowMs + 7 * 24 * 3600 * 1000 // 7 días
  }
  return null
}
