// Máquina raíz de la página viewer (decisión 18). URL manda: la ruta entra
// como ROUTE_CHANGED (incluido back/forward) y las transiciones que cambian
// la selección navegan como efecto 'navigate'. Pura: navegación y fetch se
// inyectan vía .provide() — los tests corren con createActor sin router ni
// red. Regiones paralelas: 'raster' (frame mostrado) y 'timeline' (rasters
// del día). Diagrama: docs/maquinas-estado.md (actualizar en el mismo commit).
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

/** slice persistible en localStorage (composables/useViewerPrefs.ts) */
export interface PrefsParams {
  site: string
  product: number
  opacity: number
  base: 'osm' | 'off'
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
  /** resultado de /api/rasters/day (del día de route.time ?? nowT) hecho en SSR */
  initialTimes: RasterMeta[]
  initialTimelineError: string | null
}

export type ViewerEvent =
  | { type: 'ROUTE_CHANGED', route: ViewerRouteState }
  | { type: 'MOUNTED' }
  | { type: 'SELECT_SITE', site: string }
  | { type: 'SELECT_PRODUCT', product: number }
  | { type: 'SELECT_DAY', day: string }
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
  /** día UTC (YYYY-MM-DD) que la región 'timeline' tiene cargado/objetivo */
  day: string
  times: RasterMeta[]
  timelineError: string | null
  opacity: number
  base: 'osm' | 'off'
  cursor: CursorSample | null
  cogError: string
}

const dayOf = (iso: string) => iso.slice(0, 10)

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

