// animationMachine pura: sin DOM, sin OL — el pool real llama
// FRAME_READY/FRAME_FAILED según renderComplete (utils/map/frame-pool.ts).
// Usa fake timers para el dwell/avance de 'playing' (xstate `after`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import { animationMachine } from '../../machines/animation'

function boot(opts: { fps?: number, lastFrameDwellMs?: number } = {}) {
  const actor = createActor(animationMachine, { input: opts })
  actor.start()
  return actor
}

describe('animationMachine — buffering', () => {
  it('arranca en idle; SET_FRAMES entra en buffering', () => {
    const actor = boot()
    expect(actor.getSnapshot().matches('idle')).toBe(true)
    actor.send({ type: 'SET_FRAMES', count: 3 })
    expect(actor.getSnapshot().matches('buffering')).toBe(true)
    expect(actor.getSnapshot().context.frames).toHaveLength(3)
  })

  it('sale de buffering en cuanto el frame 0 está listo, aunque los demás no', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 3 })
    actor.send({ type: 'FRAME_READY', index: 0 })
    expect(actor.getSnapshot().matches('paused')).toBe(true)
    expect(actor.getSnapshot().context.frames[1]!.getSnapshot().matches('pending')).toBe(true)
  })

  it('FRAME_READY de otro índice antes que el 0 no saca de buffering', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 3 })
    actor.send({ type: 'FRAME_READY', index: 1 })
    expect(actor.getSnapshot().matches('buffering')).toBe(true)
    expect(actor.getSnapshot().context.frames[1]!.getSnapshot().matches('ready')).toBe(true)
  })

  it('startIndex: SET_FRAMES arranca el buffer en el frame donde ya estaba el viewer, no en 0', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 6, startIndex: 5 })
    expect(actor.getSnapshot().context.index).toBe(5)
    expect(actor.getSnapshot().matches('buffering')).toBe(true)
    // listo cualquier otro índice no saca de buffering — espera justo el 5
    actor.send({ type: 'FRAME_READY', index: 0 })
    expect(actor.getSnapshot().matches('buffering')).toBe(true)
    actor.send({ type: 'FRAME_READY', index: 5 })
    expect(actor.getSnapshot().matches('paused')).toBe(true)
  })

  it('startIndex fuera de rango se acota', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 3, startIndex: 99 })
    expect(actor.getSnapshot().context.index).toBe(2)
  })

  it('el objetivo falla pero otro frame ya está listo: sale de buffering saltando a ese', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 2 })
    actor.send({ type: 'FRAME_READY', index: 1 })
    actor.send({ type: 'FRAME_FAILED', index: 0, message: '404' }) // el objetivo (index 0) falla
    expect(actor.getSnapshot().matches('paused')).toBe(true)
    expect(actor.getSnapshot().context.index).toBe(1)
  })

  it('todos los frames fallan: no bloquea la UI para siempre (sale igual)', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 2 })
    actor.send({ type: 'FRAME_FAILED', index: 0, message: '404' })
    actor.send({ type: 'FRAME_FAILED', index: 1, message: '404' })
    expect(actor.getSnapshot().matches('paused')).toBe(true)
    expect(actor.getSnapshot().context.index).toBe(0) // nada listo — se queda donde estaba
  })

  it('un frame aún pending frena la salida (espera, no asume fallo)', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 2 })
    actor.send({ type: 'FRAME_FAILED', index: 0, message: '404' })
    expect(actor.getSnapshot().matches('buffering')).toBe(true) // index 1 sigue pending
  })

  it('SET_FRAMES reemplaza la generación anterior (frames viejos detenidos)', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 2 })
    const oldFrames = actor.getSnapshot().context.frames
    actor.send({ type: 'SET_FRAMES', count: 4 })
    expect(actor.getSnapshot().context.frames).toHaveLength(4)
    expect(actor.getSnapshot().context.frames[0]).not.toBe(oldFrames[0])
  })
})

