// gifenc 1.0.3 no publica tipos (ver node_modules/gifenc/package.json). Se
// declara aquí solo la superficie que usa el export de GIF (F7.3), con las
// firmas leídas de `node_modules/gifenc/src/{index,pnnquant2,palettize}.js`.
declare module 'gifenc' {
  export type GifPalette = number[][]

  export interface GifWriteFrameOptions {
    /** retardo en MILISEGUNDOS; gifenc lo redondea a centisegundos */
    delay?: number
    palette?: GifPalette | null
    /** -1 = una vez, 0 = bucle infinito, >0 = número de repeticiones */
    repeat?: number
    transparent?: boolean
    transparentIndex?: number
    colorDepth?: number
    dispose?: number
    first?: boolean
  }

  export interface GifEncoderInstance {
    writeFrame: (
      index: Uint8Array | number[],
      width: number,
      height: number,
      opts?: GifWriteFrameOptions,
    ) => void
    finish: () => void
    bytes: () => Uint8Array
    bytesView: () => Uint8Array
    reset: () => void
  }

  export function GIFEncoder(opt?: { auto?: boolean, initialCapacity?: number }): GifEncoderInstance

  export type GifPixelFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: GifPixelFormat, oneBitAlpha?: boolean | number, clearAlpha?: boolean },
  ): GifPalette

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: GifPalette,
    format?: GifPixelFormat,
  ): Uint8Array

  export default GIFEncoder
}
