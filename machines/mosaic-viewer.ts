// Máquina de la vista de mosaico multi-radar (D43/P4). Hermana reducida de
// viewerMachine: mismas dos regiones paralelas ('raster'/'timeline'), mismo
// patrón URL-manda + fetch inyectado, pero indexada por `domain`+`product`+
// `slot_time` (no `site`+`vol_time`) contra /api/mosaic/*. Alcance recortado
// a propósito (ver docs/decisiones.md D44): sin fenómenos/VWP/viento/rayos/
// anotaciones/export en esta vista — esos overlays son por-radar por
// naturaleza, el dominio no tiene un `site_id` único al que atarlos.
//
// Celdas multi-radar (P5, D45): región `cells` propia, unión de la fila de
// fenómenos de CADA sitio del dominio contra el mismo slot_time mostrado
// (nearestWithin por sitio, sin endpoint nuevo — ver fetchCells en la
// página). Sin SSR: se dispara con CELLS_INIT desde onMounted (nunca en
// servidor), así no hay doble fetch servidor+cliente. El dominio no
// cambia dentro de la vida de un actor (la página remonta entera por
// `key: route => route.params.domain`), así que el refetch por
// ROUTE_CHANGED solo mira el slot_time.
import type { BaseMapId } from '#shared/basemaps'
import type { MosaicRasterMeta, Phenomenon, WindGridFile, WindLevel } from '#shared/contract'
import { assign, enqueueActions, fromPromise, setup } from 'xstate'
import type { ViewerPrefs } from '../composables/useViewerPrefs'
import type { NormalizedStrike } from '../utils/overlay/lightning-join'

/** capas de overlay que SÍ existen en el mosaico — subconjunto del
 * OVERLAY_LAYERS del viewer de un solo radar (machines/overlay.ts): meso,
 * tracks, viento y rayos son por-radar y no se dibujan acá. El nombre de la
 * claves y el formato del query param se comparten a propósito:
 * `?layers=cells,wind` significa lo mismo en las dos vistas. Viento y rayos
 * son datos POR SITIO: acá se unen los N sitios del dominio (D49). */
export const MOSAIC_LAYERS = ['cells', 'wind', 'lightning'] as const
export type MosaicLayerId = (typeof MOSAIC_LAYERS)[number]

/** preferencias de display del usuario que aplican al mosaico (no van en la
 * URL; mismo localStorage que el viewer de un solo radar) */
export type MosaicPrefsSlice = Pick<ViewerPrefs, 'units' | 'clock' | 'animationFrames' | 'showPalette'>

/** patch persistible en localStorage (composables/useViewerPrefs.ts) */
export type MosaicPrefsParams = Partial<Omit<ViewerPrefs, 'v'>>

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
  /** celda seleccionada, `SITE:ID` (P5/D45) — null = ninguna */
  cell: string | null
  /** overlays activos (`?layers=cells,wind,lightning`), mismo contrato de URL
   * que el viewer de un solo radar; default vacío (todo apagado) */
  layers: MosaicLayerId[]
  /** capa GOES de fondo (`?sat=1`), igual que en el viewer de un solo radar */
  sat: boolean
  satVariant: 'ir' | 'vis'
  satOpacity: number
  /** nivel del campo de viento (`?windLevel=`); ausente = 10m */
  windLevel: WindLevel
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
  sat: boolean
  satVariant: 'ir' | 'vis'
  satOpacity: number
}

