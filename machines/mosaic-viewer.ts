// Máquina de la vista de mosaico multi-radar (D43/P4). Hermana reducida de
// viewerMachine: mismas dos regiones paralelas ('raster'/'timeline'), mismo
// patrón URL-manda + fetch inyectado, pero indexada por `domain`+`product`+
// `slot_time` (no `site`+`vol_time`) contra /api/mosaic/*. Alcance recortado
// a propósito (ver docs/decisiones.md D44): sin fenómenos/VWP/viento/rayos/
// anotaciones/export en esta vista — esos overlays son por-radar por
// naturaleza, el dominio no tiene un `site_id` único al que atarlos. Celdas
// multi-radar etiquetadas llegan en P5 con su propia región.
import type { BaseMapId } from '#shared/basemaps'
import type { MosaicRasterMeta } from '#shared/contract'
import { assign, enqueueActions, fromPromise, setup } from 'xstate'

/** Lo compartible de la URL del mosaico, ya parseado (composables/useMosaicRoute.ts) */
export interface MosaicRouteState {
  domain: string
  product: number
  /** ISO naive del contrato; null = vista live (sin time en el path) */
  time: string | null
  opacity: number
  base: BaseMapId
  /** overlay de cobertura (anillos contribuyentes/ausentes) — default true,
   * shareable como `sat` en el viewer de un solo radar; no se persiste */
  coverage: boolean
}

export interface MosaicNavigatePatch {
  domain?: string
  product?: number
  time?: string | null
}

export interface MosaicNavigateParams {
  patch: MosaicNavigatePatch
  mode: 'push' | 'replace'
}

/** query params de configuración de display — un solo syncQuery debounced, igual que viewerMachine */
export interface MosaicDisplayQueryParams {
  opacity: number
  base: BaseMapId
  coverage: boolean
}

export interface MosaicViewerInput {
  route: MosaicRouteState
  /** instante calculado una vez en SSR para resolver la vista live */
  nowT: string
  /** resultado del closest hecho en SSR: raster, null (404) o error */
  initialRaster: MosaicRasterMeta | null
  initialError: string | null
  /** resultado de /api/mosaic/rasters/day (del día de route.time ?? nowT) hecho en SSR */
  initialTimes: MosaicRasterMeta[]
  initialTimelineError: string | null
}

export type MosaicViewerEvent =
  | { type: 'ROUTE_CHANGED', route: MosaicRouteState }
  | { type: 'MOUNTED' }
  | { type: 'SELECT_DOMAIN', domain: string }
  | { type: 'SELECT_PRODUCT', product: number }
  | { type: 'SELECT_DAY', day: string }
  | { type: 'SET_LIVE_REFRESH', value: boolean }
  | { type: 'SELECT_TIME', time: string }
  | { type: 'STEP', dir: 1 | -1 }
  | { type: 'SET_OPACITY', value: number }
  | { type: 'SELECT_BASE', base: BaseMapId }
  | { type: 'TOGGLE_COVERAGE' }
  | { type: 'COG_ERROR', message: string }

interface MosaicViewerContext {
  domain: string
  product: number
  time: string | null
  nowT: string
  raster: MosaicRasterMeta | null
  rasterError: string | null
  day: string
  times: MosaicRasterMeta[]
  timelineError: string | null
  liveRefresh: boolean
  atStart: boolean
  atEnd: boolean
  opacity: number
  base: BaseMapId
  coverage: boolean
  cogError: string
}

const dayOf = (iso: string) => iso.slice(0, 10)

const assignRoute = assign<MosaicViewerContext, MosaicViewerEvent, undefined, MosaicViewerEvent, never>(
  ({ context, event }) => {
    const { route } = event as Extract<MosaicViewerEvent, { type: 'ROUTE_CHANGED' }>
    const identityChanged = route.domain !== context.domain || route.product !== context.product
    return {
      domain: route.domain,
      product: route.product,
      time: route.time,
      opacity: route.opacity,
      base: route.base,
      coverage: route.coverage,
      ...(identityChanged ? { liveRefresh: true } : {}),
    }
  },
)

