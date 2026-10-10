// Driver de los exports animados (F7.3): convierte una tirada de frames en
// una secuencia de capturas deterministas.
//
// Dos formas, las dos sobre el MISMO mapa que ya está en pantalla:
//  - 'sequence': recorre los frames del pool de animación (el radar avanza).
//  - 'phase':    un solo frame del radar, recorriendo el bucle de 5 s de los
//                rayos (utils/lightning/anim.ts). La edad de una descarga es
//                modular, así que repartir las fases en k/N cierra el bucle
//                sin costura.
//
// La parte pura (qué frame, qué fase, qué dt) está separada de la que toca el
// DOM a propósito: la tabla de tareas se prueba en Vitest sin navegador.
//
// NO se re-joinean los overlays por frame: los strikes y el grid de viento
// que haya en pantalla son los del volumen en reposo y se mantienen durante
// toda la secuencia. Re-tiemparlos exigiría conducir `overlayMachine` con sus
// fetches por frame — otra fase, no esta.
import type { CaptureOptions, CaptureResult } from './capture'
import type { ChromeSpec } from './chrome'
import type { MapCaptureHandle } from './types'
import { captureMap } from './capture'
import { LOOP_MS } from '../lightning/anim'

export type ExportKind = 'sequence' | 'phase'

export interface FrameTask {
  kind: ExportKind
  /** frame del pool a mostrar; < 0 = no tocar el raster (modo estático) */
  index: number
  /** fase 0–1 del bucle de rayos */
  lightningPhase: number
  /** segundos de avance lógico del viento en este frame */
  windDtS: number
  /** cuánto dura este frame en la salida */
  delayMs: number
}

/**
 * Un frame de salida por frame del pool. La fase de rayos se reparte sobre la
 * secuencia entera: el bucle de descargas cierra justo cuando el radar vuelve
 * al principio, así que el GIF entero empalma.
 */
export function sequenceTasks(frameCount: number, delayMs: number): FrameTask[] {
  if (!(frameCount > 0) || !(delayMs > 0)) return []
  const tasks: FrameTask[] = []
  for (let i = 0; i < frameCount; i++) {
    tasks.push({
      kind: 'sequence',
      index: i,
      lightningPhase: i / frameCount,
      windDtS: delayMs / 1000,
      delayMs,
    })
  }
  return tasks
}

/**
 * Un solo frame del radar y `count` fases del bucle de rayos. El retardo sale
 * del propio bucle (LOOP_MS), no de una preferencia: así el GIF corre a la
 * misma velocidad que la pantalla.
 */
export function phaseTasks(count: number, index: number, loopMs: number = LOOP_MS): FrameTask[] {
  if (!(count > 0) || !(loopMs > 0)) return []
  const delayMs = Math.round(loopMs / count)
  const tasks: FrameTask[] = []
  for (let i = 0; i < count; i++) {
    tasks.push({
      kind: 'phase',
      index,
      lightningPhase: i / count,
      windDtS: delayMs / 1000,
      delayMs,
    })
  }
  return tasks
}

export interface DriveOptions {
  tasks: readonly FrameTask[]
  /** opciones de captura comunes; el chrome se recalcula frame a frame */
  capture: Omit<CaptureOptions, 'chrome'>
  /** la marca de tiempo cambia en cada frame de una secuencia */
  chromeFor: (task: FrameTask, i: number) => ChromeSpec
  /** ancho máximo de salida en px; por encima se reduce a escala */
  maxWidth?: number
  onFrame: (canvas: HTMLCanvasElement, task: FrameTask, i: number) => void | Promise<void>
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
  /** ms a esperar a que el frame del pool termine de decodificar */
  frameTimeoutMs?: number
}

export interface DriveResult {
  width: number
  height: number
  /** frames entregados a `onFrame` */
  frames: number
  cancelled: boolean
  /** índices de capas omitidas por tainting en el primer frame */
  skipped: number[]
  /** frames cuyo `settle()` venció sin `rendercomplete` */
  unsettled: number
}

const FRAME_TIMEOUT_MS = 20_000
const POLL_MS = 50

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Espera a que el frame deje de moverse (listo o fallado); false si venció el plazo. */
async function waitFrameSettled(
  handle: MapCaptureHandle,
  index: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (!handle.frameSettled(index)) {
    if (Date.now() > deadline) return false
    await sleep(POLL_MS)
  }
  return true
}

/**
 * Corre la tabla de tareas y entrega cada frame ya compuesto (mapa + chrome)
 * en un canvas de tamaño fijo. El canvas se REUTILIZA entre frames: el
 * consumidor tiene que leerlo antes de devolver el control.
 */
export async function driveExport(
  handle: MapCaptureHandle,
  opts: DriveOptions,
): Promise<DriveResult> {
  const total = opts.tasks.length
  if (total === 0) throw new Error('driveExport: no hay frames que capturar')

  const originalFrame = handle.activeFrame()
  const frameTimeout = opts.frameTimeoutMs ?? FRAME_TIMEOUT_MS
  handle.setExportPixelRatio(opts.capture.pixelRatio)

  let out: HTMLCanvasElement | null = null
  let outCtx: CanvasRenderingContext2D | null = null
  let skipped: number[] = []
  let unsettled = 0
  let done = 0
  let cancelled = false

  try {
    for (let i = 0; i < total; i++) {
      if (opts.isCancelled?.()) {
        cancelled = true
        break
      }
      const task = opts.tasks[i]!

      if (task.index >= 0) {
        handle.activateFrame(task.index)
        await waitFrameSettled(handle, task.index, frameTimeout)
      }
      handle.setExportClock({
        lightningPhase: task.lightningPhase,
        windDtS: task.windDtS,
      })

      const shot: CaptureResult = await captureMap(handle, {
        ...opts.capture,
        chrome: opts.chromeFor(task, i),
      })
      if (!shot.settled) unsettled += 1

      if (!out) {
        const scale = opts.maxWidth && shot.canvas.width > opts.maxWidth
          ? opts.maxWidth / shot.canvas.width
          : 1
        out = document.createElement('canvas')
        // par: los codecs de vídeo con submuestreo de croma rechazan impares
        out.width = Math.max(2, Math.round(shot.canvas.width * scale / 2) * 2)
        out.height = Math.max(2, Math.round(shot.canvas.height * scale / 2) * 2)
        outCtx = out.getContext('2d')
        if (!outCtx) throw new Error('driveExport: sin contexto 2D de salida')
        skipped = shot.skipped
      }

      outCtx!.clearRect(0, 0, out.width, out.height)
      outCtx!.drawImage(shot.canvas, 0, 0, out.width, out.height)
      await opts.onFrame(out, task, i)
      done += 1
      opts.onProgress?.(done, total)

      // ceder el bucle de eventos: el diálogo tiene que poder repintar la
      // barra de progreso y atender el botón de cancelar
      await sleep(0)
    }
  }
  finally {
    handle.setExportClock(null)
    handle.setExportPixelRatio(null)
    if (originalFrame >= 0) handle.activateFrame(originalFrame)
  }

  return {
    width: out?.width ?? 0,
    height: out?.height ?? 0,
    frames: done,
    cancelled,
    skipped,
    unsettled,
  }
}
