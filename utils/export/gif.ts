// Fachada del encoder de GIF (F7.3): esconde el worker y serializa los
// frames. Si el navegador no deja construir el worker de módulo se encodea en
// el hilo principal — un GIF lento es mejor que ningún GIF.
import type { GifWorkerRequest, GifWorkerResponse } from './gif.worker'
import { createGifEncoder } from './gif-encode'

export interface GifSink {
  /** añade el contenido actual del canvas como un frame de `delayMs` */
  addFrame: (canvas: HTMLCanvasElement, delayMs: number) => Promise<void>
  finish: () => Promise<Blob>
  /** aborta y libera el worker; seguro de llamar dos veces */
  dispose: () => void
}

function imageDataOf(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('createGifSink: sin contexto 2D del canvas de salida')
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Respaldo síncrono: mismo núcleo, pero bloquea entre frames. */
function mainThreadSink(): GifSink {
  const encoder = createGifEncoder()
  let finished = false
  return {
    addFrame(canvas, delayMs) {
      const image = imageDataOf(canvas)
      encoder.addFrame({
        data: image.data,
        width: image.width,
        height: image.height,
        delayMs,
      })
      return Promise.resolve()
    },
    finish() {
      if (finished) return Promise.reject(new Error('createGifSink: ya cerrado'))
      finished = true
      const bytes = encoder.finish()
      return Promise.resolve(new Blob([bytes.slice().buffer], { type: 'image/gif' }))
    },
    dispose() {
      finished = true
    },
  }
}

export function createGifSink(): GifSink {
  let active: Worker
  try {
    active = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' })
  }
  catch {
    return mainThreadSink()
  }

  // una petición en vuelo cada vez: el driver espera a `addFrame` antes de
  // pisar el canvas de salida con el frame siguiente
  let pending: { resolve: (r: GifWorkerResponse) => void, reject: (e: Error) => void } | null = null
  let disposed = false

  active.onmessage = (event: MessageEvent<GifWorkerResponse>) => {
    const waiter = pending
    pending = null
    if (!waiter) return
    if (event.data.type === 'error') waiter.reject(new Error(event.data.message))
    else waiter.resolve(event.data)
  }
  active.onerror = () => {
    const waiter = pending
    pending = null
    waiter?.reject(new Error('El worker del GIF falló'))
  }

  function send(message: GifWorkerRequest, transfer: Transferable[] = []): Promise<GifWorkerResponse> {
    if (disposed) return Promise.reject(new Error('createGifSink: ya cerrado'))
    if (pending) return Promise.reject(new Error('createGifSink: hay un frame en vuelo'))
    return new Promise((resolve, reject) => {
      pending = { resolve, reject }
      active.postMessage(message, transfer)
    })
  }

  return {
    async addFrame(canvas, delayMs) {
      const image = imageDataOf(canvas)
      // el búfer se transfiere (copia cero); `image` queda desacoplado, pero
      // el driver vuelve a leer del canvas en el frame siguiente
      const buffer = image.data.buffer as ArrayBuffer
      await send(
        { type: 'frame', buffer, width: image.width, height: image.height, delayMs },
        [buffer],
      )
    },
    async finish() {
      const result = await send({ type: 'finish' })
      if (result.type !== 'done') throw new Error('createGifSink: respuesta inesperada del worker')
      const blob = new Blob([result.buffer], { type: 'image/gif' })
      this.dispose()
      return blob
    },
    dispose() {
      if (disposed) return
      disposed = true
      pending?.reject(new Error('createGifSink: cancelado'))
      pending = null
      active.terminate()
    },
  }
}
