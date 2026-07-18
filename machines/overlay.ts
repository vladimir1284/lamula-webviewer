// Máquina de overlays de fenómenos + VWP (F4, decisión 27): separada de
// viewerMachine (patrón animationMachine) porque el vol_time efectivo
// durante la animación vive en la página, no en viewerMachine. La página
// la orquesta con watchers: SET_SCOPE (site/día), SET_TIME (frame
// mostrado), SET_ACTIVE (toggles de la URL), SELECT_CELL.
//
// Join temporal (decisión 24): fenómenos y VWP tienen vol_times propios;
// la región 'index' carga los índices del día y 'frame'/'vwp' casan el
// frame mostrado con nearestWithin (≤600 s). Fuera de tolerancia →
// noData visible, nunca celdas de otro momento como actuales.
//
// SSR: la máquina arranca con todo idle y sin fetch — la activación llega
// por eventos tras el mount (sin mismatch de hidratación). Los fetch se
// cancelan solos al reentrar el estado que los invoca (last-wins).
//
// NOTA XState v5 (misma lección que viewerMachine): en una máquina
// paralela un `on` raíz queda ensombrecido si cualquier región define el
// mismo evento — aquí TODO evento se maneja a nivel de región (varias
// regiones pueden manejar el mismo evento: se les difunde a todas). Los
// guards de un evento difundido se evalúan ANTES de los assign de otras
// regiones en el mismo micropaso → los guards de SET_ACTIVE leen el
// payload del evento, no context.layers/panel.
//
// Diagrama: docs/maquinas-estado.md (actualizar en el mismo commit).
import type { Phenomenon, VwpLevel, WindGridFile, WindGridMeta } from '#shared/contract'
import { assign, fromPromise, raise, setup } from 'xstate'
import { nearestWithin, WIND_JOIN_TOLERANCE_S } from '../utils/overlay/join'

export const OVERLAY_LAYERS = ['cells', 'meso', 'trackPast', 'trackFuture', 'wind'] as const
export type OverlayLayerId = (typeof OVERLAY_LAYERS)[number]

/** subconjunto de layers que se pinta con filas de fenómenos — 'wind' NO
 * dispara ese fetch (tiene región e índice propios) */
export const PHENOMENA_LAYERS: readonly OverlayLayerId[] = ['cells', 'meso', 'trackPast', 'trackFuture']

export const PANELS = ['cells', 'trend', 'vwp'] as const
export type PanelId = (typeof PANELS)[number]

/** columnas del grid VWP: perfiles del día hasta el frame mostrado */
export const VWP_WINDOW = 12

export interface OverlayInput {
  site: string
  day: string
}

export type OverlayEvent =
  | { type: 'SET_SCOPE', site: string, day: string }
  | { type: 'SET_TIME', volTime: string | null }
  | { type: 'SET_ACTIVE', layers: OverlayLayerId[], panel: PanelId | null }
  | { type: 'SELECT_CELL', cellId: string | null }
  | { type: 'INDEX_READY' }

interface OverlayContext {
  site: string
  day: string
  /** vol_time del frame raster mostrado (animación o estático) */
  volTime: string | null
  layers: OverlayLayerId[]
  panel: PanelId | null
  cellId: string | null
  /** índices del día (null = sin cargar) */
  phenTimes: string[] | null
  vwpTimes: string[] | null
  indexError: string | null
  /** vol_time de fenómenos casado con el frame (null = fuera de tolerancia) */
  joined: string | null
  phenomena: Phenomenon[] | null
  /** inmutable por vol_time → cache sin invalidación */
  phenCache: Record<string, Phenomenon[]>
  frameError: string | null
  series: Phenomenon[] | null
  seriesError: string | null
  /** columnas del grid VWP (vol_times) y perfil casado con el frame */
  vwpWindow: string[]
  vwpJoined: string | null
  vwpProfiles: Record<string, VwpLevel[]>
  vwpError: string | null
  /** índice de grillas de viento del día ±2 h (null = sin cargar) */
  windTimes: WindGridMeta[] | null
  /** valid_time casado con el frame (null = fuera de tolerancia de 1 h) */
  windJoined: string | null
  windGrid: WindGridFile | null
  /** por r2_key (el ciclo va en la key → inmutable de verdad) */
  windCache: Record<string, WindGridFile>
  windError: string | null
}

