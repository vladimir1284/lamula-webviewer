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
  return { level: rounded, value: rounded * valueScale + valueOffset, rangeFolded: false }
}
