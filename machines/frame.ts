// Ciclo de vida de UN frame del pool de animación (F3 paso 6). Spawneada
// por animationMachine, una por índice; el driver real (utils/map/frame-pool.ts)
// envía READY/FAILED según el renderComplete de su capa WebGL.
// Diagrama: docs/maquinas-estado.md.
import { assign, setup } from 'xstate'

export type FrameEvent =
  | { type: 'READY' }
  | { type: 'FAILED', message: string }
  /** pan/zoom invalida el tile cacheado — vuelve a pending para re-prefetch */
  | { type: 'INVALIDATE' }

interface FrameContext {
  index: number
  error: string | null
}

export const frameMachine = setup({
  types: {} as {
    context: FrameContext
    events: FrameEvent
    input: { index: number }
  },
}).createMachine({
  id: 'frame',
  context: ({ input }) => ({ index: input.index, error: null }),
  initial: 'pending',
  states: {
    pending: {
      on: {
        READY: 'ready',
        FAILED: { target: 'failed', actions: assign({ error: ({ event }) => event.message }) },
      },
    },
    ready: {
      on: { INVALIDATE: { target: 'pending', actions: assign({ error: null }) } },
    },
    failed: {
      on: { INVALIDATE: { target: 'pending', actions: assign({ error: null }) } },
    },
  },
})
