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
  if (!Number.isFinite(level) || level <= 0) return null
  if (level === 1) return { level, value: null, rangeFolded: true }
  return { level, value: level * valueScale + valueOffset, rangeFolded: false }
}
