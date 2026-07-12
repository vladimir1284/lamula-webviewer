// DU3 — acumulado digital 3 h seleccionable, producto 173. Feed real:
// scale ~0.37-0.49 (varía por volumen) → rango ~0 … 125 mm.
//
// Paleta DRAFT. Pendiente de validación del experto (M2).
import type { RasterProductDef } from '../types'

export const du3: RasterProductDef = {
  code: 173,
  mnemonic: 'DU3',
  name: 'Precipitación 3 h',
  category: 'precipitation',
  unit: 'mm',
  palette: {
    unit: 'mm',
    mode: 'steps',
    stops: [
      [0.25, '#c7e9c0'],
      [4, '#7bc87c'],
      [10, '#2f9e44'],
      [20, '#ffff00'],
      [40, '#ff9000'],
      [75, '#ff0000'],
      [125, '#ff00ff'],
    ],
    ticks: [4, 10, 20, 40, 75, 125],
    rangeFoldedColor: null,
  },
}
