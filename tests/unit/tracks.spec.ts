// Test CANARIO de la semántica de tracks SCIT (contrato implícito con el
// pipeline, pendiente de confirmación del experto — puerta M4):
// `past` viene reciente→viejo. Si el pipeline cambiara el orden, la
// verificación de continuidad geométrica contra las grabaciones reales
// falla aquí antes de que nadie vea tracks invertidos en el mapa.
import { describe, expect, it } from 'vitest'
import { stormCellAttrs } from '../../shared/contract/attrs'
import { trackChain } from '../../utils/overlay/tracks'
import { phenomena } from '../helpers/derive'

/** Posición AEQD (km) de la celda desde azran_nm — misma geometría que los tracks. */
function positionKm(azranNm: [number, number]): [number, number] {
  const [azDeg, rangeNm] = azranNm
  const rangeKm = rangeNm * 1.852
  const rad = (azDeg * Math.PI) / 180
  return [rangeKm * Math.sin(rad), rangeKm * Math.cos(rad)]
}

describe('trackChain', () => {
  it('convierte km→m e invierte past a orden de dibujo (viejo→reciente)', () => {
    const chain = trackChain({
      past: [[1, 2], [3, 4]], // reciente→viejo (contrato)
      forecast: [[5, 6]],
    })
    expect(chain.past).toEqual([[3000, 4000], [1000, 2000]])
    expect(chain.forecast).toEqual([[5000, 6000]])
  })

  it('celda sin tracks (nueva) → cadenas vacías', () => {
    expect(trackChain({})).toEqual({ past: [], forecast: [] })
  })

  it('CANARIO: en las grabaciones reales, past[0] es el punto más cercano a la posición actual', () => {
    const cells = phenomena
      .filter(p => p.kind === 'storm_cell')
      .map(p => stormCellAttrs(JSON.parse(p.attrs) as Record<string, unknown>))
      .filter(a => a.azran_nm && a.past && a.past.length >= 2)
    expect(cells.length).toBeGreaterThan(10) // señal suficiente

    let consistent = 0
    for (const a of cells) {
      const [px, py] = positionKm(a.azran_nm!)
      const first = a.past![0]!
      const last = a.past!.at(-1)!
      const dFirst = Math.hypot(first[0] - px, first[1] - py)
      const dLast = Math.hypot(last[0] - px, last[1] - py)
      if (dFirst < dLast) consistent++
    }
    // ≥90 %: celdas erráticas pueden violar la monotonía puntualmente,
    // pero una inversión del contrato la violaría en masa
    expect(consistent / cells.length).toBeGreaterThan(0.9)
  })
})
