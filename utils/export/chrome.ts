// "Chrome" del export: identidad del dato dibujada sobre (o bajo) el mapa.
//
// Canvas2D directo, NO un SVG serializado. Un SVG cargado como imagen es un
// documento aislado: no hereda el CSS de la página ni las fuentes, así que
// `system-ui` resuelve distinto en cada SO y el texto se desplaza o se corta;
// y habría que rasterizarlo con `img.decode()` por dibujo. Lo decisivo es que
// la marca de tiempo cambia en cada frame de un GIF (F7.3), lo que mata el
// atajo de "rasterizar una vez y cachear". Con Canvas2D se mide con
// `measureText()` contra las métricas reales y se dibuja síncrono.
//
// La geometría de la leyenda NO se duplica: sale de `legend-geometry.ts`, el
// mismo módulo que usa MapLegend.vue (decisión 4).
import type { Palette } from '#shared/products'
import type { ClockPref } from '../time-display'
import type { UnitsPref } from '../units'
import { formatFull } from '../time-display'
import { drawAvatar } from './brand'
import { legendGeometry } from './legend-geometry'
import type { BrandImage } from './types'

export type ChromeMode = 'bar' | 'overlay' | 'none'

export interface ChromeParts {
  title: boolean
  meta: boolean
  legend: boolean
  attribution: boolean
  /** logo como marca de agua sobre el mapa — lo dibuja `captureMap`, no `drawChrome` */
  watermark: boolean
  avatar: boolean
}

export interface ChromeSpec {
  mode: ChromeMode
  title: string | null
  site: string
  siteName?: string | null
  /** nombre legible del producto, ya con el mnemónico si se quiere */
  product: string
  /** ISO naive UTC del volumen mostrado */
  timeIso: string | null
  clock: ClockPref
  units: UnitsPref
  palette: Palette | null
  attributions: string[]
  parts: ChromeParts
  /** foto del usuario, ya decodificada; null = sin avatar (F7.2) */
  avatar?: BrandImage | null
}

export const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

/** Destino principal: chat a tamaño reducido ⇒ tipografía mayor que la de pantalla. */
const PAD = 14
const GAP = 10
const TITLE_SIZE = 12
const HEAD_SIZE = 17
const META_SIZE = 14
const ATTR_SIZE = 10
const LINE_GAP = 5
/** ancho de la leyenda dentro del chrome, acotado para que no coma el bloque de texto */
const LEGEND_MIN = 220
const LEGEND_MAX = 420
const LEGEND_FRACTION = 0.36
/** el avatar acompaña al bloque de texto: ni más alto que él, ni ilegible */
const AVATAR_MIN = 32
const AVATAR_MAX = 56

const COLORS = {
  barBg: 'rgba(15, 23, 42, 0.94)',
  pillBg: 'rgba(15, 23, 42, 0.78)',
  head: '#f1f5f9',
  meta: '#cbd5e1',
  title: '#5eead4',
  attr: '#94a3b8',
  legendInk: '#e2e8f0',
} as const

export interface ChromeTextLine { text: string, size: number, color: string, weight: string }

export interface ChromeLayout {
  /** alto en px CSS que la franja añade BAJO el mapa (0 fuera del modo 'bar') */
  barHeight: number
  lines: ChromeTextLine[]
  /** caja de la leyenda en px CSS, relativa al canvas final */
  legend: { x: number, y: number, width: number } | null
  attribution: string | null
  /** caja del avatar en px CSS; null = sin avatar (F7.2) */
  avatar: { x: number, y: number, size: number } | null
  /** izquierda del bloque de texto: el avatar lo desplaza */
  textX: number
}

function headLine(spec: ChromeSpec): string {
  const site = spec.siteName ? `${spec.site} · ${spec.siteName}` : spec.site
  return `${site} — ${spec.product}`
}

function textLines(spec: ChromeSpec): ChromeTextLine[] {
  const lines: ChromeTextLine[] = []
  if (spec.parts.title && spec.title) {
    lines.push({ text: spec.title, size: TITLE_SIZE, color: COLORS.title, weight: '600' })
  }
  if (spec.parts.meta) {
    lines.push({ text: headLine(spec), size: HEAD_SIZE, color: COLORS.head, weight: '600' })
    if (spec.timeIso) {
      lines.push({
        text: formatFull(spec.timeIso, spec.clock),
        size: META_SIZE,
        color: COLORS.meta,
        weight: '400',
      })
    }
  }
  return lines
}

function linesHeight(lines: ChromeTextLine[]): number {
  if (lines.length === 0) return 0
  return lines.reduce((acc, l) => acc + l.size, 0) + LINE_GAP * (lines.length - 1)
}