export const mosaicViewerMachine = setup({
  types: {} as {
    context: MosaicViewerContext
    events: MosaicViewerEvent
    input: MosaicViewerInput
  },
  actors: {
    // la página provee la implementación real ($fetch); 404 → null
    fetchClosest: fromPromise<MosaicRasterMeta | null, { domain: string, product: number, t: string }>(
      async () => {
        throw new Error('fetchClosest sin proveer (.provide)')
      },
    ),
    fetchDay: fromPromise<MosaicRasterMeta[], { domain: string, product: number, day: string }>(
      async () => {
        throw new Error('fetchDay sin proveer (.provide)')
      },
    ),
    fetchStep: fromPromise<
      MosaicRasterMeta | null,
      { domain: string, product: number, t: string, mode: 'next' | 'prev' }
    >(async () => {
      throw new Error('fetchStep sin proveer (.provide)')
    }),
  },
  actions: {
    navigate: (_args, _params: MosaicNavigateParams) => {
      throw new Error('navigate sin proveer (.provide)')
    },
    syncQuery: (_args, _params: MosaicDisplayQueryParams) => {},
  },
  guards: {
    sameFrame: ({ context }, route: MosaicRouteState) =>
      route.domain === context.domain
      && route.product === context.product
      && route.time !== null
      && route.time === context.raster?.slot_time,
    sameDay: ({ context }, route: MosaicRouteState) =>
      route.domain === context.domain
      && route.product === context.product
      && dayOf(route.time ?? context.nowT) === context.day,
    sameDaySelected: ({ context }, day: string) => day === context.day,
  },
  delays: {
    LIVE_REFRESH_INTERVAL: 30_000,
  },
}).createMachine({
  id: 'mosaicViewer',
  context: ({ input }) => ({
    domain: input.route.domain,
    product: input.route.product,
    time: input.route.time,
    nowT: input.nowT,
    raster: input.initialRaster,
    rasterError: input.initialError,
    day: dayOf(input.route.time ?? input.nowT),
    times: input.initialTimes,
    timelineError: input.initialTimelineError,
    liveRefresh: true,
    atStart: false,
    atEnd: false,
    opacity: input.route.opacity,
    base: input.route.base,
    coverage: input.route.coverage,
    cogError: '',
  }),
  on: {
    SET_LIVE_REFRESH: { actions: assign({ liveRefresh: ({ event }) => event.value }) },
    SET_OPACITY: {
      actions: [
        assign({ opacity: ({ event }) => event.value }),
        {
          type: 'syncQuery',
          params: ({ context, event }) => ({ opacity: event.value, base: context.base, coverage: context.coverage }),
        },
      ],
    },
    SELECT_BASE: {
      actions: [
        assign({ base: ({ event }) => event.base }),
        {
          type: 'syncQuery',
          params: ({ context, event }) => ({ opacity: context.opacity, base: event.base, coverage: context.coverage }),
        },
      ],
    },
    TOGGLE_COVERAGE: {
      actions: enqueueActions(({ context, enqueue }) => {
        const coverage = !context.coverage
        enqueue.assign({ coverage })
        enqueue({ type: 'syncQuery', params: { opacity: context.opacity, base: context.base, coverage } })
      }),
    },
    COG_ERROR: { actions: assign({ cogError: ({ event }) => event.message }) },
    SELECT_DOMAIN: {
      actions: { type: 'navigate', params: ({ event }) => ({ patch: { domain: event.domain }, mode: 'push' as const }) },
    },
    SELECT_PRODUCT: {
      actions: { type: 'navigate', params: ({ event }) => ({ patch: { product: event.product }, mode: 'push' as const }) },
    },
    SELECT_TIME: {
      actions: [
        assign({ time: ({ event }) => event.time, liveRefresh: false }),
        { type: 'navigate', params: ({ event }) => ({ patch: { time: event.time }, mode: 'replace' as const }) },
      ],
    },
    MOUNTED: {
      guard: ({ context }) => context.time === null && context.raster !== null,
      actions: [
        assign({ time: ({ context }) => context.raster!.slot_time }),
        {
          type: 'navigate',
          params: ({ context }) => ({ patch: { time: context.raster!.slot_time }, mode: 'replace' as const }),
        },
      ],
    },
    // NOTA XState v5 (igual que viewerMachine): un `on` de la raíz queda
    // ensombrecido en cuanto una región define el suyo para el mismo evento.
    // ROUTE_CHANGED vive en cada región; 'raster' corre primero en el mismo
    // micropaso así 'timeline' ya lee el contexto actualizado.
  },
  type: 'parallel',
  states: {
    raster: {
      on: {
        ROUTE_CHANGED: [
          {
            guard: { type: 'sameFrame', params: ({ event }) => event.route },
            actions: assignRoute,
          },
          {
            target: '.shown',
            guard: ({ context, event }) => {
              const { route } = event as Extract<MosaicViewerEvent, { type: 'ROUTE_CHANGED' }>
              return route.domain === context.domain
                && route.product === context.product
                && route.time !== null
                && context.times.some(r => r.slot_time === route.time)
            },
            actions: [
              assignRoute,
              assign(({ context, event }) => {
                const { route } = event as Extract<MosaicViewerEvent, { type: 'ROUTE_CHANGED' }>
                const targetRaster = context.times.find(r => r.slot_time === route.time)!
                return { raster: targetRaster, rasterError: null, cogError: '', atStart: false, atEnd: false }
              }),
            ],
          },
          {
            target: '.loading',
            actions: [assignRoute, assign({ cogError: '', atStart: false, atEnd: false })],
          },
        ],
        STEP: [
          {
            guard: ({ context, event }) => {
              if (context.time === null) return false
              const idx = context.times.findIndex(r => r.slot_time === context.time)
              if (idx === -1) return false
              const n = idx + event.dir
              return n >= 0 && n < context.times.length
            },
            actions: enqueueActions(({ context, event, enqueue }) => {
              const idx = context.times.findIndex(r => r.slot_time === context.time)
              const time = context.times[idx + event.dir]!.slot_time
              enqueue.assign({ time })
              enqueue({ type: 'navigate', params: { patch: { time }, mode: 'replace' } })
            }),
          },
          { guard: ({ context, event }) => (event.dir === 1 ? context.atEnd : context.atStart) },
          { guard: ({ event }) => event.dir === 1, target: '.steppingNext' },
          { target: '.steppingPrev' },
        ],
      },
      initial: 'init',
      states: {
        init: {
          always: [
            { guard: ({ context }) => context.rasterError !== null, target: 'error' },
            { guard: ({ context }) => context.raster !== null, target: 'shown' },
            { target: 'empty' },
          ],
        },
        loading: {
          invoke: {
            src: 'fetchClosest',
            input: ({ context }) => ({ domain: context.domain, product: context.product, t: context.time ?? context.nowT }),
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: 'shown',
                actions: enqueueActions(({ context, event, enqueue }) => {
                  enqueue.assign({ raster: event.output, rasterError: null })
                  if (event.output && event.output.slot_time !== context.time) {
                    enqueue.assign({ time: event.output.slot_time })
                    enqueue({ type: 'navigate', params: { patch: { time: event.output.slot_time }, mode: 'replace' } })
                  }
                }),
              },
              { target: 'empty', actions: assign({ raster: null, rasterError: null }) },
            ],
            onError: {
              target: 'error',
              actions: assign({
                rasterError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)),
              }),
            },
          },
        },
        shown: {},
        empty: {},
        error: {},
        steppingNext: {
          invoke: {
            src: 'fetchStep',
            input: ({ context }) => ({ domain: context.domain, product: context.product, t: context.time ?? context.nowT, mode: 'next' as const }),
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: 'shown',
                actions: enqueueActions(({ event, enqueue }) => {
                  enqueue.assign({ raster: event.output, rasterError: null, atStart: false, atEnd: false, time: event.output!.slot_time })
                  enqueue({ type: 'navigate', params: { patch: { time: event.output!.slot_time }, mode: 'replace' } })
                }),
              },
              { target: 'shown', actions: assign({ atEnd: true }) },
            ],
            onError: { target: 'shown' },
          },
        },
        steppingPrev: {
          invoke: {
            src: 'fetchStep',
            input: ({ context }) => ({ domain: context.domain, product: context.product, t: context.time ?? context.nowT, mode: 'prev' as const }),
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: 'shown',
                actions: enqueueActions(({ event, enqueue }) => {
                  enqueue.assign({ raster: event.output, rasterError: null, atStart: false, atEnd: false, time: event.output!.slot_time })
                  enqueue({ type: 'navigate', params: { patch: { time: event.output!.slot_time }, mode: 'replace' } })
                }),
              },
              { target: 'shown', actions: assign({ atStart: true }) },
            ],
            onError: { target: 'shown' },
          },
        },
      },
    },
    timeline: {
      on: {
        ROUTE_CHANGED: [
          { guard: { type: 'sameDay', params: ({ event }) => event.route } },
          { target: '.loading', actions: assign({ day: ({ context, event }) => dayOf(event.route.time ?? context.nowT) }) },
        ],
        SELECT_DAY: [
          { guard: { type: 'sameDaySelected', params: ({ event }) => event.day } },
          { target: '.jumping', actions: assign({ day: ({ event }) => event.day }) },
        ],
        SET_LIVE_REFRESH: [
          { guard: ({ event }) => event.value, target: '.refreshingTick', actions: assign({ liveRefresh: true }) },
          { actions: assign({ liveRefresh: ({ event }) => event.value }) },
        ],
      },
      initial: 'init',
      states: {
        init: {
          always: [
            { guard: ({ context }) => context.timelineError !== null, target: 'error' },
            { guard: ({ context }) => context.times.length > 0, target: 'ready' },
            { target: 'empty' },
          ],
        },
        loading: {
          invoke: {
            src: 'fetchDay',
            input: ({ context }) => ({ domain: context.domain, product: context.product, day: context.day }),
            onDone: [
              { guard: ({ event }) => event.output.length > 0, target: 'ready', actions: assign({ times: ({ event }) => event.output, timelineError: null }) },
              { target: 'empty', actions: assign({ times: [], timelineError: null }) },
            ],
            onError: {
              target: 'error',
              actions: assign({ timelineError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)) }),
            },
          },
        },
        jumping: {
          invoke: {
            src: 'fetchDay',
            input: ({ context }) => ({ domain: context.domain, product: context.product, day: context.day }),
            onDone: [
              {
                guard: ({ event }) => event.output.length > 0,
                target: 'ready',
                actions: enqueueActions(({ event, enqueue }) => {
                  const time = event.output.at(-1)!.slot_time
                  enqueue.assign({ times: event.output, timelineError: null })
                  enqueue.assign({ time })
                  enqueue({ type: 'navigate', params: { patch: { time }, mode: 'push' } })
                }),
              },
              { target: 'empty', actions: assign({ times: [], timelineError: null }) },
            ],
            onError: {
              target: 'error',
              actions: assign({ timelineError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)) }),
            },
          },
        },
        ready: {
          after: {
            LIVE_REFRESH_INTERVAL: [
              { guard: ({ context }) => context.liveRefresh, target: 'refreshingTick' },
              { target: 'ready', reenter: true },
            ],
          },
        },
        empty: {},
        error: {},
        refreshingTick: {
          invoke: {
            src: 'fetchDay',
            input: ({ context }) => ({ domain: context.domain, product: context.product, day: context.day }),
            onDone: [
              {
                guard: ({ event }) => event.output.length > 0,
                target: 'ready',
                actions: enqueueActions(({ context, event, enqueue }) => {
                  const nextLast = event.output.at(-1)!.slot_time
                  enqueue.assign({ times: event.output, timelineError: null })
                  if (nextLast !== context.time) {
                    enqueue.assign({ time: nextLast })
                    enqueue({ type: 'navigate', params: { patch: { time: nextLast }, mode: 'replace' } })
                  }
                }),
              },
              { target: 'empty', actions: assign({ times: [], timelineError: null }) },
            ],
            onError: {
              target: 'error',
              actions: assign({ timelineError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)) }),
            },
          },
        },
      },
    },
  },
})
