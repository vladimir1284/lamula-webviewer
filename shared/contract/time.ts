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

/** Padding del índice de viento: la tolerancia del join (1 h) supera los
 * 600 s de fenómenos/VWP, así que un frame pegado a medianoche debe poder
 * casar con un valid_time del día vecino — desviación deliberada del
 * patrón phen/vwp (docs/pipeline-viento.md). */
export const WIND_DAY_PAD_S = 7200

/** Rango [inicio − pad, fin + pad) de un día UTC. */
export function dayRangePadded(day: string, padSeconds: number): { from: string, to: string } {
  const { from, to } = dayRange(day)
  return {
    from: new Date(Date.parse(`${from}Z`) - padSeconds * 1000).toISOString().slice(0, 19),
    to: new Date(Date.parse(`${to}Z`) + padSeconds * 1000).toISOString().slice(0, 19),
  }
}