function legendWidth(widthCss: number): number {
  return Math.min(LEGEND_MAX, Math.max(LEGEND_MIN, widthCss * LEGEND_FRACTION))
}

/**
 * Alto que la atribución añade DENTRO de la pastilla de la leyenda en modo
 * superpuesto. Antes se dibujaba suelta contra el borde inferior: quedaba gris
 * sobre el mapa y la pastilla de la leyenda la tapaba a medias.
 */
function attrExtraHeight(hasAttribution: boolean): number {
  return hasAttribution ? ATTR_SIZE + GAP * 0.5 : 0
}

/**
 * Maqueta el chrome en px CSS. Puro: la mitad de los bugs de layout se cazan
 * aquí sin un contexto 2D de por medio.
 */
export function chromeLayout(spec: ChromeSpec, widthCss: number, heightCss: number): ChromeLayout {
  if (spec.mode === 'none') {
    return { barHeight: 0, lines: [], legend: null, attribution: null, avatar: null, textX: 0 }
  }

  const lines = textLines(spec)
  const attribution = spec.parts.attribution && spec.attributions.length > 0
    ? spec.attributions.join(' · ')
    : null

  const showLegend = spec.parts.legend && spec.palette !== null
  const lw = legendWidth(widthCss)
  const lh = showLegend ? legendGeometry(spec.palette!, spec.units, lw).height : 0

  const textH = linesHeight(lines)
  // sin texto el avatar no tiene de qué tomar la altura: va al mínimo legible
  const avatarSize = spec.parts.avatar && spec.avatar
    ? (textH > 0 ? Math.min(AVATAR_MAX, Math.max(AVATAR_MIN, textH)) : AVATAR_MIN)
    : 0
  const avatarGap = avatarSize > 0 ? avatarSize + GAP : 0

  if (spec.mode === 'bar') {
    const attrH = attribution ? ATTR_SIZE + LINE_GAP : 0
    const body = Math.max(textH, lh, avatarSize)
    const barHeight = body === 0 && attrH === 0 ? 0 : PAD * 2 + body + attrH
    return {
      barHeight,
      lines,
      legend: showLegend
        ? { x: widthCss - PAD - lw, y: heightCss + PAD + Math.max(0, (body - lh) / 2), width: lw }
        : null,
      attribution,
      avatar: avatarSize > 0
        ? { x: PAD, y: heightCss + PAD + Math.max(0, (body - avatarSize) / 2), size: avatarSize }
        : null,
      textX: PAD + avatarGap,
    }
  }

  // overlay: pastilla arriba-izquierda con avatar + texto; abajo-izquierda
  // otra con la leyenda y, dentro de ella, la atribución
  const attrExtra = attrExtraHeight(attribution !== null)
  const contentX = PAD + GAP
  return {
    barHeight: 0,
    lines,
    legend: showLegend
      ? { x: contentX, y: heightCss - PAD - GAP - lh - attrExtra, width: lw }
      : null,
    attribution,
    avatar: avatarSize > 0
      ? { x: contentX, y: PAD + GAP + Math.max(0, (textH - avatarSize) / 2), size: avatarSize }
      : null,
    textX: contentX + avatarGap,
  }
}

interface RoundRectCapable {
  roundRect?: (x: number, y: number, w: number, h: number, r: number) => void
}

function fillPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.fillStyle = COLORS.pillBg
  const rr = (ctx as unknown as RoundRectCapable).roundRect
  if (typeof rr === 'function') {
    ctx.beginPath()
    rr.call(ctx, x, y, w, h, r)
    ctx.fill()
  }
  else {
    ctx.fillRect(x, y, w, h)
  }
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  units: UnitsPref,
  box: { x: number, y: number, width: number },
): void {
  const g = legendGeometry(palette, units, box.width)
  ctx.save()
  ctx.translate(box.x, box.y)

  if (g.mode === 'interpolated') {
    const grad = ctx.createLinearGradient(g.barX, 0, g.barX + g.barW, 0)
    for (const s of g.gradient) grad.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color)
    ctx.fillStyle = grad
    ctx.fillRect(g.barX, g.barY, g.barW, g.barH)
  }
  for (const r of g.rects) {
    ctx.fillStyle = r.color
    ctx.fillRect(r.x, g.barY, r.width, g.barH)
  }

  ctx.strokeStyle = COLORS.legendInk
  ctx.fillStyle = COLORS.legendInk
  ctx.lineWidth = 1
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `400 ${g.tickFontSize}px ${FONT_STACK}`
  for (const tick of g.ticks) {
    ctx.beginPath()
    ctx.moveTo(tick.x, g.tickLineY1)
    ctx.lineTo(tick.x, g.tickLineY2)
    ctx.stroke()
    // la marca se dibuja siempre; la etiqueta solo si no pisa a la anterior
    if (tick.showLabel) ctx.fillText(tick.label, tick.x, g.tickLabelY)
  }

  ctx.globalAlpha = 0.75
  ctx.textAlign = 'right'
  ctx.font = `400 ${g.unitFontSize}px ${FONT_STACK}`
  ctx.fillText(g.unitLabel, g.unitX, g.unitY)
  ctx.restore()
}