/** el overlay del mapa o los paneles de celdas necesitan las filas de fenómenos */
const needsPhenomena = (layers: OverlayLayerId[], panel: PanelId | null) =>
  layers.some(l => PHENOMENA_LAYERS.includes(l)) || panel === 'cells' || panel === 'trend'

/** metadata de la grilla casada (la key R2 sale de aquí, no se construye) */
const joinedWindMeta = (ctx: OverlayContext): WindGridMeta | null =>
  ctx.windTimes?.find(w => w.valid_time === ctx.windJoined) ?? null

/** últimas n columnas del día hasta el frame; sin frame → últimas n del día */
function windowUpTo(times: string[], volTime: string | null, n: number): string[] {
  const upTo = volTime === null ? times : times.filter(t => t <= volTime)
  return upTo.slice(-n)
}

const errMsg = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const overlayMachine = setup({
  types: {} as {
    context: OverlayContext
    events: OverlayEvent
    input: OverlayInput
  },
  actors: {
    // la página provee las implementaciones reales ($fetch)
    fetchTimes: fromPromise<{ phen: string[], vwp: string[] }, { site: string, day: string }>(
      async () => {
        throw new Error('fetchTimes sin proveer (.provide)')
      },
    ),
    fetchPhenomena: fromPromise<Phenomenon[], { site: string, volTime: string }>(async () => {
      throw new Error('fetchPhenomena sin proveer (.provide)')
    }),
    fetchSeries: fromPromise<Phenomenon[], { site: string, cellId: string }>(async () => {
      throw new Error('fetchSeries sin proveer (.provide)')
    }),
    // perfiles que faltan en cache, en batch → Record<vol_time, filas>
    fetchVwp: fromPromise<Record<string, VwpLevel[]>, { site: string, volTimes: string[] }>(
      async () => {
        throw new Error('fetchVwp sin proveer (.provide)')
      },
    ),
    // índice del día ±2 h (/api/wind/times) — propio, no va en fetchTimes:
    // activar viento no debe fetchear índices de fenómenos/VWP ni viceversa
    fetchWindTimes: fromPromise<WindGridMeta[], { site: string, day: string }>(async () => {
      throw new Error('fetchWindTimes sin proveer (.provide)')
    }),
    // JSON u/v directo de R2 (como los COGs), validado con zWindGridFile
    fetchWindGrid: fromPromise<WindGridFile, { meta: WindGridMeta }>(async () => {
      throw new Error('fetchWindGrid sin proveer (.provide)')
    }),
  },
  guards: {
    activeFromEvent: ({ event }) => {
      const e = event as Extract<OverlayEvent, { type: 'SET_ACTIVE' }>
      return needsPhenomena(e.layers, e.panel) || e.panel === 'vwp'
    },
    needsPhenFromEvent: ({ event }) => {
      const e = event as Extract<OverlayEvent, { type: 'SET_ACTIVE' }>
      return needsPhenomena(e.layers, e.panel)
    },
    needsPhenFromContext: ({ context }) => needsPhenomena(context.layers, context.panel),
  },
}).createMachine({
  id: 'overlay',
  context: ({ input }) => ({
    site: input.site,
    day: input.day,
    volTime: null,
    layers: [],
    panel: null,
    cellId: null,
    phenTimes: null,
    vwpTimes: null,
    indexError: null,
    joined: null,
    phenomena: null,
    phenCache: {},
    frameError: null,
    series: null,
    seriesError: null,
    vwpWindow: [],
    vwpJoined: null,
    vwpProfiles: {},
    vwpError: null,
    windTimes: null,
    windJoined: null,
    windGrid: null,
    windCache: {},
    windError: null,
  }),
  type: 'parallel',
  states: {
    // índices de vol_times del día (fenómenos + VWP en un Promise.all)
    index: {
      on: {
        // cambia site o día: índices y todo lo derivado quedan inválidos.
        // Esta región (primera declarada) hace los assign compartidos.
        SET_SCOPE: {
          target: '.deciding',
          actions: assign(({ event }) => ({
            site: event.site,
            day: event.day,
            // el frame mostrado del scope anterior no vale aquí — la página
            // reemite SET_TIME tras el cambio de ruta
            volTime: null,
            phenTimes: null,
            vwpTimes: null,
            indexError: null,
            joined: null,
            phenomena: null,
            phenCache: {},
            series: null,
            seriesError: null,
            vwpWindow: [],
            vwpJoined: null,
            vwpProfiles: {},
            vwpError: null,
            windTimes: null,
            windJoined: null,
            windGrid: null,
            windCache: {},
            windError: null,
          })),
        },
        SET_ACTIVE: [
          {
            guard: ({ context, event }) =>
              context.phenTimes === null
              && (needsPhenomena(event.layers, event.panel) || event.panel === 'vwp'),
            target: '.loading',
            actions: assign({
              layers: ({ event }) => event.layers,
              panel: ({ event }) => event.panel,
            }),
          },
          {
            actions: assign({
              layers: ({ event }) => event.layers,
              panel: ({ event }) => event.panel,
            }),
          },
        ],
      },
      initial: 'idle',
      states: {
        idle: {},
        // reentrada tras SET_SCOPE: recarga solo si algo sigue activo
        deciding: {
          always: [
            {
              guard: ({ context }) =>
                needsPhenomena(context.layers, context.panel) || context.panel === 'vwp',
              target: 'loading',
            },
            { target: 'idle' },
          ],
        },
        loading: {
          invoke: {
            src: 'fetchTimes',
            input: ({ context }) => ({ site: context.site, day: context.day }),
            onDone: {
              target: 'ready',
              actions: [
                assign({
                  phenTimes: ({ event }) => event.output.phen,
                  vwpTimes: ({ event }) => event.output.vwp,
                  indexError: null,
                }),
                // difunde a 'frame' y 'vwp' con el contexto ya actualizado
                raise({ type: 'INDEX_READY' }),
              ],
            },
            onError: {
              target: 'error',
              actions: assign({ indexError: ({ event }) => errMsg(event.error) }),
            },
          },
        },
        ready: {},
        error: {},
      },
    },

    // fenómenos del frame mostrado: join + fetch con cache por vol_time
    frame: {
      on: {
        SET_SCOPE: { target: '.idle' },
        SET_TIME: [
          {
            guard: ({ context, event }) =>
              event.volTime !== null
              && context.phenTimes !== null
              && needsPhenomena(context.layers, context.panel),
            target: '.join',
            actions: assign({ volTime: ({ event }) => event.volTime }),
          },
          {
            guard: ({ event }) => event.volTime === null,
            target: '.idle',
            actions: assign({ volTime: null, joined: null, phenomena: null }),
          },
          { actions: assign({ volTime: ({ event }) => event.volTime }) },
        ],
        SET_ACTIVE: [
          {
            // guard sobre el payload: el assign de layers/panel corre en 'index'
            guard: ({ context, event }) =>
              needsPhenomena(event.layers, event.panel)
              && context.volTime !== null
              && context.phenTimes !== null,
            target: '.join',
          },
          {
            guard: ({ event }) => !needsPhenomena(event.layers, event.panel),
            target: '.idle',
          },
          // activo pero índice aún sin cargar: 'index' está en loading, INDEX_READY llegará
        ],
        INDEX_READY: {
          guard: ({ context }) =>
            context.volTime !== null && needsPhenomena(context.layers, context.panel),
          target: '.join',
        },
      },
      initial: 'idle',
      states: {
        idle: {},
        // decisión síncrona: casar y resolver desde cache si se puede
        join: {
          entry: assign({
            joined: ({ context }) => nearestWithin(context.phenTimes!, context.volTime!),
            frameError: null,
          }),
          always: [
            {
              guard: ({ context }) => context.joined === null,
              target: 'noData',
              actions: assign({ phenomena: null }),
            },
            {
              guard: ({ context }) => context.phenCache[context.joined!] !== undefined,
              target: 'resolved',
              actions: assign({ phenomena: ({ context }) => context.phenCache[context.joined!]! }),
            },
            { target: 'fetching' },
          ],
        },
        fetching: {
          invoke: {
            src: 'fetchPhenomena',
            input: ({ context }) => ({ site: context.site, volTime: context.joined! }),
            onDone: {
              target: 'resolved',
              actions: assign({
                phenomena: ({ event }) => event.output,
                phenCache: ({ context, event }) => ({
                  ...context.phenCache,
                  [context.joined!]: event.output,
                }),
              }),
            },
            onError: {
              target: 'error',
              actions: assign({ frameError: ({ event }) => errMsg(event.error) }),
            },
          },
        },
        // volumen casado y filas en mano (pueden ser 0: volumen sin celdas)
        resolved: {
          always: [
            { guard: ({ context }) => context.phenomena!.length > 0, target: 'shown' },
            { target: 'noData' },
          ],
        },
        shown: {},
        // distinguible en contexto: joined === null → nada en tolerancia;
        // joined !== null con phenomena [] → volumen sin fenómenos
        noData: {},
        error: {},
      },
    },

    // serie cross-volumen de la celda seleccionada (charts de tendencia)
    series: {
      on: {
        SET_SCOPE: { target: '.idle', actions: assign({ cellId: null }) },
        SELECT_CELL: [
          {
            guard: ({ event }) => event.cellId === null,
            target: '.idle',
            actions: assign({ cellId: null, series: null, seriesError: null }),
          },
          {
            target: '.loading',
            actions: assign({ cellId: ({ event }) => event.cellId, seriesError: null }),
          },
        ],
      },
      initial: 'idle',
      states: {
        idle: {},
        loading: {
          invoke: {
            src: 'fetchSeries',
            input: ({ context }) => ({ site: context.site, cellId: context.cellId! }),
            onDone: {
              target: 'shown',
              actions: assign({ series: ({ event }) => event.output }),
            },
            onError: {
              target: 'error',
              actions: assign({ seriesError: ({ event }) => errMsg(event.error) }),
            },
          },
        },
        shown: {},
        error: {},
      },
    },

    // perfiles VWP del día hasta el frame (grid de barbas), solo con panel abierto
    vwp: {
      on: {
        SET_SCOPE: { target: '.idle' },
        SET_ACTIVE: [
          {
            guard: ({ context, event }) => event.panel === 'vwp' && context.vwpTimes !== null,
            target: '.sync',
          },
          {
            guard: ({ event }) => event.panel !== 'vwp',
            target: '.idle',
          },
          // panel vwp pero índice sin cargar: INDEX_READY llegará
        ],
        INDEX_READY: {
          guard: ({ context }) => context.panel === 'vwp',
          target: '.sync',
        },
        // el assign de volTime corre en 'frame' (región anterior en orden de
        // documento) dentro del mismo micropaso → el entry de sync ya lo lee
        SET_TIME: {
          guard: ({ context }) => context.panel === 'vwp' && context.vwpTimes !== null,
          target: '.sync',
        },
      },
      initial: 'idle',
      states: {
        idle: {},
        sync: {
          entry: assign({
            vwpWindow: ({ context }) =>
              windowUpTo(context.vwpTimes ?? [], context.volTime, VWP_WINDOW),
            vwpJoined: ({ context }) =>
              context.volTime === null || context.vwpTimes === null
                ? null
                : nearestWithin(context.vwpTimes, context.volTime),
            vwpError: null,
          }),
          always: [
            { guard: ({ context }) => context.vwpWindow.length === 0, target: 'empty' },
            {
              guard: ({ context }) =>
                context.vwpWindow.every(t => context.vwpProfiles[t] !== undefined),
              target: 'shown',
            },
            { target: 'loading' },
          ],
        },
        loading: {
          invoke: {
            src: 'fetchVwp',
            input: ({ context }) => ({
              site: context.site,
              volTimes: context.vwpWindow.filter(t => context.vwpProfiles[t] === undefined),
            }),
            onDone: {
              target: 'shown',
              actions: assign({
                vwpProfiles: ({ context, event }) => ({ ...context.vwpProfiles, ...event.output }),
              }),
            },
            onError: {
              target: 'error',
              actions: assign({ vwpError: ({ event }) => errMsg(event.error) }),
            },
          },
        },
        shown: {},
        empty: {},
        error: {},
      },
    },

    // grillas de viento GFS (capa de partículas): índice propio
    // (/api/wind/times, día ±2 h) + join con tolerancia de 1 h + fetch del
    // JSON u/v directo de R2 con cache por r2_key (D24: fuera de tolerancia
    // la capa se limpia, nunca viento de otro momento como actual)
    wind: {
      on: {
        SET_SCOPE: { target: '.deciding' },
        SET_ACTIVE: [
          {
            // guard sobre el payload; context.layers aún es el snapshot previo.
            // off→on estricto: un SET_ACTIVE con viento ya activo no debe
            // reentrar loadingIndex (cancelaría el fetch en vuelo)
            guard: ({ context, event }) =>
              event.layers.includes('wind')
              && !context.layers.includes('wind')
              && context.windTimes === null,
            target: '.loadingIndex',
          },
          {
            // reactivación con índice ya cargado (toggle off→on, cache viva)
            guard: ({ context, event }) =>
              event.layers.includes('wind') && !context.layers.includes('wind'),
            target: '.join',
          },
          {
            guard: ({ event }) => !event.layers.includes('wind'),
            target: '.idle',
            actions: assign({ windJoined: null, windGrid: null }),
          },
        ],
        // el assign de volTime corre en 'frame' (anterior en orden de
        // documento) en el mismo micropaso → el entry de join ya lo lee
        SET_TIME: [
          {
            guard: ({ context, event }) =>
              event.volTime !== null
              && context.layers.includes('wind')
              && context.windTimes !== null,
            target: '.join',
          },
          {
            guard: ({ event }) => event.volTime === null,
            target: '.idle',
            actions: assign({ windJoined: null, windGrid: null }),
          },
        ],
      },
      initial: 'idle',
      states: {
        idle: {},
        // reentrada tras SET_SCOPE (windTimes ya limpiado por 'index'):
        // recarga solo si la capa sigue activa
        deciding: {
          always: [
            { guard: ({ context }) => context.layers.includes('wind'), target: 'loadingIndex' },
            { target: 'idle' },
          ],
        },
        loadingIndex: {
          invoke: {
            src: 'fetchWindTimes',
            input: ({ context }) => ({ site: context.site, day: context.day }),
            onDone: {
              target: 'join',
              actions: assign({
                windTimes: ({ event }) => event.output,
                windError: null,
              }),
            },
            onError: {
              target: 'error',
              actions: assign({ windError: ({ event }) => errMsg(event.error) }),
            },
          },
        },
        // decisión síncrona: casar y resolver desde cache si se puede
        join: {
          entry: assign({
            windJoined: ({ context }) =>
              context.volTime === null || context.windTimes === null
                ? null
                : nearestWithin(
                    context.windTimes.map(w => w.valid_time),
                    context.volTime,
                    WIND_JOIN_TOLERANCE_S,
                  ),
            windError: null,
          }),
          always: [
            {
              guard: ({ context }) => context.windJoined === null,
              target: 'noData',
              actions: assign({ windGrid: null }),
            },
            {
              guard: ({ context }) => {
                const meta = joinedWindMeta(context)
                return meta !== null && context.windCache[meta.r2_key] !== undefined
              },
              target: 'shown',
              actions: assign({
                windGrid: ({ context }) => context.windCache[joinedWindMeta(context)!.r2_key]!,
              }),
            },
            { target: 'fetching' },
          ],
        },
        fetching: {
          invoke: {
            src: 'fetchWindGrid',
            input: ({ context }) => ({ meta: joinedWindMeta(context)! }),
            onDone: {
              target: 'shown',
              actions: assign({
                windGrid: ({ event }) => event.output,
                windCache: ({ context, event }) => ({
                  ...context.windCache,
                  [joinedWindMeta(context)!.r2_key]: event.output,
                }),
              }),
            },
            onError: {
              target: 'error',
              actions: assign({ windError: ({ event }) => errMsg(event.error) }),
            },
          },
        },
        shown: {},
        // windJoined === null: nada a ≤1 h del frame (índice vacío incluido)
        noData: {},
        error: {},
      },
    },
  },
})
