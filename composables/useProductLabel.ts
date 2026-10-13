import type { RasterProductDef } from '#shared/products'

/**
 * Nombre display de un producto raster, traducido (F5/D52).
 *
 * El catálogo de productos (`shared/products/defs/*.ts`) es puro y sigue
 * llevando su `name` en español: es el respaldo. Si el feed trae un producto
 * que el catálogo i18n todavía no conoce, se muestra ese nombre — nunca la
 * clave cruda `products.XXX.name`.
 */
export function useProductLabel() {
  const { t, te } = useI18n()

  return (def: Pick<RasterProductDef, 'mnemonic' | 'name'> | null | undefined, fallback: string): string => {
    if (!def) return fallback
    const key = `products.${def.mnemonic}.name`
    return te(key) ? t(key) : def.name
  }
}