/** toggles de overlay en la query — replace inmediato, sin debounce (D23) */
export interface MosaicLayersQueryParams {
  layers: MosaicLayerId[]
  windLevel: WindLevel
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
  | { type: 'SELECT_CELL', cellId: string | null }
  | { type: 'OVERLAY_INIT' }
  | { type: 'TOGGLE_LAYER', layer: MosaicLayerId }
  | { type: 'TOGGLE_SAT' }
  | { type: 'SELECT_SAT_VARIANT', variant: 'ir' | 'vis' }
  | { type: 'SET_SAT_OPACITY', value: number }
  | { type: 'SELECT_WIND_LEVEL', level: WindLevel }
  | { type: 'PREFS_LOADED', prefs: MosaicPrefsSlice }
  | { type: 'SET_PREF', patch: Partial<MosaicPrefsSlice> }

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
  cells: Phenomenon[]
  cellsError: string | null
  selectedCell: string | null
  /** slot_time ya resuelto por fetchCells — evita refetch si no cambió */
  cellsKey: string | null
  layers: MosaicLayerId[]
  sat: boolean
  satVariant: 'ir' | 'vis'
  satOpacity: number
  windLevel: WindLevel
  /** campo u/v YA UNIDO de los sitios del dominio (D49); null = sin dato */
  windGrid: WindGridFile | null
  windError: string | null
  /** `${slot_time}|${level}` ya resuelto — evita refetch si no cambió */
  windKey: string | null
  /** descargas de la ventana del slot, unidas y deduplicadas entre sitios */
  lightningStrikes: NormalizedStrike[] | null
  lightningError: string | null
  /** `${prev_slot_time}|${slot_time}` ya resuelto */
  lightningKey: string | null
  // prefs de display (localStorage, nunca la URL) — placeholders hasta
  // PREFS_LOADED, igual que viewerMachine
  units: MosaicPrefsSlice['units']
  clock: MosaicPrefsSlice['clock']
  animationFrames: number
  showPalette: boolean
}

const dayOf = (iso: string) => iso.slice(0, 10)

/** slot anterior al mostrado dentro del día cargado; null en el borde (la
 * ventana de rayos cae entonces al fallback de 600 s de lightning-join.ts) */
function prevSlotOf(context: MosaicViewerContext): string | null {
  const t = context.time ?? context.nowT
  const idx = context.times.findIndex(r => r.slot_time === t)
  return idx > 0 ? context.times[idx - 1]!.slot_time : null
}

