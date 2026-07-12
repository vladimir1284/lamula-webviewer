// DVL — VIL digital, producto 134. Feed real: scale 0.35, offset -0.7
// → nivel 2 = 0 kg/m², máximo teórico ~88.5 kg/m².
//
// Paleta DRAFT. Pendiente de validación del experto (M2).
import type { RasterProductDef } from '../types'

export const dvl: RasterProductDef = {
  code: 134,
  mnemonic: 'DVL',
  name: 'VIL digital',
  category: 'derived',
  unit: 'kg/m2',
  palette: {
    unit: 'kg/m2',
    mode: 'steps',
    stops: [
      [0.1, '#9fdfff'],
      [5, '#0077db'],
      [10, '#00b03c'],
      [20, '#ffff00'],
      [35, '#ff9000'],
      [50, '#ff0000'],
      [65, '#c80000'],
      [80, '#ff00ff'],
    ],
    ticks: [5, 10, 20, 35, 50, 65, 80],
    rangeFoldedColor: null,
  },
}
