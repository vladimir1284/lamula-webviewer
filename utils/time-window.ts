// Ventana explícita de 72 h de retención (decisión 11): días UTC que
// intersectan [last_seen_at − 72h, last_seen_at]. Anclada a last_seen_at,
// no a wall-clock — un radar muerto sigue mostrando sus días con datos, y
// las fixtures (fijas en el tiempo) no se pudren.
import { naiveUtcToEpochMs } from '#shared/contract'

const DAY_MS = 86_400_000
const WINDOW_MS = 72 * 3_600_000

const startOfUtcDayMs = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Días UTC ascendentes (YYYY-MM-DD) de la ventana de 72 h terminando en lastSeenAt. */
export function dayWindow72h(lastSeenAt: string): string[] {
  const endMs = naiveUtcToEpochMs(lastSeenAt)
  const startMs = endMs - WINDOW_MS
  const days: string[] = []
  for (let cursor = startOfUtcDayMs(startMs); cursor <= endMs; cursor += DAY_MS) {
    days.push(isoDay(cursor))
  }
  return days
}
