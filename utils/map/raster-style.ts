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

/**
 * Estilo para la fuente RGBA premultiplicada (utils/map/raster-rgba.ts).
 * WebGLTileLayer SIEMPRE premultiplica una vez al final (color.rgb *= color.a,
 * ver ol/layer/WebGLTile) asumiendo alpha recto — como la textura ya llega
 * premultiplicada, hay que despremultiplicar aquí para que el resultado neto
 * sea una sola premultiplicación (spike: sin esto, doble premultiplicación
 * oscurece los bordes con alpha parcial, justo donde se busca arreglar el halo).
 */
export function smoothedRasterStyle(): WebGLStyle {
  // sin operador 'max' variádico en el lenguaje de expresiones de OL — 'clamp'
  // (valor, min, max) de 3 aridad hace de guarda contra división por cero.
  const alpha = ['clamp', ['band', 4], 1, 255]
  return {
    color: [
      'array',
      ['/', ['band', 1], alpha],
      ['/', ['band', 2], alpha],
      ['/', ['band', 3], alpha],
      ['band', 4],
    ],
  }
}
