// N0B — reflectividad base (0.5°), producto 153. Feed real: scale 0.5,
// offset -33 → rango físico -32 … 94.5 dBZ.
//
// Paleta DRAFT: escalones clásicos NWS de 5 dBZ (semántica del legado).
// Pendiente de validación del experto de dominio (puerta M2).
import type { RasterProductDef } from '../types'

export const n0b: RasterProductDef = {
  code: 153,
  mnemonic: 'N0B',
  name: 'Reflectividad base',
  category: 'base',
  unit: 'dBZ',
  palette: {
    unit: 'dBZ',
    mode: 'steps',
    stops: [
      [5, '#04e9e7'],
      [10, '#019ff4'],
      [15, '#0300f4'],
      [20, '#02fd02'],
      [25, '#01c501'],
      [30, '#008e00'],
      [35, '#fdf802'],
      [40, '#e5bc00'],
      [45, '#fd9500'],
      [50, '#fd0000'],
      [55, '#d40000'],
      [60, '#bc0000'],
      [65, '#f800fd'],
      [70, '#9854c6'],
      [75, '#fdfdfd'],
    ],
    ticks: [5, 15, 25, 35, 45, 55, 65, 75],
    rangeFoldedColor: '#77007d',
  },
}
