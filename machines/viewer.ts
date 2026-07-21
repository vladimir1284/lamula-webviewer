// Máquina raíz de la página viewer (decisión 18). URL manda: la ruta entra
// como ROUTE_CHANGED (incluido back/forward) y las transiciones que cambian
// la selección navegan como efecto 'navigate'. Pura: navegación y fetch se
// inyectan vía .provide() — los tests corren con createActor sin router ni
// red. Regiones paralelas: 'raster' (frame mostrado) y 'timeline' (rasters
// del día). Diagrama: docs/maquinas-estado.md (actualizar en el mismo commit).
import type { BaseMapId } from '#shared/basemaps'
import type { Product, Radar, RasterMeta } from '#shared/contract'
import { assign, enqueueActions, fromPromise, setup } from 'xstate'
import type { ViewerPrefs } from '../composables/useViewerPrefs'
import type { CursorSample } from '../utils/map/cursor'
import type { OverlayLayerId, PanelId } from './overlay'

/** Lo compartible de la URL, ya parseado (ver composables/useViewerRoute.ts) */
export interface ViewerRouteState {
  site: string
  product: number
  /** ISO naive del contrato; null = vista live (sin time en el path) */
  time: string | null
  opacity: number
  base: BaseMapId
  /** capas de fenómenos activas (?layers=cells,meso — D23) */
  layers: OverlayLayerId[]
  /** panel derecho abierto (?panel=cells|trend|vwp) */
  panel: PanelId | null
  /** celda seleccionada (?cell=D4) */
  cell: string | null
  /** overrides individuales de trayectoria, independientes del toggle de grupo trackPast/trackFuture (?pastCells=D4,D7) */
  pastCells: string[]
  /** (?futureCells=D4,D7) */
  futureCells: string[]
  /** capa de fondo GOES (NOAA WMS) — ?sat=1&satVar=vis|ir&satOp=0..1, shareable como layers/panel/cell */
  sat: boolean
  satVariant: 'vis' | 'ir'
  satOpacity: number
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

/** patch persistible en localStorage (composables/useViewerPrefs.ts) */
export type PrefsParams = Partial<Omit<ViewerPrefs, 'v'>>

/** preferencias de display del usuario (no compartibles — nunca en la URL) */
export type UserPrefsSlice = Pick<ViewerPrefs, 'coverage' | 'units' | 'clock' | 'animationFrames' | 'smooth' | 'smoothRadius'>

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
  /** botón refrescar de la barra de tiempo: repide /api/rasters/day para el mismo día */
  | { type: 'REFRESH_TIMELINE' }
  | { type: 'SELECT_TIME', time: string }
  | { type: 'STEP', dir: 1 | -1 }
  | { type: 'SET_OPACITY', value: number }
  | { type: 'SELECT_BASE', base: BaseMapId }
  | { type: 'CURSOR_MOVE', sample: CursorSample | null }
  | { type: 'COG_ERROR', message: string }
  | { type: 'TOGGLE_LAYER', layer: OverlayLayerId }
  | { type: 'SELECT_PANEL', panel: PanelId | null }
  | { type: 'SELECT_CELL', cellId: string | null }
  | { type: 'TOGGLE_CELL_TRACK', cellId: string, kind: 'past' | 'future' }
  | { type: 'PREFS_LOADED', prefs: UserPrefsSlice }
  | { type: 'SET_PREF', patch: Partial<UserPrefsSlice> }
  | { type: 'TOGGLE_SATELLITE' }
  | { type: 'SELECT_SAT_VARIANT', variant: 'vis' | 'ir' }
  | { type: 'SET_SAT_OPACITY', value: number }

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
  /** ya se confirmó (404) que no hay frame anterior/siguiente en la serie — deshabilita el botón */
  atStart: boolean
  atEnd: boolean
  opacity: number
  base: BaseMapId
  layers: OverlayLayerId[]
  panel: PanelId | null
  cell: string | null
  pastCells: string[]
  futureCells: string[]
  sat: boolean
  satVariant: 'vis' | 'ir'
  satOpacity: number
  cursor: CursorSample | null
  cogError: string
  /** preferencias de display; los iniciales son placeholders SSR deterministas
   * (el server no conoce la zona del navegador) — los reales llegan por
   * PREFS_LOADED tras montar */
  coverage: boolean
  units: 'imperial' | 'si'
  clock: 'utc' | 'local'
  animationFrames: number
  /** suavizado de la capa raster estática (decisión 32) */
  smooth: boolean
  /** radio de suavizado, 1/2/4/8 (decisión 33) — sin efecto si smooth es false */
  smoothRadius: 1 | 2 | 4 | 8
}

