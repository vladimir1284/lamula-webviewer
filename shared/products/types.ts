// Catálogo rico de productos raster del viewer (decisión 5): D1 `products`
// solo aporta code/mnemonic/unit/kind; nombre display, categoría y paleta
// viven aquí, keyed por `code`.
import type { Palette } from './palette'

export const PRODUCT_CATEGORIES = ['base', 'derived', 'precipitation'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export interface RasterProductDef {
  code: number
  mnemonic: string
  /** nombre display (es; i18n llega en F5) */
  name: string
  category: ProductCategory
  /** unidad física — debe coincidir con products.unit de D1 */
  unit: string
  palette: Palette
}
