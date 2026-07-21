// Muestra bajo el cursor: nivel crudo del COG + su interpretación
// según el contrato (0 = nodata, 1 = range folded, ≥ 2 = físico),
// más la posición geográfica del puntero (lon/lat, EPSG:4326).
export interface CursorSample {
  lon: number
  lat: number
  level: number | null
  /** valor físico (nivel · scale + offset); null si nodata, range folded o sin raster */
  value: number | null
  rangeFolded: boolean
}

export function sampleFromLevel(
  level: number,
  valueScale: number,
  valueOffset: number,
  // Halo de suavizado (decisión 33, hallazgo del usuario en producción): con
  // 'smooth' activo, TODO el degradé entre nodata (0) y el nivel real de una
  // celda es interpolación de GPU, no dato — para dBZ (value_offset típico
  // muy negativo) ese degradé completo pasa por valores físicos ≤ 0 que
  // parecen reales pero rodean cualquier zona con reflectividad, no solo el
  // borde 0↔1. `clampNonPositive` (solo el llamador sabe si el producto es
  // dBZ y si `smooth` está activo) trata esos como nodata — ground truth
  // (smooth off) nunca pasa por acá, sigue mostrando dBZ bajo/negativo real.
  clampNonPositive = false,
): { level: number, value: number | null, rangeFolded: boolean } | null {
  if (!Number.isFinite(level)) return null
  // Con 'smooth' (decisión 32/33) el nivel bajo el cursor puede llegar
  // fraccional — bilineal de GPU entre dos niveles enteros reales, o entre
  // un nivel real y nodata/range-folded en el borde de una celda. El nivel
  // solo existe como categoría entera (0/1/≥2); redondear a la más cercana
  // antes de clasificar evita inventar un valor físico (dBZ negativo falso)
  // para un nivel que en realidad es "nodata mezclándose con range folded".
  const rounded = Math.round(level)
  if (rounded <= 0) return null
  if (rounded === 1) return { level: rounded, value: null, rangeFolded: true }
  const value = rounded * valueScale + valueOffset
  if (clampNonPositive && value <= 0) return null
  return { level: rounded, value, rangeFolded: false }
}