/** query params de configuración de display (opacity/base/satélite) — un solo syncQuery debounced */
export interface DisplayQueryParams {
  opacity: number
  base: BaseMapId
  sat: boolean
  satVariant: 'vis' | 'ir'
  satOpacity: number
}

/** slice de la query que refleja el estado de overlays (D23) */
export interface OverlayQueryParams {
  layers: OverlayLayerId[]
  panel: PanelId | null
  cell: string | null
  pastCells: string[]
  futureCells: string[]
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
      layers: route.layers,
      panel: route.panel,
      cell: route.cell,
      pastCells: route.pastCells,
      futureCells: route.futureCells,
      sat: route.sat,
      satVariant: route.satVariant,
      satOpacity: route.satOpacity,
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
    // /api/rasters/{next,prev} — solo se llama al agotar los vecinos locales
    // de context.times (cruce de día); 404 → null (extremo real de la serie)
    fetchStep: fromPromise<
      RasterMeta | null,
      { site: string, product: number, t: string, mode: 'next' | 'prev' }
    >(async () => {
      throw new Error('fetchStep sin proveer (.provide)')
    }),
  },
  actions: {
    // efecto de navegación (router push/replace) — lo provee la página
    navigate: (_args, _params: NavigateParams) => {
      throw new Error('navigate sin proveer (.provide)')
    },
    // efectos opcionales (noop por defecto; la página los provee):
    // persistir prefs en localStorage y reflejar opacity/base en la query
    persistPrefs: (_args, _params: PrefsParams) => {},
    syncQuery: (_args, _params: DisplayQueryParams) => {},
    // reflejar toggles de overlays en la query (replace inmediato — D23)
    syncOverlayQuery: (_args, _params: OverlayQueryParams) => {},
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
      && route.time !== null
      && route.time === context.raster?.vol_time,
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
    atStart: false,
    atEnd: false,
    opacity: input.route.opacity,
    base: input.route.base,
    layers: input.route.layers,
    panel: input.route.panel,
    cell: input.route.cell,
    pastCells: input.route.pastCells,
    futureCells: input.route.futureCells,
    sat: input.route.sat,
    satVariant: input.route.satVariant,
    satOpacity: input.route.satOpacity,
    cursor: null,
    cogError: '',
    coverage: true,
    units: 'imperial',
    clock: 'utc',
    animationFrames: 12,
    smooth: false,
    smoothRadius: 1,
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
          params: ({ context, event }) => ({
            opacity: event.value,
            base: context.base,
            sat: context.sat,
            satVariant: context.satVariant,
            satOpacity: context.satOpacity,
          }),
        },
      ],
    },
    // mapa base (catálogo en shared/basemaps.ts): pref personal + shareable,
    // mismo doble efecto que SET_OPACITY (persistPrefs + syncQuery)
    SELECT_BASE: {
      actions: [
        assign({ base: ({ event }) => event.base }),
        {
          type: 'persistPrefs',
          params: ({ context, event }) => ({
            site: context.site,
            product: context.product,
            opacity: context.opacity,
            base: event.base,
          }),
        },
        {
          type: 'syncQuery',
          params: ({ context, event }) => ({
            opacity: context.opacity,
            base: event.base,
            sat: context.sat,
            satVariant: context.satVariant,
            satOpacity: context.satOpacity,
          }),
        },
      ],
    },
    // capa de fondo GOES (D23-adyacente): shareable en la URL como layers/panel/cell,
    // pero NUNCA en localStorage (no es una pref personal) — de ahí que reuse
    // syncQuery (opacity/base) en vez de persistPrefs.
    TOGGLE_SATELLITE: {
      actions: enqueueActions(({ context, enqueue }) => {
        const sat = !context.sat
        enqueue.assign({ sat })
        enqueue({
          type: 'syncQuery',
          params: {
            opacity: context.opacity,
            base: context.base,
            sat,
            satVariant: context.satVariant,
            satOpacity: context.satOpacity,
          },
        })
      }),
    },
    SELECT_SAT_VARIANT: {
      actions: [
        assign({ satVariant: ({ event }) => event.variant }),
        {
          type: 'syncQuery',
          params: ({ context, event }) => ({
            opacity: context.opacity,
            base: context.base,
            sat: context.sat,
            satVariant: event.variant,
            satOpacity: context.satOpacity,
          }),
        },
      ],
    },
    SET_SAT_OPACITY: {
      actions: [
        assign({ satOpacity: ({ event }) => event.value }),
        {
          type: 'syncQuery',
          params: ({ context, event }) => ({
            opacity: context.opacity,
            base: context.base,
            sat: context.sat,
            satVariant: context.satVariant,
            satOpacity: event.value,
          }),
        },
      ],
    },
    COG_ERROR: { actions: assign({ cogError: ({ event }) => event.message }) },
    // Preferencias de display. PREFS_LOADED (post-mount, desde localStorage)
    // solo asigna — persistir aquí sería write-on-read. SET_PREF (diálogo)
    // asigna y persiste el patch exacto.
    PREFS_LOADED: {
      actions: assign(({ event }) => ({ ...event.prefs })),
    },
    SET_PREF: {
      actions: [
        assign(({ event }) => ({ ...event.patch })),
        { type: 'persistPrefs', params: ({ event }) => event.patch },
      ],
    },
    // Toggles de overlays (D23): assign optimista + replace de la query.
    // Cambios solo-query reentran por ROUTE_CHANGED y caen en sameFrame —
    // el raster no reparpadea.
    TOGGLE_LAYER: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const layers = context.layers.includes(event.layer)
          ? context.layers.filter(l => l !== event.layer)
          : [...context.layers, event.layer]
        enqueue.assign({ layers })
        enqueue({
          type: 'syncOverlayQuery',
          params: {
            layers,
            panel: context.panel,
            cell: context.cell,
            pastCells: context.pastCells,
            futureCells: context.futureCells,
          },
        })
      }),
    },
    SELECT_PANEL: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        enqueue.assign({ panel: event.panel })
        enqueue({
          type: 'syncOverlayQuery',
          params: {
            layers: context.layers,
            panel: event.panel,
            cell: context.cell,
            pastCells: context.pastCells,
            futureCells: context.futureCells,
          },
        })
      }),
    },
    // click en celda (mapa o tabla): selecciona y, con el panel cerrado,
    // abre la tendencia — el gesto pide ver esa celda
    SELECT_CELL: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const panel = event.cellId !== null && context.panel === null ? 'trend' : context.panel
        enqueue.assign({ cell: event.cellId, panel })
        enqueue({
          type: 'syncOverlayQuery',
          params: {
            layers: context.layers,
            panel,
            cell: event.cellId,
            pastCells: context.pastCells,
            futureCells: context.futureCells,
          },
        })
      }),
    },
    // checkbox individual de trayectoria en la tabla de celdas: independiente
    // del toggle de grupo trackPast/trackFuture (visibilidad efectiva = OR)
    TOGGLE_CELL_TRACK: {
      actions: enqueueActions(({ context, event, enqueue }) => {
        const key = event.kind === 'past' ? 'pastCells' : 'futureCells'
        const current = context[key]
        const next = current.includes(event.cellId)
          ? current.filter(id => id !== event.cellId)
          : [...current, event.cellId]
        enqueue.assign({ [key]: next })
        enqueue({
          type: 'syncOverlayQuery',
          params: {
            layers: context.layers,
            panel: context.panel,
            cell: context.cell,
            pastCells: key === 'pastCells' ? next : context.pastCells,
            futureCells: key === 'futureCells' ? next : context.futureCells,
          },
        })
      }),
    },
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
    // click directo en un tick de la timeline: salto dentro del mismo día.
    // El `assign` del time es optimista: router.replace() resuelve async y
    // nuestro watcher de ruta reacciona un tick después (ROUTE_CHANGED), así
    // que sin esto un segundo evento disparado de inmediato (doble click,
    // tecla repetida) leería context.time desactualizado — confirmado con
    // un test e2e de stepping rápido por teclado.
    SELECT_TIME: {
      actions: [
        assign({ time: ({ event }) => event.time }),
        {
          type: 'navigate',
          params: ({ event }) => ({ patch: { time: event.time }, mode: 'replace' as const }),
        },
      ],
    },
    // vista live servida en SSR: al montar, materializa el vol_time resuelto
    MOUNTED: {
      guard: ({ context }) => context.time === null && context.raster !== null,
      actions: [
        assign({ time: ({ context }) => context.raster!.vol_time }),
        {
          type: 'navigate',
          params: ({ context }) => ({
            patch: { time: context.raster!.vol_time },
            mode: 'replace' as const,
          }),
        },
      ],
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
            target: '.shown',
            guard: ({ context, event }) => {
              const { route } = event as Extract<ViewerEvent, { type: 'ROUTE_CHANGED' }>
              return route.site === context.site
                && route.product === context.product
                && route.time !== null
                && context.times.some(r => r.vol_time === route.time)
            },
            actions: [
              assignRoute,
              persistRouteParams,
              assign(({ context, event }) => {
                const { route } = event as Extract<ViewerEvent, { type: 'ROUTE_CHANGED' }>
                const targetRaster = context.times.find(r => r.vol_time === route.time)!
                return {
                  raster: targetRaster,
                  rasterError: null,
                  cogError: '',
                  cursor: null,
                  atStart: false,
                  atEnd: false,
                }
              }),
            ],
          },
          {
            target: '.loading',
            actions: [
              assignRoute,
              persistRouteParams,
              assign({ cogError: '', cursor: null, atStart: false, atEnd: false }),
            ],
          },
        ],
        // stepping: primero local sobre context.times (sin roundtrip); en
        // los extremos de la serie cargada, next/prev API cruza el día.
        // El `assign` del time es optimista (ver comentario en SELECT_TIME):
        // sin él, pulsar ←/→ dos veces seguidas antes de que el roundtrip de
        // router.replace() resuelva calcula el segundo salto desde un
        // context.time desactualizado.
        STEP: [
          {
            guard: ({ context, event }) => {
              if (context.time === null) return false
              const idx = context.times.findIndex(r => r.vol_time === context.time)
              if (idx === -1) return false
              const n = idx + event.dir
              return n >= 0 && n < context.times.length
            },
            actions: enqueueActions(({ context, event, enqueue }) => {
              const idx = context.times.findIndex(r => r.vol_time === context.time)
              const time = context.times[idx + event.dir]!.vol_time
              enqueue.assign({ time })
              enqueue({ type: 'navigate', params: { patch: { time }, mode: 'replace' } })
            }),
          },
          // extremo ya confirmado (404 previo) en esa dirección: no-op
          { guard: ({ context, event }) => (event.dir === 1 ? context.atEnd : context.atStart) },
          { guard: ({ event }) => event.dir === 1, target: '.steppingNext' },
          { target: '.steppingPrev' },
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
                  // corrige con replace (assign optimista, ver STEP)
                  if (event.output && event.output.vol_time !== context.time) {
                    enqueue.assign({ time: event.output.vol_time })
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
        steppingNext: {
          invoke: {
            src: 'fetchStep',
            input: ({ context }) => ({
              site: context.site,
              product: context.product,
              t: context.time ?? context.nowT,
              mode: 'next' as const,
            }),
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: 'shown',
                actions: enqueueActions(({ event, enqueue }) => {
                  enqueue.assign({
                    raster: event.output,
                    rasterError: null,
                    atStart: false,
                    atEnd: false,
                    time: event.output!.vol_time,
                  })
                  enqueue({
                    type: 'navigate',
                    params: { patch: { time: event.output!.vol_time }, mode: 'replace' },
                  })
                }),
              },
              // extremo real de la serie: se queda en el frame actual, botón se deshabilita
              { target: 'shown', actions: assign({ atEnd: true }) },
            ],
            // fallo de red al pisar el extremo: degrada en silencio, se queda mostrando el frame actual
            onError: { target: 'shown' },
          },
        },
        steppingPrev: {
          invoke: {
            src: 'fetchStep',
            input: ({ context }) => ({
              site: context.site,
              product: context.product,
              t: context.time ?? context.nowT,
              mode: 'prev' as const,
            }),
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: 'shown',
                actions: enqueueActions(({ event, enqueue }) => {
                  enqueue.assign({
                    raster: event.output,
                    rasterError: null,
                    atStart: false,
                    atEnd: false,
                    time: event.output!.vol_time,
                  })
                  enqueue({
                    type: 'navigate',
                    params: { patch: { time: event.output!.vol_time }, mode: 'replace' },
                  })
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
        REFRESH_TIMELINE: '.refreshing',
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
                  const time = event.output.at(-1)!.vol_time
                  enqueue.assign({ times: event.output, timelineError: null })
                  enqueue.assign({ time })
                  enqueue({
                    type: 'navigate',
                    params: { patch: { time }, mode: 'push' },
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
        // botón refrescar: repide fetchDay del MISMO día. Si el usuario
        // estaba en el último frame, salta al nuevo último (más volúmenes
        // llegaron); si estaba en medio, conserva su posición — a
        // diferencia de 'jumping' (DayPicker) que siempre salta al último.
        refreshing: {
          invoke: {
            src: 'fetchDay',
            input: ({ context }) => ({ site: context.site, product: context.product, day: context.day }),
            onDone: [
              {
                guard: ({ event }) => event.output.length > 0,
                target: 'ready',
                actions: enqueueActions(({ context, event, enqueue }) => {
                  const wasAtLast = context.times.length > 0 && context.time === context.times.at(-1)!.vol_time
                  enqueue.assign({ times: event.output, timelineError: null })
                  if (wasAtLast) {
                    const time = event.output.at(-1)!.vol_time
                    enqueue.assign({ time })
                    enqueue({ type: 'navigate', params: { patch: { time }, mode: 'replace' } })
                  }
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
      },
    },
  },
})
