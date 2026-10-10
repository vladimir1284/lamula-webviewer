// Orquestación de una captura: mapa compuesto + chrome en un solo canvas.
//
// El chrome en modo 'bar' añade alto BAJO el mapa, así que el canvas final no
// coincide con el viewport; en 'overlay' y 'none' sí.
import type { ChromeSpec } from './chrome'
import type { BrandImage, MapCaptureHandle } from './types'
import { chromeLayout, drawChrome } from './chrome'
import { composeOlLayers } from './compose'
import { drawWatermark } from './brand'

export interface CaptureOptions {
  /** píxeles de salida por píxel CSS (1 o 2) */
  pixelRatio: number
  chrome: ChromeSpec
  /**
   * Logo ya decodificado para la marca de agua (F7.2). Se dibuja sobre el
   * área del mapa en los tres modos de chrome — también en 'none' — si
   * `chrome.parts.watermark` está activo.
   */
  watermark?: BrandImage | null
  /** color bajo todas las capas; útil con `?base=off` */
  background?: string
  onTaint?: 'skip' | 'throw'
  /** ms a esperar a que el mapa quede en reposo antes de leer los canvas */
  settleMs?: number
}

export interface CaptureResult {
  canvas: HTMLCanvasElement
  /** índices de capas omitidas por tainting */
  skipped: number[]
  /** true si el mapa llegó a reposo; false si venció el timeout de settle */
  settled: boolean
  widthCss: number
  heightCss: number
}

export async function captureMap(
  handle: MapCaptureHandle,
  opts: CaptureOptions,
): Promise<CaptureResult> {
  const el = handle.viewportEl()
  const size = handle.size()
  if (!el || !size) throw new Error('captureMap: el mapa todavía no está montado')
  const [widthCss, heightCss] = size
  if (!(widthCss > 0) || !(heightCss > 0)) {
    throw new Error(`captureMap: tamaño de mapa inválido (${widthCss}×${heightCss})`)
  }

  const settled = await handle.settle(opts.settleMs)

  const map = composeOlLayers(el, [widthCss, heightCss], {
    pixelRatio: opts.pixelRatio,
    background: opts.background,
    onTaint: opts.onTaint,
  })

  const barHeight = chromeLayout(opts.chrome, widthCss, heightCss).barHeight
  const watermark = opts.chrome.parts.watermark ? (opts.watermark ?? null) : null
  const drawsChrome = barHeight > 0 || opts.chrome.mode === 'overlay'
  if (!drawsChrome && !watermark) {
    return { canvas: map.canvas, skipped: map.skipped, settled, widthCss, heightCss }
  }

  // 'overlay' pinta encima del propio canvas del mapa; 'bar' necesita uno más
  // alto, con el mapa arriba y la franja debajo
  let canvas = map.canvas
  if (barHeight > 0) {
    canvas = document.createElement('canvas')
    canvas.width = map.canvas.width
    canvas.height = Math.round((heightCss + barHeight) * opts.pixelRatio)
    const dest = canvas.getContext('2d')
    if (!dest) throw new Error('captureMap: sin contexto 2D en el canvas final')
    dest.drawImage(map.canvas, 0, 0)
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('captureMap: sin contexto 2D en el canvas final')
  // la marca de agua va primero: pertenece al mapa, y la franja o las
  // pastillas del chrome tienen que quedar por encima
  if (watermark) drawWatermark(ctx, watermark, { widthCss, heightCss, scale: opts.pixelRatio })
  drawChrome(ctx, opts.chrome, { widthCss, heightCss, scale: opts.pixelRatio })

  return { canvas, skipped: map.skipped, settled, widthCss, heightCss }
}
