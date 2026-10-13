// Worker del encoder de GIF (F7.3). La cuantización es lo único caro del
// export y bloquearía el hilo principal justo mientras el diálogo tiene que
// repintar el progreso y atender el botón de cancelar.
//
// El búfer de cada frame viaja TRANSFERIDO (`postMessage(msg, [buffer])`):
// copia cero. Después del envío el `Uint8ClampedArray` del emisor queda
// desacoplado — el driver reutiliza su canvas y vuelve a leerlo, así que no
// depende de ese búfer.
import type { GifEncoderHandle } from './gif-encode'
import { createGifEncoder } from './gif-encode'

export interface GifWorkerFrameMessage {
  type: 'frame'
  buffer: ArrayBuffer
  width: number
  height: number
  delayMs: number
}

export interface GifWorkerFinishMessage { type: 'finish' }

export type GifWorkerRequest = GifWorkerFrameMessage | GifWorkerFinishMessage

export type GifWorkerResponse =
  | { type: 'frame-done' }
  | { type: 'done', buffer: ArrayBuffer }
  | { type: 'error', message: string }

const scope = self as unknown as {
  postMessage: (message: GifWorkerResponse, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent<GifWorkerRequest>) => void) | null
}

let encoder: GifEncoderHandle | null = null

scope.onmessage = (event) => {
  const message = event.data
  try {
    if (message.type === 'frame') {
      encoder ??= createGifEncoder()
      encoder.addFrame({
        data: new Uint8ClampedArray(message.buffer),
        width: message.width,
        height: message.height,
        delayMs: message.delayMs,
      })
      scope.postMessage({ type: 'frame-done' })
      return
    }
    if (!encoder) throw new Error('GIF sin frames')
    const bytes = encoder.finish()
    encoder = null
    // `bytesView` es una vista sobre el búfer del stream: se copia para poder
    // transferirla sin arrastrar la capacidad sobrante del stream
    const out = bytes.slice().buffer
    scope.postMessage({ type: 'done', buffer: out }, [out])
  }
  catch (e) {
    encoder = null
    scope.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}
