// Tipos de paleta del viewer (decisión 5: paletas versionadas en este repo,
// no en la base). Una paleta mapea VALOR FÍSICO → color; la conversión
// nivel→físico (nivel · value_scale + value_offset) la aporta cada raster.
//
// Convenciones del contrato (docs/contrato.md):
//   nivel 0 = nodata (transparente), nivel 1 = range folded, niveles ≥ 2 = datos.

/** Parada de color: valor físico en la unidad del producto + color CSS hex. */
export type PaletteStop = readonly [value: number, color: string]

export interface Palette {
  /** unidad física de los stops (debe coincidir con products.unit) */
  unit: string
  /**
   * `steps`: color constante desde cada stop hasta el siguiente (leyenda
   * clásica NEXRAD). `interpolated`: gradiente lineal entre stops.
   */
  mode: 'steps' | 'interpolated'
  /** ordenadas ascendentes por valor; por debajo del primer stop → transparente */
  stops: readonly PaletteStop[]
  /** valores donde la leyenda dibuja tick + etiqueta */
  ticks: readonly number[]
  /** color para nivel 1 (range folded); null si el producto no lo tiene */
  rangeFoldedColor: string | null
}

/** RGBA 0-255 por nivel; índice = nivel del COG (uint8). */
export type LevelColorTable = Uint8ClampedArray

const TRANSPARENT = [0, 0, 0, 0] as const

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ]
}

/** Color de la paleta para un valor físico; null → transparente. */
export function colorForValue(palette: Palette, value: number): [number, number, number] | null {
  const { stops, mode } = palette
  if (stops.length === 0 || value < stops[0]![0]) return null

  let i = stops.length - 1
  while (i > 0 && value < stops[i]![0]) i--

  const [v0, c0] = stops[i]!
  if (mode === 'steps' || i === stops.length - 1) return hexToRgb(c0)

  const [v1, c1] = stops[i + 1]!
  const t = v1 === v0 ? 0 : (value - v0) / (v1 - v0)
  const a = hexToRgb(c0)
  const b = hexToRgb(c1)
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/**
 * Tabla de 256 colores RGBA indexada por nivel del COG, lista para el
 * operador `palette` del estilo WebGL de OpenLayers.
 *
 *   nivel 0 → transparente (nodata)
 *   nivel 1 → rangeFoldedColor (o transparente si null)
 *   nivel n ≥ 2 → color del físico n·scale+offset; > max_level → transparente
 */
export function buildLevelColorTable(
  palette: Palette,
  valueScale: number,
  valueOffset: number,
  maxLevel: number | null,
): LevelColorTable {
  const table = new Uint8ClampedArray(256 * 4)
  const cap = maxLevel ?? 255

  table.set(TRANSPARENT, 0)

  const rf = palette.rangeFoldedColor ? [...hexToRgb(palette.rangeFoldedColor), 255] : TRANSPARENT
  table.set(rf, 4)

  for (let level = 2; level < 256; level++) {
    if (level > cap) {
      table.set(TRANSPARENT, level * 4)
      continue
    }
    const rgb = colorForValue(palette, level * valueScale + valueOffset)
    table.set(rgb ? [...rgb, 255] : TRANSPARENT, level * 4)
  }
  return table
}

/** físico = nivel · scale + offset (contrato; niveles ≥ 2). */
export function levelToPhysical(level: number, valueScale: number, valueOffset: number): number {
  return level * valueScale + valueOffset
}
