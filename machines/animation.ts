// Playback de la animación (F3 paso 6): buffering → paused ⇄ playing.
// Pura: el pool real (utils/map/frame-pool.ts) decide CUÁNDO un frame está
// listo (renderComplete de su capa WebGL) y llama FRAME_READY/FRAME_FAILED;
// esta máquina solo decide QUÉ mostrar y cuándo avanzar. Cada frame vive
// como un frameMachine hijo (spawned) — su estado se consulta en el
// snapshot, no se duplica en este contexto. Diagrama: docs/maquinas-estado.md.
import type { ActorRefFrom } from 'xstate'
import { assign, enqueueActions, setup } from 'xstate'
import { frameMachine } from './frame'

type FrameActor = ActorRefFrom<typeof frameMachine>

export type AnimationEvent =
  /** startIndex: dónde ya está el viewer (p.ej. el frame que se venía viendo en modo estático) — buffering espera ESE, no el 0 */
  | { type: 'SET_FRAMES', count: number, startIndex?: number }
  | { type: 'FRAME_READY', index: number }
  | { type: 'FRAME_FAILED', index: number, message: string }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE' }
  | { type: 'SEEK', index: number }
  /** cambia el ritmo de reproducción sin detenerla (selector .5x/1x/2x/3x) */
  | { type: 'SPEED', fps: number }
  /** el pool invalida el buffer tras pan/zoom (nuevo extent → re-prefetch) */
  | { type: 'MOVE_END' }

interface AnimationContext {
  frames: FrameActor[]
  gen: number
  index: number
  fps: number
  lastFrameDwellMs: number
}

function isReady(context: AnimationContext, i: number): boolean {
  return context.frames[i]?.getSnapshot().matches('ready') ?? false
}

function clampIndex(context: AnimationContext, i: number): number {
  return Math.min(Math.max(i, 0), Math.max(context.frames.length - 1, 0))
}

/**
 * Próximo índice a mostrar al avanzar: los frames `failed` (huecos reales)
 * se saltan de forma transparente; un frame todavía `pending` frena el
 * avance (se reintenta en el próximo tick, sin saltárselo) — así una
 * descarga lenta no se confunde con un hueco permanente.
 */
function nextPlayableIndex(context: AnimationContext): number {
  const n = context.frames.length
  if (n === 0) return context.index
  for (let step = 1; step <= n; step++) {
    const i = (context.index + step) % n
    const snapshot = context.frames[i]?.getSnapshot()
    if (snapshot?.matches('ready')) return i
    if (!snapshot || snapshot.matches('pending')) return context.index
  }
  return context.index
}

