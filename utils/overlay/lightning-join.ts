// Join por VENTANA del overlay de rayos: a diferencia de fenómenos/VWP
// (nearestWithin sobre un instante), los rayos de un frame son los caídos
// durante su intervalo de observación (vol_time anterior, vol_time]. Los
// cubos de 300 s del índice se cruzan con esa ventana y los strikes se
// normalizan a progreso 0–1 (regla D24 aplicada a ventanas: fuera de
// ventana no se pinta nada — rayos viejos presentados como actuales serían
// peor que un hueco visible).
import type { LightningBucketFile, LightningBucketMeta } from '#shared/contract'
import { naiveUtcToEpochMs } from '#shared/contract'

/** Ventana máxima: sin frame anterior conocido (primer frame del día,
 * borde de la grabación) se asume 600 s; un hueco del feed mayor también
 * se recorta a esto — comprimir 1 h de rayos en un bucle de 5 s los
 * presentaría como una tormenta irreal. */
export const LIGHTNING_WINDOW_FALLBACK_S = 600

/** Ventana de observación en epoch ms: (start, end]. */
export interface ObservationWindow {
  startMs: number
  endMs: number
}

export function observationWindow(
  volTime: string,
  prevVolTime: string | null,
): ObservationWindow {
  const endMs = naiveUtcToEpochMs(volTime)
  const floorMs = endMs - LIGHTNING_WINDOW_FALLBACK_S * 1000
  const prevMs = prevVolTime === null ? floorMs : naiveUtcToEpochMs(prevVolTime)
  return { startMs: Math.max(prevMs, floorMs), endMs }
}

/** Cubos del índice que solapan la ventana (los de strike_count 0 no
 * aportan strikes pero se excluyen aquí ya: no hay nada que fetchear). */
export function bucketsInWindow(
  buckets: LightningBucketMeta[],
  w: ObservationWindow,
): LightningBucketMeta[] {
  return buckets.filter((b) => {
    if (b.strike_count === 0 || b.r2_key === null) return false
    const startMs = naiveUtcToEpochMs(b.bucket_start)
    // [start, start+s) solapa (w.start, w.end]: strikes con t > w.start
    // exigen fin de cubo estrictamente posterior; t ≤ w.end admite un cubo
    // que empieza exactamente en w.end (contendría t = w.end con offset 0)
    return startMs <= w.endMs && startMs + b.bucket_s * 1000 > w.startMs
  })
}

/** Descarga caída en la ventana, con progreso temporal normalizado. */
export interface NormalizedStrike {
  lon: number
  lat: number
  /** 0 = inicio de la ventana, 1 = fin (= vol_time del frame) */
  progress: number
}

/** Strikes de los ficheros de cubo que caen en (start, end], normalizados.
 * Orden de llegada del bucle: ascendente por progress. */
export function strikesInWindow(
  files: LightningBucketFile[],
  w: ObservationWindow,
): NormalizedStrike[] {
  const span = w.endMs - w.startMs
  const out: NormalizedStrike[] = []
  for (const file of files) {
    const baseMs = naiveUtcToEpochMs(file.bucket_start)
    for (const [lon, lat, offsetS] of file.strikes) {
      const t = baseMs + offsetS * 1000
      if (t <= w.startMs || t > w.endMs) continue
      out.push({ lon, lat, progress: (t - w.startMs) / span })
    }
  }
  return out.sort((a, b) => a.progress - b.progress)
}
