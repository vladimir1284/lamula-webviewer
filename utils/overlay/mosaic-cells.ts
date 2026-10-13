// Identidad y color de celdas multi-radar (P5, D45): dos radares del mismo
// dominio pueden detectar celdas con el mismo cell_id del RPG (los IDs son
// locales a cada sitio, no globales) — sin prefijo de sitio colisionarían en
// el mapa, la tabla y la selección. Sin deduplicar entre radares: si ambos
// ven la misma tormenta, se muestran las dos (decisión explícita).
export const MOSAIC_CELL_SEP = ':'

export function mosaicCellId(site: string, cellId: string): string {
  return `${site}${MOSAIC_CELL_SEP}${cellId}`
}

/** paleta fija, ciclada por posición del sitio en `site_ids` del dominio —
 * estable mientras no cambie la composición del dominio (no depende de hash). */
export const SITE_COLORS = ['#2dd4bf', '#f59e0b', '#a78bfa', '#f472b6', '#4ade80', '#60a5fa']

export function siteColor(site: string, siteOrder: readonly string[]): string {
  const idx = siteOrder.indexOf(site)
  return SITE_COLORS[(idx < 0 ? 0 : idx) % SITE_COLORS.length]!
}