const windKeyOf = (context: MosaicViewerContext) => `${context.time ?? context.nowT}|${context.windLevel}`
const lightningKeyOf = (context: MosaicViewerContext) =>
  `${prevSlotOf(context) ?? ''}|${context.time ?? context.nowT}`

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
      selectedCell: route.cell,
      layers: route.layers,
      sat: route.sat,
      satVariant: route.satVariant,
      satOpacity: route.satOpacity,
      windLevel: route.windLevel,
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
    // unión por sitio del dominio contra el mismo slot_time (P5/D45); la
    // página resuelve site_ids y hace el join nearestWithin por sitio, sin
    // endpoint nuevo
    fetchCells: fromPromise<Phenomenon[], { domain: string, t: string }>(async () => {
      throw new Error('fetchCells sin proveer (.provide)')
    }),
    // viento y rayos son datos POR SITIO (D49): la página consulta el índice
    // de cada `site_id` del dominio, hace el join (nearestWithin para viento,
    // ventana de observación para rayos) y UNE el resultado — grillas u/v
    // con `mergeWindGrids`, descargas concatenadas y deduplicadas.
    fetchWind: fromPromise<WindGridFile | null, { domain: string, t: string, level: WindLevel }>(
      async () => {
        throw new Error('fetchWind sin proveer (.provide)')
      },
    ),
    fetchLightning: fromPromise<
      NormalizedStrike[] | null,
      { domain: string, t: string, prevT: string | null }
    >(async () => {
      throw new Error('fetchLightning sin proveer (.provide)')
    }),
  },
  actions: {
    navigate: (_args, _params: MosaicNavigateParams) => {
      throw new Error('navigate sin proveer (.provide)')
    },
    syncQuery: (_args, _params: MosaicDisplayQueryParams) => {},
    syncCellQuery: (_args, _params: { cellId: string | null }) => {},
    syncLayersQuery: (_args, _params: MosaicLayersQueryParams) => {},
    persistPrefs: (_args, _params: MosaicPrefsParams) => {},
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
    cells: [],
    cellsError: null,
    selectedCell: input.route.cell,
    cellsKey: null,
    layers: input.route.layers,
    sat: input.route.sat,
    satVariant: input.route.satVariant,
    satOpacity: input.route.satOpacity,
    windLevel: input.route.windLevel,
    windGrid: null,
    windError: null,
    windKey: null,
    lightningStrikes: null,
    lightningError: null,
    lightningKey: null,
    units: 'imperial',
    clock: 'utc',
    animationFrames: 12,
    showPalette: true,
  }),
  on: {
    SET_LIVE_REFRESH: { actions: assign({ liveRefresh: ({ event }) => event.value }) },
    SET_OPACITY: {
      actions: [
        assign({ opacity: ({ event }) => event.value }),
        {
          type: 'syncQuery',
          params: ({ context, event }) => ({
            opacity: event.value,
            base: context.base,
            coverage: context.coverage,
            sat: context.sat,
            satVariant: context.satVariant,
            satOpacity: context.satOpacity,
          }),
        },
      ],
    },
    SELECT_BASE: {
      actions: [
        assign({ base: ({ event }) => event.base }),
        {
          type: 'syncQuery',
          params: ({ context, event }) => ({
            opacity: context.opacity,
            base: event.base,
            coverage: context.coverage,
            sat: context.sat,
            satVariant: context.satVariant,
            satOpacity: context.satOpacity,
          }),
        },
      ],
    },
    TOGGLE_COVERAGE: {
      actions: enqueueActions(({ context, enqueue }) => {
        const coverage = !context.coverage
        enqueue.assign({ coverage })
        enqueue({
          type: 'syncQuery',
          params: {
            opacity: context.opacity,
            base: context.base,
            coverage,
            sat: context.sat,
            satVariant: context.satVariant,
            satOpacity: context.satOpacity,
          },
        })
      }),
    },
    COG_ERROR: { actions: assign({ cogError: ({ event }) => event.message }) },
    // Satélite (GOES/WMS): puro display, sin fetch propio — igual que en el
    // viewer de un solo radar, y la única capa de este grupo que no es
    // por-sitio (WMS global, no depende del dominio).
    TOGGLE_SAT: {
      actions: enqueueActions(({ context, enqueue }) => {
        const sat = !context.sat
        enqueue.assign({ sat })
        enqueue({
          type: 'syncQuery',
          params: {
            opacity: context.opacity,
            base: context.base,
            coverage: context.coverage,
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
            coverage: context.coverage,
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
            coverage: context.coverage,
            sat: context.sat,
            satVariant: context.satVariant,
            satOpacity: event.value,
          }),
        },
      ],
    },
    // Preferencias de display (mismas semánticas que viewerMachine):
    // PREFS_LOADED solo asigna (post-mount, leído de localStorage);
    // SET_PREF asigna y persiste el patch exacto.
    PREFS_LOADED: { actions: assign(({ event }) => ({ ...event.prefs })) },
    SET_PREF: {
      actions: [
        assign(({ event }) => ({ ...event.patch })),
        { type: 'persistPrefs', params: ({ event }) => event.patch },
      ],
    },
    SELECT_CELL: {
      actions: [
        assign({ selectedCell: ({ event }) => event.cellId }),
        { type: 'syncCellQuery', params: ({ event }) => ({ cellId: event.cellId }) },
      ],
    },
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
    cells: {
      on: {
        OVERLAY_INIT: {
          target: '.loading',
          guard: ({ context }) => context.cellsKey === null && context.layers.includes('cells'),
        },
        // Solo la transición de carga: el assign de `layers` y el sync de la
        // query los hace la región `layers` (ver abajo). Guard por PAYLOAD —
        // en la difusión a regiones paralelas los guards leen el snapshot
        // previo, así que "encender" es `!context.layers.includes(...)`.
        TOGGLE_LAYER: {
          target: '.loading',
          guard: ({ context, event }) =>
            event.layer === 'cells'
            && !context.layers.includes('cells')
            && context.cellsKey !== (context.time ?? context.nowT),
        },
        ROUTE_CHANGED: {
          // SIN reenter: true — el target ya es un estado distinto del
          // actual (ready/error -> loading), así que ya es una transición
          // externa (reinvoca igual); `reenter` sobra acá y, combinado con
          // otra región paralela manejando el MISMO evento, hace que XState
          // descarte esta transición en silencio (repro aislado, sin guard
          // de por medio — ver tests/unit/mosaic-viewer-machine.spec.ts).
          target: '.loading',
          // el guard lee las capas del PAYLOAD, no del contexto: en la
          // difusión a regiones paralelas los guards ven el snapshot previo
          // (assignRoute corre en la región 'raster', que va primero)
          guard: ({ context, event }) => {
            const { route } = event as Extract<MosaicViewerEvent, { type: 'ROUTE_CHANGED' }>
            if (!route.layers.includes('cells')) return false
            const key = route.time ?? context.nowT
            return context.cellsKey !== null && key !== context.cellsKey
          },
        },
      },
      initial: 'idle',
      states: {
        idle: {},
        loading: {
          invoke: {
            src: 'fetchCells',
            input: ({ context }) => ({ domain: context.domain, t: context.time ?? context.nowT }),
            onDone: {
              target: 'ready',
              actions: assign({
                cells: ({ event }) => event.output,
                cellsError: null,
                cellsKey: ({ context }) => context.time ?? context.nowT,
              }),
            },
            onError: {
              target: 'error',
              actions: assign({
                cellsError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)),
              }),
            },
          },
        },
        ready: {},
        error: {},
      },
    },
    // Región sin estados útiles: solo posee el assign de `layers` y el sync
    // de la query para TOGGLE_LAYER. Vive aparte para que las regiones de
    // datos (cells/wind/lightning) puedan declarar el MISMO evento sin que
    // el assign corra tres veces — en una máquina paralela el evento se
    // difunde a todas las regiones que lo declaran, pero un `on` de la raíz
    // quedaría ensombrecido por ellas (gotcha de D45).
    layers: {
      on: {
        TOGGLE_LAYER: {
          actions: enqueueActions(({ context, event, enqueue }) => {
            const layers = context.layers.includes(event.layer)
              ? context.layers.filter(l => l !== event.layer)
              : [...context.layers, event.layer]
            enqueue.assign({ layers })
            enqueue({ type: 'syncLayersQuery', params: { layers, windLevel: context.windLevel } })
          }),
        },
      },
      initial: 'idle',
      states: { idle: {} },
    },
    // Viento (D49): unión de las grillas u/v de los N sitios del dominio.
    // `windKey` = `${slot_time}|${level}` — cambiar de nivel con la capa
    // encendida invalida y recarga, igual que en overlayMachine.
    wind: {
      on: {
        OVERLAY_INIT: {
          target: '.loading',
          guard: ({ context }) => context.windKey === null && context.layers.includes('wind'),
        },
        TOGGLE_LAYER: {
          target: '.loading',
          guard: ({ context, event }) =>
            event.layer === 'wind'
            && !context.layers.includes('wind')
            && context.windKey !== windKeyOf(context),
        },
        // el assign del nivel vive ACA, no en la región `layers`: así corre
        // antes de entrar a `.loading` y el input del invoke ya lee el nivel
        // nuevo (el orden entre acciones de regiones distintas no lo es)
        SELECT_WIND_LEVEL: [
          { guard: ({ context, event }) => event.level === context.windLevel },
          {
            target: '.loading',
            guard: ({ context }) => context.layers.includes('wind'),
            actions: enqueueActions(({ context, event, enqueue }) => {
              enqueue.assign({ windLevel: event.level, windGrid: null })
              enqueue({ type: 'syncLayersQuery', params: { layers: context.layers, windLevel: event.level } })
            }),
          },
          {
            actions: enqueueActions(({ context, event, enqueue }) => {
              enqueue.assign({ windLevel: event.level, windGrid: null, windKey: null })
              enqueue({ type: 'syncLayersQuery', params: { layers: context.layers, windLevel: event.level } })
            }),
          },
        ],
        ROUTE_CHANGED: {
          target: '.loading',
          guard: ({ context, event }) => {
            const { route } = event as Extract<MosaicViewerEvent, { type: 'ROUTE_CHANGED' }>
            if (!route.layers.includes('wind')) return false
            const key = `${route.time ?? context.nowT}|${route.windLevel}`
            return context.windKey !== null && key !== context.windKey
          },
        },
      },
      initial: 'idle',
      states: {
        idle: {},
        loading: {
          invoke: {
            src: 'fetchWind',
            input: ({ context }) => ({
              domain: context.domain,
              t: context.time ?? context.nowT,
              level: context.windLevel,
            }),
            onDone: [
              {
                guard: ({ event }) => event.output !== null,
                target: 'ready',
                actions: assign({
                  windGrid: ({ event }) => event.output,
                  windError: null,
                  windKey: ({ context }) => windKeyOf(context),
                }),
              },
              {
                target: 'noData',
                actions: assign({
                  windGrid: null,
                  windError: null,
                  windKey: ({ context }) => windKeyOf(context),
                }),
              },
            ],
            onError: {
              target: 'error',
              actions: assign({
                windGrid: null,
                windError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)),
              }),
            },
          },
        },
        ready: {},
        noData: {},
        error: {},
      },
    },
    // Rayos (D49): mismos cubos de 300 s por sitio que el viewer de un solo
    // radar, unidos y DEDUPLICADOS (dos radares vecinos reciben la misma
    // descarga). La ventana es `(slot anterior, slot]` — el slot anterior
    // sale de `context.times`, no de restar 300 s: un hueco del feed no debe
    // inventar un intervalo que no se observó.
    lightning: {
      on: {
        OVERLAY_INIT: {
          target: '.loading',
          guard: ({ context }) => context.lightningKey === null && context.layers.includes('lightning'),
        },
        TOGGLE_LAYER: {
          target: '.loading',
          guard: ({ context, event }) =>
            event.layer === 'lightning'
            && !context.layers.includes('lightning')
            && context.lightningKey !== lightningKeyOf(context),
        },
        ROUTE_CHANGED: {
          target: '.loading',
          guard: ({ context, event }) => {
            const { route } = event as Extract<MosaicViewerEvent, { type: 'ROUTE_CHANGED' }>
            if (!route.layers.includes('lightning')) return false
            const t = route.time ?? context.nowT
            return context.lightningKey !== null && !context.lightningKey.endsWith(`|${t}`)
          },
        },
      },
      initial: 'idle',
      states: {
        idle: {},
        loading: {
          invoke: {
            src: 'fetchLightning',
            input: ({ context }) => ({
              domain: context.domain,
              t: context.time ?? context.nowT,
              prevT: prevSlotOf(context),
            }),
            onDone: [
              {
                guard: ({ event }) => event.output !== null && event.output.length > 0,
                target: 'ready',
                actions: assign({
                  lightningStrikes: ({ event }) => event.output,
                  lightningError: null,
                  lightningKey: ({ context }) => lightningKeyOf(context),
                }),
              },
              {
                target: 'noData',
                actions: assign({
                  lightningStrikes: ({ event }) => event.output ?? [],
                  lightningError: null,
                  lightningKey: ({ context }) => lightningKeyOf(context),
                }),
              },
            ],
            onError: {
              target: 'error',
              actions: assign({
                lightningStrikes: null,
                lightningError: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)),
              }),
            },
          },
        },
        ready: {},
        noData: {},
        error: {},
      },
    },
  },
})
