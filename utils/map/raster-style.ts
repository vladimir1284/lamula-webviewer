// Estilo WebGL para la capa raster (decisión 4: renderizado desde datos).
// El COG trae niveles crudos uint8; la tabla nivel→color se pasa al
// operador `palette` del shader — cambiar paleta no regenera nada.
import type { Style as WebGLStyle } from 'ol/layer/WebGLTile'
import type { LevelColorTable, Palette } from '#shared/products'
import { buildLevelColorTable } from '#shared/products'

/** Tabla RGBA → colores [r,g,b,a(0-1)] como los espera el operador `palette`. */
export function tableToOlColors(table: LevelColorTable): number[][] {
  const colors: number[][] = []
  for (let level = 0; level < 256; level++) {
    colors.push([
      table[level * 4]!,
      table[level * 4 + 1]!,
      table[level * 4 + 2]!,
      table[level * 4 + 3]! / 255,
    ])
  }
  return colors
}

/**
 * Variante nativa GPU: en vez de `palette` (lookup con NEAREST forzado por
 * OL en la textura de paleta — swatch.js `PaletteTexture`, no configurable),
 * usa `interpolate` para lerp de color entre niveles enteros consecutivos.
 * Combinada con `interpolate: true` en la fuente GeoTIFF (nivel de entrada
 * también bilineal), da contornos suaves entre celdas del dato crudo sin
 * pipeline de canvas — un solo shader, mismo costo que rasterStyle().
 * Caveat: nivel 1 (range folded) es categórico, no continuo — en el borde
 * con una celda de dato real puede verse un degradado falso hacia su color.
 */
export function interpolatedPaletteStyle(
  palette: Palette,
  valueScale: number,
  valueOffset: number,
  maxLevel: number | null,
): WebGLStyle {
  const table = buildLevelColorTable(palette, valueScale, valueOffset, maxLevel)
  const colors = tableToOlColors(table)
  // 256 stops compila pero excede el límite de complejidad del fragment
  // shader ("Expression too complex") — solo hacen falta los bordes de
  // cada tramo de color constante (2 por tramo), el resto es redundante:
  // interpolar entre dos puntos del mismo color da una recta plana.
  const sameColor = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
  const stops: unknown[] = []
  for (let level = 0; level < colors.length; level++) {
    const color = colors[level]!
    const isBoundary = level === 0 || level === colors.length - 1
      || !sameColor(color, colors[level - 1]!) || !sameColor(color, colors[level + 1]!)
    if (isBoundary) stops.push(level, color)
  }
  return {
    color: ['interpolate', ['linear'], ['band', 1], ...stops],
  }
}

export function rasterStyle(
  palette: Palette,
  valueScale: number,
  valueOffset: number,
  maxLevel: number | null,
): WebGLStyle {
  const table = buildLevelColorTable(palette, valueScale, valueOffset, maxLevel)
  return {
    color: ['palette', ['band', 1], tableToOlColors(table)],
  }
}
