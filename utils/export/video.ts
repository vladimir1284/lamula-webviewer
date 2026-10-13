// Export a vídeo (F7.3). `MediaRecorder` sobre `canvas.captureStream(0)`: con
// framerate 0 el stream no captura por su cuenta, solo cuando se le pide un
// frame — así el vídeo no corre carreras con el rAF del navegador y cada
// frame dibujado entra una vez y solo una.
//
// Dos cosas que NO se arreglan y conviene saber:
//  - El ritmo lo marca el RELOJ REAL entre `requestFrame()`, no un campo de
//    cabecera. Si componer un frame tarda más que su retardo nominal, el
//    vídeo sale lento. `addFrame` espera lo que falte, pero no puede devolver
//    tiempo ya gastado.
//  - El WebM de MediaRecorder sale SIN duración en la cabecera EBML, así que
//    algunos reproductores muestran la barra de búsqueda rota. Es conocido; no
//    se arregla sin reescribir el contenedor.
//
// Safari (14.1+) trae MediaRecorder pero no WebM: devuelve mp4/avc1. De ahí
// que la extensión salga del mime elegido y no sea `.webm` fija.

/** Orden de preferencia; el primero que el navegador soporte gana. */
const CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
] as const

const EXT_BY_TYPE: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'video/x-matroska': 'mkv',
}

/** null = este navegador no puede grabar vídeo. */
export function pickVideoMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const mime of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return null
}

/** Extensión de fichero para un mime de grabación ('video/webm;codecs=vp9' → 'webm'). */
export function videoExtension(mime: string): string {
  const base = mime.split(';')[0]!.trim().toLowerCase()
  return EXT_BY_TYPE[base] ?? 'webm'
}

interface CaptureTrack extends MediaStreamTrack {
  requestFrame?: () => void
}

export interface VideoSink {
  /** entrega el contenido actual del canvas y espera a cubrir `delayMs` */
  addFrame: (delayMs: number) => Promise<void>
  finish: () => Promise<Blob>
  dispose: () => void
  mime: string
}

export interface VideoSinkOptions {
  mime: string
  /** bits por segundo del vídeo; 2.5 Mbps da ~2–6 MB en 12 s a 960×540 */
  bitsPerSecond?: number
}

const DEFAULT_BPS = 2_500_000

export function createVideoSink(canvas: HTMLCanvasElement, opts: VideoSinkOptions): VideoSink {
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CaptureTrack | undefined
  if (!track) throw new Error('createVideoSink: el canvas no entregó pista de vídeo')

  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, {
    mimeType: opts.mime,
    videoBitsPerSecond: opts.bitsPerSecond ?? DEFAULT_BPS,
  })
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }
  recorder.start()

  let lastFrameAt = 0

  return {
    mime: opts.mime,
    async addFrame(delayMs) {
      // el frame anterior dura hasta que llega este: cubrir su retardo antes
      // de pedir el siguiente, nunca después
      if (lastFrameAt > 0) {
        const remaining = delayMs - (performance.now() - lastFrameAt)
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining))
      }
      track.requestFrame?.()
      lastFrameAt = performance.now()
    },
    finish() {
      return new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          track.stop()
          if (chunks.length === 0) {
            reject(new Error('createVideoSink: el grabador no produjo datos'))
            return
          }
          resolve(new Blob(chunks, { type: opts.mime.split(';')[0] }))
        }
        recorder.onerror = () => reject(new Error('createVideoSink: fallo del grabador'))
        if (recorder.state === 'inactive') {
          recorder.onstop?.(new Event('stop'))
          return
        }
        // el último frame necesita tiempo de pared para entrar en el
        // contenedor: parar en el mismo tick lo deja fuera
        setTimeout(() => recorder.stop(), 120)
      })
    },
    dispose() {
      if (recorder.state !== 'inactive') recorder.stop()
      track.stop()
    },
  }
}
