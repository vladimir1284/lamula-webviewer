// DAA — acumulado digital 1 h, producto 170. Feed real: scale ~0.33
// (varía por volumen), offset ~-0.31 → rango ~0 … 85 mm.
//
// Paleta DRAFT. Pendiente de validación del experto (M2).
import type { RasterProductDef } from '../types'

export const daa: RasterProductDef = {
  code: 170,
  mnemonic: 'DAA',
  name: 'Precipitación 1 h',
  category: 'precipitation',
  unit: 'mm',
  palette: {
    unit: 'mm',
    mode: 'steps',
    stops: [
      [0.25, '#c7e9c0'],
      [2.5, '#7bc87c'],
      [6, '#2f9e44'],
      [12, '#ffff00'],
      [25, '#ff9000'],
      [50, '#ff0000'],
      [75, '#ff00ff'],
    ],
    ticks: [2.5, 6, 12, 25, 50, 75],
    rangeFoldedColor: null,
  },
}
