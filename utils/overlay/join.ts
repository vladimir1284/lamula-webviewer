// Join temporal del overlay (decisión 24): el frame raster mostrado se
// casa con el volumen de fenómenos/VWP más cercano dentro de una
// tolerancia. Fuera de tolerancia NO se muestra nada (celdas de otro
// momento presentadas como actuales serían peor que un hueco visible).
import { naiveUtcToEpochMs } from '#shared/contract'

/** ~2 volúmenes VCP: cubre los frames N0B/N0G intermedios sin arrastrar tormentas viejas. */
export const JOIN_TOLERANCE_S = 600

/** Viento GFS: valid_times horarios → media distancia nominal 30 min más un
 * fichero perdido; 3 h dejaría viento de otra masa de aire como "actual". */
export const WIND_JOIN_TOLERANCE_S = 3600

/**
 * vol_time de `times` (ascendentes) más cercano a `t` dentro de la
 * tolerancia, o null. Empate → el anterior (misma regla que pickClosest
 * del DAL).
 */
export function nearestWithin(times: string[], t: string, tolS: number = JOIN_TOLERANCE_S): string | null {
  if (times.length === 0) return null
  const target = naiveUtcToEpochMs(t)
  let best: string | null = null
  let bestD = Infinity
  for (const time of times) {
    const d = Math.abs(naiveUtcToEpochMs(time) - target)
    // `<` estricto: en empate gana el primero (el anterior, times asc)
    if (d < bestD) {
      best = time
      bestD = d
    }
  }
  return bestD <= tolS * 1000 ? best : null
}
