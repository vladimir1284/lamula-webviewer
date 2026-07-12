// Catálogo estático del viewer, keyed por products.code (decisión 5).
// Un producto raster del feed sin entrada aquí se lista pero no renderiza
// (el viewer avisa "producto sin paleta") — así un producto nuevo en el
// pipeline no rompe la app.
import type { RasterProductDef } from './types'
import { daa } from './defs/daa'
import { dta } from './defs/dta'
import { du3 } from './defs/du3'
import { dvl } from './defs/dvl'
import { eet } from './defs/eet'
import { n0b } from './defs/n0b'
import { n0g } from './defs/n0g'

export const RASTER_PRODUCTS: Readonly<Record<number, RasterProductDef>> = Object.freeze({
  [dvl.code]: dvl,
  [eet.code]: eet,
  [n0b.code]: n0b,
  [n0g.code]: n0g,
  [daa.code]: daa,
  [dta.code]: dta,
  [du3.code]: du3,
})

export function rasterProductDef(code: number): RasterProductDef | null {
  return RASTER_PRODUCTS[code] ?? null
}

export * from './palette'
export * from './types'
