// Compositor: de los N canvas apilados de `.ol-layers` a un solo canvas.
//
// No existe "el canvas del mapa": OL 10 usa CompositeMapRenderer y deja en el
// DOM un canvas por grupo de capas (`ol/renderer/Composite.js:44-158`). El
// número de hijos NO es 1:1 con las capas: los renderers Canvas2D reutilizan
// el contenedor del anterior cuando los transforms coinciden, y todas las
// WebGLTileLayer del frame-pool comparten UN solo contexto y un solo canvas.
//
// El orden de los hijos ES el orden de zIndex: `Composite.js:113` ordena
// `layerStatesArray` por zIndex antes de construir `children_`, y
// `replaceChildren` los vuelca tal cual en `.ol-layers`.
//
// Dos detalles que NO se pueden copiar a ojo de la receta oficial:
//  - La opacidad de capa YA está horneada en los píxeles (Canvas2D la aplica
//    con globalAlpha, WebGL con u_opacity en el post-proceso). OL nunca
//    escribe `style.opacity` en un contenedor, así que se lee a la defensiva
//    pero en la práctica siempre vale 1. Re-aplicarla elevaría la opacidad del
//    raster al cuadrado.
//  - El fallback de OL cuando no hay `style.transform` da NaN con nuestras
//    capas de viento y rayos. Eso lo arregla `layerDrawTransform` (rama 3).
import type { ComposeOptions, ComposeResult } from './types'
import { canvasGeometry, layerDrawTransform } from './transform'

/**
 * ¿Se puede leer este canvas sin SecurityError? Un canvas destino contaminado
 * no se descontamina nunca, así que hay que probar cada FUENTE antes de
 * dibujarla, no descubrirlo al hacer `toBlob` del resultado.
 */
export function isCanvasReadable(src: HTMLCanvasElement): boolean {
  const scratch = document.createElement('canvas')
  scratch.width = 1
  scratch.height = 1
  const ctx = scratch.getContext('2d')
  if (!ctx) return false
  try {
    ctx.drawImage(src, 0, 0, 1, 1)
    ctx.getImageData(0, 0, 1, 1)
    return true
  }
  catch {
    return false
  }
}

/** Canvas de la capa a partir de un hijo de `.ol-layers` (ver las tres formas en transform.ts). */
function layerCanvasOf(child: Element): HTMLCanvasElement | null {
  const first = child.firstElementChild
  if (first instanceof HTMLCanvasElement) return first
  if (child instanceof HTMLCanvasElement) return child
  return null
}

export function composeOlLayers(
  viewport: HTMLElement,
  viewportCss: readonly [number, number],
  opts: ComposeOptions,
): ComposeResult {
  const layers = viewport.querySelector('.ol-layers')
  if (!layers) {
    throw new Error('composeOlLayers: no se encontró .ol-layers en el viewport del mapa')
  }

  const ratio = opts.pixelRatio
  if (!(ratio > 0)) throw new Error(`composeOlLayers: pixelRatio inválido (${ratio})`)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewportCss[0] * ratio)
  canvas.height = Math.round(viewportCss[1] * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('composeOlLayers: sin contexto 2D en el canvas destino')

  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  const skipped: number[] = []
  const children = [...layers.children]

  for (let i = 0; i < children.length; i++) {
    const child = children[i]!
    const layerCanvas = layerCanvasOf(child)

    // fondo declarado por la capa (mismo criterio que OL)
    const bg = child instanceof HTMLElement ? child.style.backgroundColor : ''
    if (bg && (!layerCanvas || layerCanvas.width > 0)) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    if (!layerCanvas) continue

    const matrix = layerDrawTransform(canvasGeometry(layerCanvas), viewportCss, ratio)
    if (!matrix) continue

    if (!isCanvasReadable(layerCanvas)) {
      skipped.push(i)
      if (opts.onTaint === 'throw') {
        throw new Error(
          `composeOlLayers: la capa ${i} contamina el canvas (falta crossOrigin en su fuente)`,
        )
      }
      continue
    }

    ctx.save()
    // defensivo: OL no escribe style.opacity, pero la receta oficial lo lee
    const opacity = (child instanceof HTMLElement ? child.style.opacity : '') || layerCanvas.style.opacity
    ctx.globalAlpha = opacity === '' ? 1 : Number(opacity)
    ctx.transform(...matrix)
    ctx.drawImage(layerCanvas, 0, 0)
    ctx.restore()
  }

  return { canvas, skipped }
}