// toda navegación deja las prefs al día (site/product/opacity/base — nunca el time)
const persistRouteParams = {
  type: 'persistPrefs' as const,
  params: ({ event }: { event: ViewerEvent }) => {
    const { route } = event as Extract<ViewerEvent, { type: 'ROUTE_CHANGED' }>
    return {
      site: route.site,
      product: route.product,
      opacity: route.opacity,
      base: route.base,
    }
  },
}

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
    fetchDay: fromPromise<RasterMeta[], { site: string, product: number, day: string }>(
      async () => {
        throw new Error('fetchDay sin proveer (.provide)')
      },
    ),
  },
  actions: {
    // efecto de navegación (router push/replace) — lo provee la página
    navigate: (_args, _params: NavigateParams) => {
      throw new Error('navigate sin proveer (.provide)')
    },
    // efectos opcionales (noop por defecto; la página los provee):
    // persistir prefs en localStorage y reflejar opacity/base en la query
    persistPrefs: (_args, _params: PrefsParams) => {},
    syncQuery: (_args, _params: { opacity: number, base: 'osm' | 'off' }) => {},
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
    /** el día objetivo de la timeline no cambia — evita refetch al hacer stepping dentro del mismo día */
    sameDay: ({ context }, route: ViewerRouteState) =>
      route.site === context.site
      && route.product === context.product
      && dayOf(route.time ?? context.nowT) === context.day,
    sameDaySelected: ({ context }, day: string) => day === context.day,
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
    day: dayOf(input.route.time ?? input.nowT),
    times: input.initialTimes,
    timelineError: input.initialTimelineError,
    opacity: input.route.opacity,
    base: input.route.base,
    cursor: null,
    cogError: '',
  }),
  on: {
    CURSOR_MOVE: { actions: assign({ cursor: ({ event }) => event.sample }) },
    SET_OPACITY: {
      actions: [
        assign({ opacity: ({ event }) => event.value }),
        {
          type: 'persistPrefs',
          params: ({ context, event }) => ({
            site: context.site,
            product: context.product,
            opacity: event.value,
            base: context.base,
          }),
        },
        {
          type: 'syncQuery',
          params: ({ context, event }) => ({ opacity: event.value, base: context.base }),
        },
      ],
    },
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
      guard: ({ context }) => context.time === null && context.raster !== null,
      actions: {
        type: 'navigate',
        params: ({ context }) => ({
          patch: { time: context.raster!.vol_time },
          mode: 'replace' as const,
        }),
      },
    },
    // NOTA: en una máquina paralela, un `on` a nivel raíz queda ensombrecido
    // en cuanto CUALQUIER región define su propio `on` para el mismo evento
    // (el evento se da por manejado en esa región y no burbujea). Por eso
    // ROUTE_CHANGED se maneja dentro de cada región — assignRoute corre en
    // 'raster' (primera región declarada, se ejecuta antes que 'timeline' en
    // el mismo micropaso, así 'timeline' ya lee el contexto actualizado).
  },
  type: 'parallel',
  states: {
    raster: {
      on: {
        ROUTE_CHANGED: [
          {
            guard: { type: 'sameFrame', params: ({ event }) => event.route },
            actions: [assignRoute, persistRouteParams],
          },
          {
            target: '.loading',
            actions: [assignRoute, persistRouteParams, assign({ cogError: '', cursor: null })],
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
                  // la URL siempre refleja el frame exacto mostrado — si el
                  // time pedido (vista live, o cualquier instante que no
                  // coincida con un vol_time real) difiere del resuelto, se
                  // corrige con replace
                  if (event.output && event.output.vol_time !== context.time) {
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
    },
    timeline: {
      on: {
        ROUTE_CHANGED: [
          { guard: { type: 'sameDay', params: ({ event }) => event.route } },
          {
            target: '.loading',
            actions: assign({
              day: ({ context, event }) => dayOf(event.route.time ?? context.nowT),
            }),
          },
        ],
        SELECT_DAY: [
          { guard: { type: 'sameDaySelected', params: ({ event }) => event.day } },
          { target: '.jumping', actions: assign({ day: ({ event }) => event.day }) },
        ],
      },
      initial: 'init',
      states: {
        // igual que 'raster': estado inicial derivado del /api/rasters/day
        // hecho en SSR, sin trabajo async (hidratación segura)
        init: {
          always: [
            { guard: ({ context }) => context.timelineError !== null, target: 'error' },
            { guard: ({ context }) => context.times.length > 0, target: 'ready' },
            { target: 'empty' },
          ],
        },
        // refetch pasivo (cambió el día por navegación de site/product/time)
        loading: {
          invoke: {
            src: 'fetchDay',
            input: ({ context }) => ({ site: context.site, product: context.product, day: context.day }),
            onDone: [
              {
                guard: ({ event }) => event.output.length > 0,
                target: 'ready',
                actions: assign({ times: ({ event }) => event.output, timelineError: null }),
              },
              { target: 'empty', actions: assign({ times: [], timelineError: null }) },
            ],
            onError: {
              target: 'error',
              actions: assign({
                timelineError: ({ event }) =>
                  event.error instanceof Error ? event.error.message : String(event.error),
              }),
            },
          },
        },
        // el usuario eligió un día en el DayPicker: al resolver, salta al
        // último frame de ese día (si tiene datos; si no, se queda vacío —
        // sin frame al que saltar, no hay corrección de URL que hacer)
        jumping: {
          invoke: {
            src: 'fetchDay',
            input: ({ context }) => ({ site: context.site, product: context.product, day: context.day }),
            onDone: [
              {
                guard: ({ event }) => event.output.length > 0,
                target: 'ready',
                actions: enqueueActions(({ event, enqueue }) => {
                  enqueue.assign({ times: event.output, timelineError: null })
                  enqueue({
                    type: 'navigate',
                    params: {
                      patch: { time: event.output.at(-1)!.vol_time },
                      mode: 'push',
                    },
                  })
                }),
              },
              { target: 'empty', actions: assign({ times: [], timelineError: null }) },
            ],
            onError: {
              target: 'error',
              actions: assign({
                timelineError: ({ event }) =>
                  event.error instanceof Error ? event.error.message : String(event.error),
              }),
            },
          },
        },
        ready: {},
        empty: {},
        error: {},
      },
    },
  },
})