export const animationMachine = setup({
  types: {} as {
    context: AnimationContext
    events: AnimationEvent
    input: { fps?: number, lastFrameDwellMs?: number }
  },
  actors: { frame: frameMachine },
  delays: {
    // dwell largo en el último frame antes de reiniciar el ciclo
    FRAME_DELAY: ({ context }) =>
      context.frames.length > 0 && context.index === context.frames.length - 1
        ? context.lastFrameDwellMs
        : Math.round(1000 / context.fps),
  },
}).createMachine({
  id: 'animation',
  context: ({ input }) => ({
    frames: [],
    gen: 0,
    index: 0,
    fps: input.fps ?? 4,
    lastFrameDwellMs: input.lastFrameDwellMs ?? 1500,
  }),
  // válidos en cualquier estado: cambiar de serie reinicia el pool; el
  // resultado de un frame se reenvía siempre a su frameMachine hijo — el
  // `always` de 'buffering' y el hold de 'playing' lo consultan al vuelo
  on: {
    SPEED: {
      actions: assign({ fps: ({ event }) => event.fps }),
    },
    SET_FRAMES: {
      target: '.buffering',
      actions: [
        // stop dinámico (cantidad variable) antes de spawnear la nueva
        // generación — ids únicos por gen evitan colisión con los viejos
        enqueueActions(({ context, enqueue }) => {
          for (const actor of context.frames) enqueue.stopChild(actor)
        }),
        assign(({ context, event, spawn }) => {
          const gen = context.gen + 1
          const frames: FrameActor[] = []
          for (let i = 0; i < event.count; i++) {
            frames.push(spawn('frame', { id: `frame-${gen}-${i}`, input: { index: i } }))
          }
          const index = Math.min(Math.max(event.startIndex ?? 0, 0), Math.max(event.count - 1, 0))
          return { frames, gen, index }
        }),
        enqueueActions(({ context }) => {
          context.frames.forEach(actor => actor.send({ type: 'INVALIDATE' }))
        }),
      ],
    },
    FRAME_READY: {
      actions: ({ context, event }) => context.frames[event.index]?.send({ type: 'READY' }),
    },
    FRAME_FAILED: {
      actions: ({ context, event }) =>
        context.frames[event.index]?.send({ type: 'FAILED', message: event.message }),
    },
    // pan/zoom: el frame activo se conserva (sigue siendo válido, se
    // muestra sin corte); el resto vuelve a 'pending' para re-prefetch en
    // segundo plano bajo el nuevo extent. Pausa el playback (no seguir
    // animando sobre un extent que ya no corresponde a los demás frames).
    MOVE_END: {
      guard: ({ context }) => context.frames.length > 0,
      target: '.paused',
      actions: ({ context }) => {
        context.frames.forEach((actor, i) => {
          if (i !== context.index) actor.send({ type: 'INVALIDATE' })
        })
      },
    },
  },
  initial: 'idle',
  states: {
    idle: {},
    buffering: {
      on: {
        SEEK: { actions: assign({ index: ({ context, event }) => clampIndex(context, event.index) }) },
      },
      always: [
        { guard: ({ context }) => isReady(context, context.index), target: 'paused' },
        {
          guard: ({ context }) =>
            context.frames.length > 0
            && context.frames.every(f => !f.getSnapshot().matches('pending')),
          target: 'paused',
          actions: assign({
            index: ({ context }) => {
              const readyIdx = context.frames.findIndex(f => f.getSnapshot().matches('ready'))
              return readyIdx === -1 ? context.index : readyIdx
            },
          }),
        },
      ],
    },
    paused: {
      on: {
        PLAY: 'playing',
        TOGGLE: 'playing',
        SEEK: { actions: assign({ index: ({ context, event }) => clampIndex(context, event.index) }) },
      },
    },
    playing: {
      after: {
        FRAME_DELAY: {
          target: 'playing',
          reenter: true,
          actions: assign({ index: ({ context }) => nextPlayableIndex(context) }),
        },
      },
      on: {
        PAUSE: 'paused',
        TOGGLE: 'paused',
        SEEK: { actions: assign({ index: ({ context, event }) => clampIndex(context, event.index) }) },
        // reenter para recalcular FRAME_DELAY ya (el after en curso no se
        // actualiza solo) — así el cambio de velocidad se nota al instante
        SPEED: {
          target: 'playing',
          reenter: true,
          actions: assign({ fps: ({ event }) => event.fps }),
        },
        // primera vuelta: si el frame que nos frenaba (el siguiente al
        // actual) termina de descargar/fallar, avanzamos YA — la barra
        // queda sincronizada con cada imagen bajando en vez de esperar el
        // próximo tick de FRAME_DELAY. reenter reinicia el temporizador
        // (evita doble avance cuando el tick natural llega justo después).
        // Ya con todos los frames listos (vueltas siguientes) esto no
        // dispara más — vuelve a ser el loop temporizado normal.
        FRAME_READY: {
          target: 'playing',
          reenter: true,
          actions: [
            ({ context, event }) => context.frames[event.index]?.send({ type: 'READY' }),
            assign({ index: ({ context }) => nextPlayableIndex(context) }),
          ],
        },
        FRAME_FAILED: {
          target: 'playing',
          reenter: true,
          actions: [
            ({ context, event }) => context.frames[event.index]?.send({ type: 'FAILED', message: event.message }),
            assign({ index: ({ context }) => nextPlayableIndex(context) }),
          ],
        },
      },
    },
  },
})