describe('animationMachine — playback', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function readyAll(actor: ReturnType<typeof boot>, count: number) {
    for (let i = 0; i < count; i++) actor.send({ type: 'FRAME_READY', index: i })
  }

  it('PLAY avanza un frame por tick (fps configurable)', () => {
    const actor = boot({ fps: 4 }) // 250ms/frame
    actor.send({ type: 'SET_FRAMES', count: 3 })
    readyAll(actor, 3)
    actor.send({ type: 'PLAY' })
    expect(actor.getSnapshot().context.index).toBe(0)
    vi.advanceTimersByTime(250)
    expect(actor.getSnapshot().context.index).toBe(1)
    vi.advanceTimersByTime(250)
    expect(actor.getSnapshot().context.index).toBe(2)
  })

  it('dwell largo en el último frame antes de reiniciar el ciclo', () => {
    const actor = boot({ fps: 4, lastFrameDwellMs: 1000 }) // 250ms normal, 1000ms dwell
    actor.send({ type: 'SET_FRAMES', count: 2 })
    readyAll(actor, 2)
    actor.send({ type: 'PLAY' })
    vi.advanceTimersByTime(250) // -> index 1 (último)
    expect(actor.getSnapshot().context.index).toBe(1)
    vi.advanceTimersByTime(250) // aún dentro del dwell del último frame
    expect(actor.getSnapshot().context.index).toBe(1)
    vi.advanceTimersByTime(750) // completa el dwell (1000ms total) -> vuelve a 0
    expect(actor.getSnapshot().context.index).toBe(0)
  })

  it('mantiene el frame si el siguiente sigue pending (hold, no salta)', () => {
    const actor = boot({ fps: 4 })
    actor.send({ type: 'SET_FRAMES', count: 3 })
    actor.send({ type: 'FRAME_READY', index: 0 })
    actor.send({ type: 'FRAME_READY', index: 2 }) // 1 sigue pending
    actor.send({ type: 'PLAY' })
    vi.advanceTimersByTime(250)
    expect(actor.getSnapshot().context.index).toBe(0) // no se saltó al 2
  })

  it('primera vuelta: avanza en cuanto llega el FRAME_READY que bloqueaba, sin esperar el próximo tick', () => {
    const actor = boot({ fps: 4 })
    actor.send({ type: 'SET_FRAMES', count: 3 })
    actor.send({ type: 'FRAME_READY', index: 0 })
    actor.send({ type: 'PLAY' })
    expect(actor.getSnapshot().context.index).toBe(0) // 1 sigue pending, frena
    actor.send({ type: 'FRAME_READY', index: 1 }) // termina de bajar YA (sin avanzar el reloj)
    expect(actor.getSnapshot().context.index).toBe(1) // la barra se sincroniza con la descarga, no con FRAME_DELAY
  })

  it('salta un frame failed (hueco real), no se queda esperándolo', () => {
    const actor = boot({ fps: 4 })
    actor.send({ type: 'SET_FRAMES', count: 3 })
    readyAll(actor, 1) // index 0 ready
    actor.send({ type: 'FRAME_FAILED', index: 1, message: 'no COG' })
    actor.send({ type: 'FRAME_READY', index: 2 })
    actor.send({ type: 'PLAY' })
    vi.advanceTimersByTime(250)
    expect(actor.getSnapshot().context.index).toBe(2) // saltó el 1 (failed)
  })

  it('PAUSE / TOGGLE detienen el avance', () => {
    const actor = boot({ fps: 4 })
    actor.send({ type: 'SET_FRAMES', count: 3 })
    readyAll(actor, 3)
    actor.send({ type: 'PLAY' })
    actor.send({ type: 'PAUSE' })
    vi.advanceTimersByTime(1000)
    expect(actor.getSnapshot().context.index).toBe(0)
    expect(actor.getSnapshot().matches('paused')).toBe(true)
  })

  it('SEEK salta a un índice (clamped a los límites)', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 3 })
    actor.send({ type: 'FRAME_READY', index: 0 })
    actor.send({ type: 'SEEK', index: 2 })
    expect(actor.getSnapshot().context.index).toBe(2)
    actor.send({ type: 'SEEK', index: 99 })
    expect(actor.getSnapshot().context.index).toBe(2) // clamp al último
    actor.send({ type: 'SEEK', index: -5 })
    expect(actor.getSnapshot().context.index).toBe(0)
  })

  it('MOVE_END pausa el playback e invalida los frames inactivos (no el activo)', () => {
    const actor = boot()
    actor.send({ type: 'SET_FRAMES', count: 3 })
    readyAll(actor, 3)
    actor.send({ type: 'SEEK', index: 1 })
    actor.send({ type: 'PLAY' })
    actor.send({ type: 'MOVE_END' })
    expect(actor.getSnapshot().matches('paused')).toBe(true)
    // el frame activo (1) sigue listo — se ve sin corte
    expect(actor.getSnapshot().context.frames[1]!.getSnapshot().matches('ready')).toBe(true)
    // los demás vuelven a pending, listos para re-prefetch bajo el nuevo extent
    expect(actor.getSnapshot().context.frames[0]!.getSnapshot().matches('pending')).toBe(true)
    expect(actor.getSnapshot().context.frames[2]!.getSnapshot().matches('pending')).toBe(true)
  })

  it('MOVE_END sin frames cargados no hace nada', () => {
    const actor = boot()
    actor.send({ type: 'MOVE_END' })
    expect(actor.getSnapshot().matches('idle')).toBe(true)
  })

  it('SPEED cambia el fps sin detener la reproducción', () => {
    const actor = boot({ fps: 4 }) // 250ms/frame
    actor.send({ type: 'SET_FRAMES', count: 3 })
    readyAll(actor, 3)
    actor.send({ type: 'PLAY' })
    actor.send({ type: 'SPEED', fps: 8 }) // 2x -> 125ms/frame
    expect(actor.getSnapshot().matches('playing')).toBe(true)
    expect(actor.getSnapshot().context.fps).toBe(8)
    vi.advanceTimersByTime(125)
    expect(actor.getSnapshot().context.index).toBe(1)
  })

  it('SPEED en paused/buffering solo asigna fps (no dispara avance)', () => {
    const actor = boot({ fps: 4 })
    actor.send({ type: 'SPEED', fps: 12 })
    expect(actor.getSnapshot().context.fps).toBe(12)
    actor.send({ type: 'SET_FRAMES', count: 2 })
    readyAll(actor, 2)
    expect(actor.getSnapshot().matches('paused')).toBe(true)
    actor.send({ type: 'SPEED', fps: 2 })
    expect(actor.getSnapshot().matches('paused')).toBe(true)
    expect(actor.getSnapshot().context.fps).toBe(2)
  })
})
