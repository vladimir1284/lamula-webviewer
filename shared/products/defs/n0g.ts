// N0G — velocidad radial base (0.5°), producto 154. Feed real: scale 0.5,
// offset -64.5 → rango físico -63.5 … 63 kt (negativo = hacia el radar).
//
// Paleta DRAFT: divergente verde (acercándose) / rojo (alejándose),
// brillo ∝ magnitud — semántica NWS. Pendiente de validación (M2).
import type { RasterProductDef } from '../types'

export const n0g: RasterProductDef = {
  code: 154,
  mnemonic: 'N0G',
  name: 'Velocidad radial',
  category: 'base',
  unit: 'kt',
  palette: {
    unit: 'kt',
    mode: 'interpolated',
    stops: [
      [-64, '#04e304'],
      [-30, '#029102'],
      [-5, '#015501'],
      [0, '#767676'],
      [5, '#5e0101'],
      [30, '#a30202'],
      [64, '#fc0202'],
    ],
    ticks: [-60, -40, -20, 0, 20, 40, 60],
    rangeFoldedColor: '#8b00ff',
  },
}
