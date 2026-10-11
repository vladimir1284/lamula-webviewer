// Post-procesado común a ambos adaptadores: mismas filas → mismos DTOs.
import type {
  Health,
  LightningBucketMeta,
  LightningBucketRow,
  MosaicContribution,
  MosaicRasterMeta,
  MosaicRasterRow,
  Phenomenon,
  PhenomenonRow,
  RadarHealth,
  RasterMeta,
  RasterRow,
  WindGridMeta,
  WindGridRow,
} from '../../shared/contract'
import { FRESH_MAX_MINUTES, naiveUtcToEpochMs } from '../../shared/contract'

/** URL pública del COG desde la clave literal de R2 (el DAL no construye claves). */
export function toRasterMeta(row: Omit<RasterRow, 'size_bytes'>, r2BaseUrl: string | null): RasterMeta {
  const base = r2BaseUrl?.replace(/\/+$/, '')
  return { ...row, cog_url: base ? `${base}/${row.r2_key}` : null }
}

/** URL pública del JSON u/v desde la clave literal de R2. */
export function toWindMeta(row: Omit<WindGridRow, 'size_bytes'>, r2BaseUrl: string | null): WindGridMeta {
  const base = r2BaseUrl?.replace(/\/+$/, '')
  return { ...row, wind_url: base ? `${base}/${row.r2_key}` : null }
}

/** URL pública del JSON de strikes; cubo sin descargas (r2_key null) → null. */
export function toLightningMeta(
  row: Omit<LightningBucketRow, 'size_bytes'>,
  r2BaseUrl: string | null,
): LightningBucketMeta {
  const base = r2BaseUrl?.replace(/\/+$/, '')
  return { ...row, lightning_url: base && row.r2_key ? `${base}/${row.r2_key}` : null }
}

/** URL pública del COG compuesto + `contributing` TEXT → array.
 * La procedencia es parte del contrato, no depuración: sin ella el viewer
 * no puede decir qué radares está mirando el usuario. Una fila con JSON
 * corrupto degrada a lista vacía en vez de tumbar la respuesta — misma
 * política que `attrs`. */
export function toMosaicMeta(
  row: Omit<MosaicRasterRow, 'size_bytes'>,
  r2BaseUrl: string | null,
): MosaicRasterMeta {
  const base = r2BaseUrl?.replace(/\/+$/, '')
  const { contributing: raw, ...cols } = row
  let contributing: MosaicContribution[] = []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) contributing = parsed as MosaicContribution[]
  }
  catch {
    // procedencia ilegible → lista vacía; el COG sigue siendo pintable
  }
  return { ...cols, contributing, cog_url: base ? `${base}/${row.r2_key}` : null }
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

/** Elige entre candidato anterior y siguiente el más cercano a t (empate → anterior).
 * `get` existe porque el mosaico se indexa por `slot_time` (rejilla propia)
 * y no por `vol_time`: misma regla de desempate, otra columna. */
export function pickClosestBy<T>(
  prev: T | null,
  next: T | null,
  t: string,
  get: (row: T) => string,
): T | null {
  if (!prev) return next
  if (!next) return prev
  const target = naiveUtcToEpochMs(t)
  const dPrev = Math.abs(target - naiveUtcToEpochMs(get(prev)))
  const dNext = Math.abs(naiveUtcToEpochMs(get(next)) - target)
  return dNext < dPrev ? next : prev
}

export function pickClosest<T extends { vol_time: string }>(
  prev: T | null,
  next: T | null,
  t: string,
): T | null {
  return pickClosestBy(prev, next, t, r => r.vol_time)
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
