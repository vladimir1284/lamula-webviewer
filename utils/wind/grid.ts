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
  const u = lerp2(grid.u)
  const v = lerp2(grid.v)
  // NaN = celda sin dato (hueco de la lattice unión del mosaico, ver
  // mergeWindGrids): se trata igual que estar fuera de la grilla — la
  // partícula respawnea en vez de arrastrar NaN por el campo
  if (Number.isNaN(u) || Number.isNaN(v)) return null
  return { u, v }
}

// ── Unión de grillas de varios sitios (mosaico, D49) ─────────────────────
// El pipeline sirve un `WindGridFile` POR SITIO; un dominio de mosaico son
// N radares, así que para pintar una sola capa de partículas hay que unir
// las N grillas en una. Se remuestrea sobre una lattice propia (bbox unión,
// paso = el más fino de las fuentes) muestreando cada fuente con el mismo
// `sampleWind` bilineal: no exige que las grillas estén alineadas entre sí
// y gana la PRIMERA que cubra la celda (no se promedia en el solape —
// promediar dos campos GFS del mismo ciclo no aporta nada y escondería un
// desacuerdo entre ellos).
//
// Las celdas que NO cubre ninguna fuente quedan en NaN a propósito, no en 0:
// `sampleWind` devuelve null ahí (su guard de NaN) y la partícula respawnea,
// que es lo correcto — un 0 sería viento en calma inventado.

/** tope de celdas de la lattice unión: más allá se engrosa el paso. A 0.25°
 * (GFS) son ~128° de lado, de sobra para cualquier dominio de mosaico. */
const MAX_MERGED_CELLS = 512

export function mergeWindGrids(grids: WindGridFile[]): WindGridFile | null {
  if (grids.length === 0) return null
  if (grids.length === 1) return grids[0]!

  const bounds = grids.map(gridBounds)
  const west = Math.min(...bounds.map(b => b.west))
  const east = Math.max(...bounds.map(b => b.east))
  const north = Math.max(...bounds.map(b => b.north))
  const south = Math.min(...bounds.map(b => b.south))

  let dx = Math.min(...grids.map(g => g.header.dx))
  let dy = Math.min(...grids.map(g => g.header.dy))
  if (!(dx > 0) || !(dy > 0)) return grids[0]!
  // engrosa el paso si la unión se dispara (grillas muy separadas)
  while ((east - west) / dx + 1 > MAX_MERGED_CELLS) dx *= 2
  while ((north - south) / dy + 1 > MAX_MERGED_CELLS) dy *= 2

  const nx = Math.floor((east - west) / dx) + 1
  const ny = Math.floor((north - south) / dy) + 1
  const u = new Array<number>(nx * ny).fill(Number.NaN)
  const v = new Array<number>(nx * ny).fill(Number.NaN)

  for (let j = 0; j < ny; j++) {
    const lat = north - j * dy
    for (let i = 0; i < nx; i++) {
      const lon = west + i * dx
      for (const grid of grids) {
        const uv = sampleWind(grid, lon, lat)
        if (uv === null || Number.isNaN(uv.u) || Number.isNaN(uv.v)) continue
        u[j * nx + i] = uv.u
        v[j * nx + i] = uv.v
        break
      }
    }
  }

  // refTime/forecastHour del primero: todas las filas del join salen del
  // mismo ciclo del modelo (el índice se consulta por el mismo valid_time)
  const head = grids[0]!.header
  return {
    header: { nx, ny, lo1: west, la1: north, dx, dy, refTime: head.refTime, forecastHour: head.forecastHour },
    u,
    v,
  }
}
