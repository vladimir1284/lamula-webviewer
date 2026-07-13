// Máquina raíz de la página viewer (decisión 18). URL manda: la ruta entra
// como ROUTE_CHANGED (incluido back/forward) y las transiciones que cambian
// la selección navegan como efecto 'navigate'. Pura: navegación y fetch se
// inyectan vía .provide() — los tests corren con createActor sin router ni
// red. Diagrama: docs/maquinas-estado.md (actualizar en el mismo commit).
import type { Product, Radar, RasterMeta } from '#shared/contract'
import { assign, enqueueActions, fromPromise, setup } from 'xstate'
import type { CursorSample } from '../utils/map/cursor'

/** Lo compartible de la URL, ya parseado (ver composables/useViewerRoute.ts) */
export interface ViewerRouteState {
  site: string
  product: number
  /** ISO naive del contrato; null = vista live (sin time en el path) */
  time: string | null
  opacity: number
  base: 'osm' | 'off'
}

export interface NavigatePatch {
  site?: string
  product?: number
  time?: string | null
}

export interface NavigateParams {
  patch: NavigatePatch
  mode: 'push' | 'replace'
}

export interface ViewerInput {
  radars: Radar[]
  products: Product[]
  route: ViewerRouteState
  /** instante calculado una vez en SSR para resolver la vista live */
  nowT: string
  /** resultado del closest hecho en SSR: raster, null (404) o error */
  initialRaster: RasterMeta | null
  initialError: string | null
}

export type ViewerEvent =
  | { type: 'ROUTE_CHANGED', route: ViewerRouteState }
  | { type: 'MOUNTED' }
  | { type: 'SELECT_SITE', site: string }
  | { type: 'SELECT_PRODUCT', product: number }
  | { type: 'SET_OPACITY', value: number }
  | { type: 'CURSOR_MOVE', sample: CursorSample | null }
  | { type: 'COG_ERROR', message: string }

interface ViewerContext {
  radars: Radar[]
  products: Product[]
  site: string
  product: number
  time: string | null
  nowT: string
  raster: RasterMeta | null
  rasterError: string | null
  opacity: number
  base: 'osm' | 'off'
  cursor: CursorSample | null
  cogError: string
}

const assignRoute = assign<ViewerContext, ViewerEvent, undefined, ViewerEvent, never>(
  ({ event }) => {
    const { route } = event as Extract<ViewerEvent, { type: 'ROUTE_CHANGED' }>
    return {
      site: route.site,
      product: route.product,
      time: route.time,
      opacity: route.opacity,
      base: route.base,
    }
  },
)

export const viewerMachine = setup({
  types: {} as {
    context: ViewerContext
    events: ViewerEvent
    input: ViewerInput
  },
  actors: {
    // la página provee la implementación real ($fetch); 404 → null
    fetchClosest: fromPromise<RasterMeta | null, { site: string, product: number, t: string }>(
      async () => {
        throw new Error('fetchClosest sin proveer (.provide)')
      },
    ),
  },
  actions: {
    // efecto de navegación (router push/replace) — lo provee la página
    navigate: (_args, _params: NavigateParams) => {
      throw new Error('navigate sin proveer (.provide)')
    },
  },
  guards: {
    /**
     * El frame pedido ya es el mostrado: materialización del vol_time
     * resuelto (replace post-closest) o cambio solo de query — sin refetch,
     * el raster no debe reparpadear.
     */
    sameFrame: ({ context }, route: ViewerRouteState) =>
      route.site === context.site
      && route.product === context.product
      && (route.time === context.time
        || (route.time !== null && route.time === context.raster?.vol_time)),
    liveResolved: ({ context }) => context.time === null && context.raster !== null,
  },
}).createMachine({
  id: 'viewer',
  context: ({ input }) => ({
    radars: input.radars,
    products: input.products,
    site: input.route.site,
    product: input.route.product,
    time: input.route.time,
    nowT: input.nowT,
    raster: input.initialRaster,
    rasterError: input.initialError,
    opacity: input.route.opacity,
    base: input.route.base,
    cursor: null,
    cogError: '',
  }),
  on: {
    CURSOR_MOVE: { actions: assign({ cursor: ({ event }) => event.sample }) },
    SET_OPACITY: { actions: assign({ opacity: ({ event }) => event.value }) },
    COG_ERROR: { actions: assign({ cogError: ({ event }) => event.message }) },
    SELECT_SITE: {
      actions: {
        type: 'navigate',
        params: ({ event }) => ({ patch: { site: event.site }, mode: 'push' as const }),
      },
    },
    SELECT_PRODUCT: {
      actions: {
        type: 'navigate',
        params: ({ event }) => ({ patch: { product: event.product }, mode: 'push' as const }),
      },
    },
    // vista live servida en SSR: al montar, materializa el vol_time resuelto
    MOUNTED: {
      guard: 'liveResolved',
      actions: {
        type: 'navigate',
        params: ({ context }) => ({
          patch: { time: context.raster!.vol_time },
          mode: 'replace' as const,
        }),
      },
    },
    ROUTE_CHANGED: [
      {
        guard: { type: 'sameFrame', params: ({ event }) => event.route },
        actions: assignRoute,
      },
      {
        // reentrar en loading cancela el fetch en vuelo (sin respuestas stale)
        target: '.loading',
        actions: [assignRoute, assign({ cogError: '', cursor: null })],
      },
    ],
  },
  initial: 'init',
  states: {
    // estado inicial derivado del closest SSR — sin trabajo async, el
    // snapshot pre-start es idéntico en servidor y cliente (hidratación)
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
        input: ({ context }) => ({
          site: context.site,
          product: context.product,
          t: context.time ?? context.nowT,
        }),
        onDone: [
          {
            guard: ({ event }) => event.output !== null,
            target: 'shown',
            actions: enqueueActions(({ context, event, enqueue }) => {
              enqueue.assign({ raster: event.output, rasterError: null })
              if (context.time === null && event.output) {
                enqueue({
                  type: 'navigate',
                  params: { patch: { time: event.output.vol_time }, mode: 'replace' },
                })
              }
            }),
          },
          { target: 'empty', actions: assign({ raster: null, rasterError: null }) },
        ],
        onError: {
          target: 'error',
          actions: assign({
            rasterError: ({ event }) =>
              event.error instanceof Error ? event.error.message : String(event.error),
          }),
        },
      },
    },
    shown: {},
    empty: {},
    error: {},
  },
})
