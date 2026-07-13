// Huecos visibles en la timeline (decisión: datos faltantes se marcan, no
// se ocultan). Umbral relativo a la cadencia real de la serie: un
// intervalo > max(2×mediana, 10 min) se marca como hueco. Con <3 times no
// hay señal suficiente para una mediana — no se computan huecos.
import { naiveUtcToEpochMs } from '#shared/contract'

export interface Gap {
  after: string
  before: string
  ms: number
}

export const GAP_MIN_MS = 10 * 60_000

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** times debe venir ascendente (contrato de /api/rasters/times y /day). */
export function computeGaps(times: string[]): Gap[] {
  if (times.length < 3) return []

  const intervals: number[] = []
  for (let i = 1; i < times.length; i++) {
    intervals.push(naiveUtcToEpochMs(times[i]!) - naiveUtcToEpochMs(times[i - 1]!))
  }
  const threshold = Math.max(2 * median(intervals), GAP_MIN_MS)

  const gaps: Gap[] = []
  for (let i = 0; i < intervals.length; i++) {
    if (intervals[i]! > threshold) {
      gaps.push({ after: times[i]!, before: times[i + 1]!, ms: intervals[i]! })
    }
  }
  return gaps
}
