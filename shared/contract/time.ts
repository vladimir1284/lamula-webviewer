// Matemática de tiempo sobre timestamps del contrato (ISO-8601 UTC naive).

import { ISO_NAIVE_RE } from './schemas'

/** Epoch ms de un timestamp naive del contrato, interpretado como UTC. */
export function naiveUtcToEpochMs(iso: string): number {
  if (!ISO_NAIVE_RE.test(iso)) {
    throw new Error(`Timestamp fuera del contrato: "${iso}"`)
  }
  return Date.parse(`${iso}Z`)
}

/** Rango [inicio, fin) de un día UTC, en timestamps naive comparables. */
export function dayRange(day: string): { from: string, to: string } {
  const from = `${day}T00:00:00`
  const next = new Date(Date.parse(`${from}Z`) + 86_400_000)
  return { from, to: next.toISOString().slice(0, 19) }
}
