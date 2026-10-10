// Núcleo del encoder de GIF (F7.3). Sin DOM: lo usan igual el worker y el
// camino de respaldo en el hilo principal.
//
// Paleta POR FRAME (tabla de color local), no una global: las paletas `steps`
// del radar tienen ~16 colores y cuantizan casi sin pérdida, pero el mapa base
// cambia poco entre frames y una paleta global tomada del primero desteñiría
// un frame con una celda nueva. Cada tabla local cuesta ≤768 bytes — nada al
// lado de los datos LZW.
//
// Sin dithering: el ruido del difuminado es lo que más engorda un GIF, y sobre
// un raster de colores planos no aporta nada.
import { applyPalette, GIFEncoder, quantize } from 'gifenc'

/** Tope del formato. */
const MAX_COLORS = 256
const FORMAT = 'rgb565'

export interface GifFrameInput {
  /** RGBA sin premultiplicar, tal cual sale de `getImageData` */
  data: Uint8ClampedArray
  width: number
  height: number
  /** duración del frame en ms */
  delayMs: number
}

export interface GifEncoderHandle {
  addFrame: (frame: GifFrameInput) => void
  /** cierra el stream y devuelve los bytes del GIF */
  finish: () => Uint8Array
}

export function createGifEncoder(): GifEncoderHandle {
  const gif = GIFEncoder()
  return {
    addFrame(frame) {
      const palette = quantize(frame.data, MAX_COLORS, { format: FORMAT })
      const index = applyPalette(frame.data, palette, FORMAT)
      // `repeat: 0` (default) escribe la extensión Netscape de bucle infinito
      // en el primer frame; sin ella el GIF se queda congelado al final.
      gif.writeFrame(index, frame.width, frame.height, {
        palette,
        delay: frame.delayMs,
      })
    },
    finish() {
      gif.finish()
      return gif.bytesView()
    },
  }
}
