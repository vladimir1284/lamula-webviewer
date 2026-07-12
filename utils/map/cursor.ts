// Muestra bajo el cursor: nivel crudo del COG + su interpretación
// según el contrato (0 = nodata, 1 = range folded, ≥ 2 = físico).
export interface CursorSample {
  level: number
  /** valor físico (nivel · scale + offset); null si nodata o range folded */
  value: number | null
  rangeFolded: boolean
}

export function sampleFromLevel(
  level: number,
  valueScale: number,
  valueOffset: number,
): CursorSample | null {
  if (!Number.isFinite(level) || level <= 0) return null
  if (level === 1) return { level, value: null, rangeFolded: true }
  return { level, value: level * valueScale + valueOffset, rangeFolded: false }
}
