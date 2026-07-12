// Post-procesado común a ambos adaptadores: mismas filas → mismos DTOs.
import type {
  Health,
  Phenomenon,
  PhenomenonRow,
  RadarHealth,
  RasterMeta,
  RasterRow,
} from '../../shared/contract'
import { FRESH_MAX_MINUTES, naiveUtcToEpochMs } from '../../shared/contract'

/** URL pública del COG desde la clave literal de R2 (el DAL no construye claves). */
export function toRasterMeta(row: Omit<RasterRow, 'size_bytes'>, r2BaseUrl: string | null): RasterMeta {
  const base = r2BaseUrl?.replace(/\/+$/, '')
  return { ...row, cog_url: base ? `${base}/${row.r2_key}` : null }
}

/** attrs TEXT → objeto; una fila corrupta no tumba la respuesta completa. */
export function toPhenomenon(row: PhenomenonRow): Phenomenon {
  let attrs: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(row.attrs)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      attrs = parsed as Record<string, unknown>
    }
  }
  catch {
    // attrs ilegible → objeto vacío; la posición de la fila sigue siendo útil
  }
  return { ...row, attrs }
}

/** Elige entre candidato anterior y siguiente el más cercano a t (empate → anterior). */
export function pickClosest<T extends { vol_time: string }>(
  prev: T | null,
  next: T | null,
  t: string,
): T | null {
  if (!prev) return next
  if (!next) return prev
  const target = naiveUtcToEpochMs(t)
  const dPrev = Math.abs(target - naiveUtcToEpochMs(prev.vol_time))
  const dNext = Math.abs(naiveUtcToEpochMs(next.vol_time) - target)
  return dNext < dPrev ? next : prev
}

export function buildHealth(
  radars: { site_id: string, last_seen_at: string }[],
  now: Date,
): Health {
  const items: RadarHealth[] = radars.map((r) => {
    const minutes = Math.max(
      0,
      Math.floor((now.getTime() - naiveUtcToEpochMs(r.last_seen_at)) / 60_000),
    )
    return {
      site_id: r.site_id,
      last_seen_at: r.last_seen_at,
      minutes_since_last_scan: minutes,
      fresh: minutes <= FRESH_MAX_MINUTES,
    }
  })
  return { generated_at: now.toISOString(), radars: items }
}