/**
 * Dibuja el chrome sobre `ctx`, que debe cubrir el canvas FINAL
 * (mapa + franja). `scale` convierte px CSS a px del canvas.
 */
export function drawChrome(
  ctx: CanvasRenderingContext2D,
  spec: ChromeSpec,
  px: { widthCss: number, heightCss: number, scale: number },
): void {
  if (spec.mode === 'none') return
  const layout = chromeLayout(spec, px.widthCss, px.heightCss)
  if (layout.lines.length === 0 && !layout.legend && !layout.attribution && !layout.avatar) return

  ctx.save()
  ctx.setTransform(px.scale, 0, 0, px.scale, 0, 0)
  ctx.textBaseline = 'top'

  const textH = linesHeight(layout.lines)

  if (spec.mode === 'bar') {
    ctx.fillStyle = COLORS.barBg
    ctx.fillRect(0, px.heightCss, px.widthCss, layout.barHeight)
  }

  let y: number
  if (spec.mode === 'bar') {
    const body = Math.max(
      textH,
      layout.legend ? legendGeometry(spec.palette!, spec.units, layout.legend.width).height : 0,
      layout.avatar?.size ?? 0,
    )
    y = px.heightCss + PAD + Math.max(0, (body - textH) / 2)
  }
  else {
    if (layout.lines.length > 0 || layout.avatar) {
      // ancho medido, no adivinado: un nombre de producto largo no se sale
      let w = 0
      for (const line of layout.lines) {
        ctx.font = `${line.weight} ${line.size}px ${FONT_STACK}`
        w = Math.max(w, ctx.measureText(line.text).width)
      }
      const avatarW = layout.avatar ? layout.avatar.size + GAP : 0
      const boxW = Math.min(px.widthCss - PAD * 2, avatarW + w + GAP * 2)
      const boxH = Math.max(textH, layout.avatar?.size ?? 0) + GAP * 2
      fillPill(ctx, PAD, PAD, boxW, boxH, 10)
    }
    y = PAD + GAP
  }

  if (layout.avatar && spec.avatar) drawAvatar(ctx, spec.avatar, layout.avatar)

  const textX = layout.textX
  ctx.textAlign = 'left'
  for (const line of layout.lines) {
    ctx.font = `${line.weight} ${line.size}px ${FONT_STACK}`
    ctx.fillStyle = line.color
    ctx.fillText(line.text, textX, y)
    y += line.size + LINE_GAP
  }

  const attrExtra = attrExtraHeight(layout.attribution !== null)
  let legendHeight = 0

  if (layout.legend && spec.palette) {
    legendHeight = legendGeometry(spec.palette, spec.units, layout.legend.width).height
    if (spec.mode === 'overlay') {
      fillPill(
        ctx,
        layout.legend.x - GAP,
        layout.legend.y - GAP,
        layout.legend.width + GAP * 2,
        legendHeight + GAP * 2 + attrExtra,
        10,
      )
    }
    drawLegend(ctx, spec.palette, spec.units, layout.legend)
  }

  if (layout.attribution) {
    ctx.font = `400 ${ATTR_SIZE}px ${FONT_STACK}`
    ctx.fillStyle = COLORS.attr
    ctx.textAlign = 'left'
    if (spec.mode === 'bar') {
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(layout.attribution, PAD, px.heightCss + layout.barHeight - PAD + ATTR_SIZE * 0.2)
    }
    else {
      ctx.textBaseline = 'top'
      // dentro de la pastilla de la leyenda; sin leyenda, pastilla propia
      const ax = layout.legend ? layout.legend.x : PAD + GAP
      const ay = layout.legend
        ? layout.legend.y + legendHeight + GAP * 0.5
        : px.heightCss - PAD - GAP - ATTR_SIZE
      if (!layout.legend) {
        const w = ctx.measureText(layout.attribution).width
        fillPill(ctx, ax - GAP, ay - GAP, w + GAP * 2, ATTR_SIZE + GAP * 2, 8)
        ctx.fillStyle = COLORS.attr
      }
      ctx.fillText(layout.attribution, ax, ay)
    }
  }

  ctx.restore()
}
