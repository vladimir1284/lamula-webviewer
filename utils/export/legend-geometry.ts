// Geometría de la leyenda, extraída de MapLegend.vue para que pantalla y
// export la compartan (decisión 4: la paleta es fuente única de raster y
// leyenda; esto extiende la regla al dibujo de la leyenda).
//
// El espacio de coordenadas es proporcional: todas las medidas salen de las
// constantes base a 320 px multiplicadas por `width / 320`. A 320 los números
// son exactamente los que tenía el SVG del componente; el export pide un ancho
// mayor y con él crece la tipografía, que es justo lo que hace falta cuando la
// imagen termina en un chat a tamaño reducido.
import type { Palette } from '#shared/products'
import type { UnitsPref } from '../units'
import { convertRasterValue, rasterUnitLabel } from '../units'

/** ancho de referencia: a este valor la geometría es idéntica a la del SVG original */
export const LEGEND_BASE_WIDTH = 320

const BASE = {
  height: 46,
  barX: 8,
  barY: 4,
  barH: 14,
  tickOverhang: 4,
  tickLabelOffset: 17,
  tickFontSize: 13,
  unitFontSize: 10,
  unitY: 44,
} as const

export interface LegendRect { x: number, width: number, color: string }
export interface LegendGradientStop { offset: number, color: string }
export interface LegendTick {
  x: number
  label: string
  /** false si la etiqueta pisaría a la anterior — la marca sí se dibuja igual */
  showLabel: boolean
}

/** ancho medio de un carácter respecto al font-size, para dígitos y signo menos */
const TICK_CHAR_RATIO = 0.6
/** separación mínima entre etiquetas vecinas, en el espacio de 320 px */
const TICK_MIN_GAP = 10

function estimateLabelWidth(label: string, fontSize: number): number {
  return label.length * fontSize * TICK_CHAR_RATIO
}

export interface LegendGeometry {
  width: number
  height: number
  barX: number
  barY: number
  barW: number
  barH: number
  mode: Palette['mode']
  /** un rect por stop en modo steps; vacío en interpolated */
  rects: LegendRect[]
  /** paradas 0–1 en modo interpolated; vacío en steps */
  gradient: LegendGradientStop[]
  ticks: LegendTick[]
  tickLineY1: number
  tickLineY2: number
  tickLabelY: number
  tickFontSize: number
  unitLabel: string
  unitX: number
  unitY: number
  unitFontSize: number
  rangeFoldedColor: string | null
}

/** dominio de valores de la barra. En steps el último color ocupa un tramo final del ~7 %. */
export function legendDomain(palette: Palette): { min: number, max: number } {
  const stops = palette.stops
  const min = stops[0]?.[0] ?? 0
  const last = stops[stops.length - 1]?.[0] ?? 1
  const max = palette.mode === 'steps' ? last + (last - min) * 0.07 : last
  return { min, max: max === min ? min + 1 : max }
}

export function legendGeometry(
  palette: Palette,
  units: UnitsPref = 'imperial',
  width: number = LEGEND_BASE_WIDTH,
): LegendGeometry {
  const k = width / LEGEND_BASE_WIDTH
  const barX = BASE.barX * k
  const barW = width - barX * 2
  const barY = BASE.barY * k
  const barH = BASE.barH * k

  const { min, max } = legendDomain(palette)
  const x = (value: number) => barX + ((value - min) / (max - min)) * barW

  const rects: LegendRect[] = palette.mode !== 'steps'
    ? []
    : palette.stops.map(([value, color], i) => {
        const next = palette.stops[i + 1]?.[0]
        const x0 = x(value)
        const x1 = next === undefined ? barX + barW : x(next)
        return { x: x0, width: x1 - x0, color }
      })

  const gradient: LegendGradientStop[] = palette.mode !== 'interpolated'
    ? []
    : palette.stops.map(([value, color]) => ({ offset: (value - min) / (max - min), color }))

  // D28: solo la ETIQUETA del tick se convierte; la geometría posiciona con el valor crudo.
  // Las etiquetas que pisarían a la anterior se ocultan (los ticks de varias
  // paletas están juntos en el extremo bajo: DVL 5 y 10, DAA 2.5 y 6…); la
  // marca se sigue dibujando, solo desaparece el número. A mayor ancho —el
  // chrome del export pide más que los 320 px de pantalla— caben más.
  const tickFontSize = BASE.tickFontSize * k
  const minGap = TICK_MIN_GAP * k
  let lastRight = Number.NEGATIVE_INFINITY
  const ticks: LegendTick[] = palette.ticks.map((tick) => {
    const label = units === 'si'
      ? convertRasterValue(tick, palette.unit, 'si').value.toFixed(0)
      : String(tick)
    const cx = x(tick)
    const half = estimateLabelWidth(label, tickFontSize) / 2
    const showLabel = cx - half >= lastRight + minGap
    if (showLabel) lastRight = cx + half
    return { x: cx, label, showLabel }
  })

  return {
    width,
    height: BASE.height * k,
    barX,
    barY,
    barW,
    barH,
    mode: palette.mode,
    rects,
    gradient,
    ticks,
    tickLineY1: barY,
    tickLineY2: barY + barH + BASE.tickOverhang * k,
    tickLabelY: barY + barH + BASE.tickLabelOffset * k,
    tickFontSize,
    unitLabel: rasterUnitLabel(palette.unit, units),
    unitX: width - barX,
    unitY: BASE.unitY * k,
    unitFontSize: BASE.unitFontSize * k,
    rangeFoldedColor: palette.rangeFoldedColor,
  }
}
