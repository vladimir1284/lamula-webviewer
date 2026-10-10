// Marca del export (F7.2): logo como marca de agua y avatar del usuario.
//
// La marca de agua NO forma parte del chrome: se dibuja sobre el área del
// mapa y existe también en modo 'none' — una captura sin datos sigue siendo
// nuestra. El avatar sí vive dentro del chrome (comparte caja con el bloque
// de texto), así que su maquetado está en `chrome.ts` y aquí queda solo el
// dibujo circular.
//
// Ninguna de las dos imágenes se carga aquí: entran ya decodificadas
// (`BrandImage`) porque `drawChrome` es síncrono por diseño — en F7.3 corre
// una vez por frame de GIF y no puede llevar un `await` dentro.
import type { BrandImage } from './types'

/** Apenas visible a propósito: identifica el origen sin ensuciar el dato. */
export const WATERMARK_ALPHA = 0.1
const WATERMARK_FRACTION = 0.1
const WATERMARK_MIN = 48
const WATERMARK_MAX = 120
const WATERMARK_MARGIN = 12

export interface BrandBox { x: number, y: number, width: number, height: number }

/**
 * Esquina inferior derecha del ÁREA DEL MAPA (no del canvas final: en modo
 * franja el mapa termina antes). Esa esquina está libre en los tres modos —
 * la pastilla de texto va arriba-izquierda y la de la leyenda abajo-izquierda.
 *
 * `null` si la imagen no tiene dimensiones utilizables.
 */
export function watermarkLayout(
  img: BrandImage,
  widthCss: number,
  heightCss: number,
): BrandBox | null {
  if (!(img.width > 0) || !(img.height > 0)) return null
  const width = Math.min(WATERMARK_MAX, Math.max(WATERMARK_MIN, widthCss * WATERMARK_FRACTION))
  const height = width * (img.height / img.width)
  return {
    x: widthCss - WATERMARK_MARGIN - width,
    y: heightCss - WATERMARK_MARGIN - height,
    width,
    height,
  }
}

/** `scale` convierte px CSS a px del canvas, igual que en `drawChrome`. */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  img: BrandImage,
  px: { widthCss: number, heightCss: number, scale: number },
): void {
  const box = watermarkLayout(img, px.widthCss, px.heightCss)
  if (!box) return
  ctx.save()
  ctx.setTransform(px.scale, 0, 0, px.scale, 0, 0)
  ctx.globalAlpha = WATERMARK_ALPHA
  ctx.drawImage(img.image, box.x, box.y, box.width, box.height)
  ctx.restore()
}

/**
 * Avatar recortado en círculo, recorte centrado (`cover`): una foto apaisada
 * no se deforma, se le quitan los lados.
 */
export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  img: BrandImage,
  box: { x: number, y: number, size: number },
): void {
  if (!(img.width > 0) || !(img.height > 0)) return
  const r = box.size / 2
  const cx = box.x + r
  const cy = box.y + r
  const side = Math.min(img.width, img.height)
  const sx = (img.width - side) / 2
  const sy = (img.height - side) / 2

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.drawImage(img.image, sx, sy, side, side, box.x, box.y, box.size, box.size)
  ctx.restore()

  // aro: separa la foto del fondo oscuro de la franja/pastilla
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.65)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}
