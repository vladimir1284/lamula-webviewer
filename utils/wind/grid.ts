// Muestreo del campo de viento GFS (WindGridFile, contrato en
// docs/pipeline-viento.md): grilla regular lon/lat row-major desde la
// esquina NO (oeste→este, norte→sur). Puro — sin canvas ni OpenLayers.
import type { WindGridFile } from '#shared/contract'

// (WindUV de uv.ts es dir/speed VWP en kt — esto es el campo GFS en m/s)
export interface WindVector {
  /** m/s hacia el este */
  u: number
  /** m/s hacia el norte */
  v: number
}

export interface GridBounds {
  west: number
  east: number
  south: number
  north: number
}

/** Extensión geográfica cubierta por la grilla (grados). */
export function gridBounds(grid: WindGridFile): GridBounds {
  const { nx, ny, lo1, la1, dx, dy } = grid.header
  return {
    west: lo1,
    east: lo1 + (nx - 1) * dx,
    north: la1,
    south: la1 - (ny - 1) * dy,
  }
}

/**
 * u/v interpolados bilinealmente en (lon, lat), o null fuera de la grilla.
 * Índice row-major: fila j (norte→sur) × columna i (oeste→este).
 */
export function sampleWind(grid: WindGridFile, lon: number, lat: number): WindVector | null {
  const { nx, ny, lo1, la1, dx, dy } = grid.header
  const fi = (lon - lo1) / dx
  const fj = (la1 - lat) / dy
  if (fi < 0 || fi > nx - 1 || fj < 0 || fj > ny - 1 || Number.isNaN(fi) || Number.isNaN(fj)) {
    return null
  }
  const i0 = Math.min(Math.floor(fi), nx - 2)
  const j0 = Math.min(Math.floor(fj), ny - 2)
  const tx = fi - i0
  const ty = fj - j0
  const at = (i: number, j: number) => j * nx + i
  const lerp2 = (arr: number[]) => {
    const a = arr[at(i0, j0)]!
    const b = arr[at(i0 + 1, j0)]!
    const c = arr[at(i0, j0 + 1)]!
    const d = arr[at(i0 + 1, j0 + 1)]!
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
  }
  return { u: lerp2(grid.u), v: lerp2(grid.v) }
}
