// Carga y normalización de las imágenes de marca (F7.2). Vive fuera de
// `brand.ts` porque toca el DOM: el núcleo de dibujo sigue siendo síncrono y
// testeable sin navegador.
import type { BrandImage } from './types'

/**
 * Carga una imagen del propio origen (p. ej. `/logo.svg`). Sin `crossOrigin`:
 * same-origin no contamina el canvas, y pedirlo añadiría una precondición de
 * CORS que no hace falta. Un SVG sin `width`/`height` no tiene tamaño
 * intrínseco en todos los navegadores — por eso se pasa `fallback`.
 */
export function loadBrandImage(src: string, fallback?: { width: number, height: number }): Promise<BrandImage> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({
      image,
      width: image.naturalWidth || fallback?.width || image.width,
      height: image.naturalHeight || fallback?.height || image.height,
    })
    image.onerror = () => reject(new Error(`no se pudo cargar ${src}`))
    image.src = src
  })
}

/**
 * Normaliza la foto elegida por el usuario a un cuadrado pequeño en data-URL:
 * localStorage tiene ~5 MB y una foto de cámara no cabe. Recorte centrado,
 * el mismo criterio que `drawAvatar`.
 *
 * La imagen nunca sale del navegador (decisión 40).
 */
export async function fileToAvatarDataUrl(file: Blob, size = 128): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const { image, width, height } = await loadBrandImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('sin contexto 2D para normalizar el avatar')
    const side = Math.min(width, height)
    ctx.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size)
    return canvas.toDataURL('image/png')
  }
  finally {
    URL.revokeObjectURL(url)
  }
}
