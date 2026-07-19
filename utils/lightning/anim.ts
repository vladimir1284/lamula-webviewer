// Matemática pura del bucle de rayos (testeable sin canvas ni reloj real):
// el intervalo de observación del frame se reproduce en un bucle corto y
// cada descarga aparece en su instante proporcional (criterio QA de
// proporcionalidad) y se desvanece estilo Windy: blanco brillante →
// amarillo → naranja → púrpura, alpha decreciente y radio creciente
// (onda expansiva). La edad es MODULAR: el bucle empalma sin costura — un
// rayo del final de la ventana sigue desvaneciéndose tras el reinicio.
import type { NormalizedStrike } from '../overlay/lightning-join'

/** Duración del bucle visual. */
export const LOOP_MS = 5000

/** Fracción del bucle que una descarga permanece visible tras caer. */
export const LIFE_FRACTION = 0.15

/** Fase 0–1 del bucle para un instante dado (origen = reinicio del reloj). */
export function loopPhase(nowMs: number, originMs: number): number {
  return ((nowMs - originMs) % LOOP_MS) / LOOP_MS
}

/**
 * factorVida: 1 recién caído → 0 extinto; null si aún no cayó (en el
 * tiempo del bucle) o ya se desvaneció.
 */
export function lifeFactor(progress: number, phase: number): number | null {
  const age = (phase - progress + 1) % 1
  if (age > LIFE_FRACTION) return null
  return 1 - age / LIFE_FRACTION
}

/** Rampa de enfriamiento (factorVida 1 → 0). */
const RAMP: [number, [number, number, number]][] = [
  [1.0, [255, 255, 255]], // blanco brillante
  [0.66, [255, 235, 59]], // amarillo
  [0.33, [255, 152, 0]], // naranja
  [0.0, [156, 39, 176]], // púrpura
]

export function strikeColor(life: number): [number, number, number] {
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [hi, cHi] = RAMP[i]!
    const [lo, cLo] = RAMP[i + 1]!
    if (life >= lo) {
      const t = (life - lo) / (hi - lo)
      return [
        Math.round(cLo[0] + (cHi[0] - cLo[0]) * t),
        Math.round(cLo[1] + (cHi[1] - cLo[1]) * t),
        Math.round(cLo[2] + (cHi[2] - cLo[2]) * t),
      ]
    }
  }
  return RAMP.at(-1)![1]
}

/** Radio en px: crece sutilmente mientras muere (trueno expandiéndose). */
export function strikeRadius(life: number, base = 3): number {
  return base * (1 + (1 - life) * 1.2)
}

/** Punto listo para pintar. */
export interface StrikeDot {
  lon: number
  lat: number
  life: number
  radius: number
  color: [number, number, number]
  /** canal alfa = factorVida (desvanecimiento suave) */
  alpha: number
}

/** Lista de pintado de un tick: solo las descargas vivas en esta fase. */
export function drawList(
  strikes: readonly NormalizedStrike[],
  phase: number,
  baseRadius = 3,
): StrikeDot[] {
  const out: StrikeDot[] = []
  for (const s of strikes) {
    const life = lifeFactor(s.progress, phase)
    if (life === null) continue
    out.push({
      lon: s.lon,
      lat: s.lat,
      life,
      radius: strikeRadius(life, baseRadius),
      color: strikeColor(life),
      alpha: life,
    })
  }
  return out
}
