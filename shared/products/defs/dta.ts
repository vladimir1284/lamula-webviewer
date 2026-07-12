// DTA — acumulado total de tormenta digital, producto 172. Feed real:
// scale 0.762, offset 0 → rango 0 … ~194 mm.
//
// Paleta DRAFT. Pendiente de validación del experto (M2).
import type { RasterProductDef } from '../types'

export const dta: RasterProductDef = {
  code: 172,
  mnemonic: 'DTA',
  name: 'Precipitación total de tormenta',
  category: 'precipitation',
  unit: 'mm',
  palette: {
    unit: 'mm',
    mode: 'steps',
    stops: [
      [0.25, '#c7e9c0'],
      [5, '#7bc87c'],
      [12, '#2f9e44'],
      [25, '#ffff00'],
      [50, '#ff9000'],
      [100, '#ff0000'],
      [150, '#ff00ff'],
    ],
    ticks: [5, 12, 25, 50, 100, 150],
    rangeFoldedColor: null,
  },
}
