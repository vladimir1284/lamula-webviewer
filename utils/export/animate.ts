// Pega el driver de frames (frame-driver.ts) con el encoder elegido: GIF por
// worker o vídeo por MediaRecorder. Ninguno de los dos conoce al otro.
//
// El sumidero de vídeo se crea en el PRIMER frame, no antes: `captureStream`
// necesita el canvas de salida, y ese canvas lo dimensiona el driver con la
// primera captura (el chrome en modo franja añade alto al viewport).
import type { DriveOptions, DriveResult, FrameTask } from './frame-driver'
import type { MapCaptureHandle } from './types'
import type { VideoSink } from './video'
import { driveExport } from './frame-driver'
import { createGifSink } from './gif'
import { createVideoSink, videoExtension } from './video'

export type AnimationFormat = 'gif' | 'video'

export interface AnimateOptions extends Omit<DriveOptions, 'onFrame'> {
  format: AnimationFormat
  /** mime de grabación ya validado con `pickVideoMime()`; solo para 'video' */
  videoMime?: string
  videoBitsPerSecond?: number
}

export interface AnimateResult {
  blob: Blob
  /** extensión sin punto, derivada del formato real de salida */
  ext: string
  drive: DriveResult
}

export async function exportAnimation(
  handle: MapCaptureHandle,
  opts: AnimateOptions,
): Promise<AnimateResult> {
  if (opts.format === 'video' && !opts.videoMime) {
    throw new Error('exportAnimation: este navegador no puede grabar vídeo')
  }

  const gif = opts.format === 'gif' ? createGifSink() : null
  // en una caja: TypeScript no sigue una asignación hecha dentro del closure
  // de `onFrame` y daría por imposible el `dispose()` del catch
  const sink: { video: VideoSink | null } = { video: null }

  const onFrame = async (canvas: HTMLCanvasElement, task: FrameTask) => {
    if (gif) {
      await gif.addFrame(canvas, task.delayMs)
      return
    }
    sink.video ??= createVideoSink(canvas, {
      mime: opts.videoMime!,
      bitsPerSecond: opts.videoBitsPerSecond,
    })
    await sink.video.addFrame(task.delayMs)
  }

  let drive: DriveResult
  try {
    drive = await driveExport(handle, { ...opts, onFrame })
  }
  catch (e) {
    gif?.dispose()
    sink.video?.dispose()
    throw e
  }

  if (drive.frames === 0) {
    gif?.dispose()
    sink.video?.dispose()
    throw new Error('exportAnimation: no se capturó ningún frame')
  }

  if (gif) {
    return { blob: await gif.finish(), ext: 'gif', drive }
  }
  const video = sink.video!
  const blob = await video.finish()
  return { blob, ext: videoExtension(video.mime), drive }
}
