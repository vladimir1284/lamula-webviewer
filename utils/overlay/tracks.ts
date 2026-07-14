// Tracks SCIT (packets 23/24) de una celda, listos para dibujar.
//
// Semántica del contrato (deducida de las grabaciones reales y verificada
// por el test canario de continuidad en tests/unit/tracks.spec.ts;
// pendiente de confirmación del experto — puerta M4):
//   - `past` viene reciente→viejo; `forecast` cercano→lejano.
//   - Los puntos son [x_km, y_km] AEQD radar-céntricos; la proyección
//     registrada (`AEQD:{site}`) trabaja en metros → aquí se convierte.
// La cadena dibujable: past.at(-1) → … → past[0] → posición actual
// (lat/lon de la fila) → forecast[0] → …
import type { StormCellAttrs, TrackPoint } from '#shared/contract'

export interface TrackChain {
  /** posiciones pasadas en metros AEQD, viejo→reciente (orden de dibujo) */
  past: [number, number][]
  /** posiciones pronosticadas en metros AEQD, cercano→lejano */
  forecast: [number, number][]
}

const toMeters = (points: TrackPoint[]): [number, number][] =>
  points.map(([xKm, yKm]) => [xKm * 1000, yKm * 1000])

export function trackChain(attrs: StormCellAttrs): TrackChain {
  return {
    past: toMeters([...(attrs.past ?? [])].reverse()),
    forecast: toMeters(attrs.forecast ?? []),
  }
}
