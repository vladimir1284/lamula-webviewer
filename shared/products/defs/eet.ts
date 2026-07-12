// EET — echo tops mejorado, producto 135. Feed real: scale 1, offset -2
// → nivel 2 = 0 kft; techos reales ≤ ~70 kft.
//
// Paleta DRAFT. Pendiente de validación del experto (M2).
import type { RasterProductDef } from '../types'

export const eet: RasterProductDef = {
  code: 135,
  mnemonic: 'EET',
  name: 'Topes de eco',
  category: 'derived',
  unit: 'kft',
  palette: {
    unit: 'kft',
    mode: 'steps',
    stops: [
      [2, '#c7e9ff'],
      [10, '#7fb9ff'],
      [20, '#3c78ff'],
      [30, '#0032c8'],
      [40, '#00c800'],
      [50, '#ffff00'],
      [60, '#ff7d00'],
      [70, '#ff0000'],
    ],
    ticks: [10, 20, 30, 40, 50, 60, 70],
    rangeFoldedColor: null,
  },
}
