// viewerMachine pura: navegación y fetch inyectados como mocks — sin router
// ni red (decisión 18). Regiones paralelas 'raster' y 'timeline'; el
// diagrama vive en docs/maquinas-estado.md.
import type { RasterMeta } from '#shared/contract'
import { describe, expect, it, vi } from 'vitest'
import { createActor, fromPromise, waitFor } from 'xstate'
import type { ViewerInput, ViewerRouteState } from '../../machines/viewer'
import { viewerMachine } from '../../machines/viewer'

const T0 = '2026-07-11T03:16:49'
const T1 = '2026-07-11T03:11:52'
const DAY = '2026-07-11'
const NOW_T = '2026-07-11T04:00:00'

function meta(volTime: string): RasterMeta {
  return {
    site_id: 'AMX',
    product_code: 153,
    vol_time: volTime,
    r2_key: `AMX/153/${volTime}.tif`,
    cog_url: null,
    value_scale: 0.5,
    value_offset: -33,
    max_level: 255,
    width: 920,
    height: 920,
    cell_m: 1000,
    el_angle: 0.5,
    vcp: 212,
  }
}

const routeAt = (patch: Partial<ViewerRouteState> = {}): ViewerRouteState => ({
  site: 'AMX',
  product: 153,
  time: T0,
  opacity: 0.8,
  base: 'osm',
  layers: [],
  panel: null,
  cell: null,
  ...patch,
})

function boot(opts: {
  route?: Partial<ViewerRouteState>
  initialRaster?: RasterMeta | null
  initialError?: string | null
  initialTimes?: RasterMeta[]
  initialTimelineError?: string | null
  fetch?: (input: { site: string, product: number, t: string }) => Promise<RasterMeta | null>
  fetchDay?: (input: { site: string, product: number, day: string }) => Promise<RasterMeta[]>
  fetchStep?: (
    input: { site: string, product: number, t: string, mode: 'next' | 'prev' }
  ) => Promise<RasterMeta | null>
} = {}) {
  const navigate = vi.fn()
  const persistPrefs = vi.fn()
  const syncQuery = vi.fn()
  const syncOverlayQuery = vi.fn()
  const fetch = vi.fn(opts.fetch ?? (async () => null))
  const fetchDay = vi.fn(opts.fetchDay ?? (async () => []))
  const fetchStep = vi.fn(opts.fetchStep ?? (async () => null))
  const input: ViewerInput = {
    radars: [],
    products: [],
    route: routeAt(opts.route),
    nowT: NOW_T,
    initialRaster: opts.initialRaster ?? null,
    initialError: opts.initialError ?? null,
    initialTimes: opts.initialTimes ?? [],
    initialTimelineError: opts.initialTimelineError ?? null,
  }
  const actor = createActor(
    viewerMachine.provide({
      actors: {
        fetchClosest: fromPromise(({ input: i }) => fetch(i)),
        fetchDay: fromPromise(({ input: i }) => fetchDay(i)),
        fetchStep: fromPromise(({ input: i }) => fetchStep(i)),
      },
      actions: {
        navigate: (_, params) => navigate(params),
        persistPrefs: (_, params) => persistPrefs(params),
        syncQuery: (_, params) => syncQuery(params),
        syncOverlayQuery: (_, params) => syncOverlayQuery(params),
      },
    }),
    { input },
  )
  actor.start()
  return { actor, navigate, fetch, fetchDay, fetchStep, persistPrefs, syncQuery, syncOverlayQuery }
}

describe('viewerMachine — región raster: estado inicial (SSR)', () => {
  it('arranca en shown con el raster del closest SSR', () => {
    const { actor } = boot({ initialRaster: meta(T0) })
    expect(actor.getSnapshot().matches({ raster: 'shown' })).toBe(true)
    expect(actor.getSnapshot().context.raster?.vol_time).toBe(T0)
  })

  it('arranca en empty con closest 404', () => {
    const { actor } = boot({ initialRaster: null })
    expect(actor.getSnapshot().matches({ raster: 'empty' })).toBe(true)
  })

  it('arranca en error con fallo del closest SSR', () => {
    const { actor } = boot({ initialError: 'D1 no disponible' })
    expect(actor.getSnapshot().matches({ raster: 'error' })).toBe(true)
    expect(actor.getSnapshot().context.rasterError).toBe('D1 no disponible')
  })
})

describe('viewerMachine — vista live', () => {
  it('MOUNTED materializa el vol_time resuelto con replace', () => {
    const { actor, navigate } = boot({ route: { time: null }, initialRaster: meta(T0) })
    actor.send({ type: 'MOUNTED' })
    expect(navigate).toHaveBeenCalledWith({ patch: { time: T0 }, mode: 'replace' })
  })

  it('MOUNTED con time explícito no navega', () => {
    const { actor, navigate } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'MOUNTED' })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('un fetch live resuelto también materializa el time', async () => {
    const { actor, navigate } = boot({
      route: { time: T0 },
      initialRaster: meta(T0),
      fetch: async () => meta(T1),
    })
    // back del navegador a la URL live: refetch con nowT y replace al resolver
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: null }) })
    await waitFor(actor, s => s.matches({ raster: 'shown' }))
    expect(navigate).toHaveBeenCalledWith({ patch: { time: T1 }, mode: 'replace' })
  })
})

describe('viewerMachine — región raster: ROUTE_CHANGED', () => {
  it('sameFrame (materialización del time) no refetchea ni cambia de estado', () => {
    const { actor, fetch } = boot({ route: { time: null }, initialRaster: meta(T0) })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: T0 }) })
    expect(fetch).not.toHaveBeenCalled()
    expect(actor.getSnapshot().matches({ raster: 'shown' })).toBe(true)
    expect(actor.getSnapshot().context.time).toBe(T0)
  })

  it('cambio solo de query (opacity/base) no refetchea', () => {
    const { actor, fetch } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ opacity: 0.3, base: 'off' }) })
    expect(fetch).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.opacity).toBe(0.3)
    expect(actor.getSnapshot().context.base).toBe('off')
  })

  it('cambio de producto refetchea y muestra el nuevo raster', async () => {
    const { actor, fetch } = boot({
      initialRaster: meta(T0),
      fetch: async () => meta(T1),
    })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ product: 154 }) })
    expect(actor.getSnapshot().matches({ raster: 'loading' })).toBe(true)
    await waitFor(actor, s => s.matches({ raster: 'shown' }))
    expect(fetch).toHaveBeenCalledWith({ site: 'AMX', product: 154, t: T0 })
    expect(actor.getSnapshot().context.raster?.vol_time).toBe(T1)
  })

  it('closest 404 degrada a empty', async () => {
    const { actor } = boot({ initialRaster: meta(T0), fetch: async () => null })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ site: 'ICT' }) })
    await waitFor(actor, s => s.matches({ raster: 'empty' }))
    expect(actor.getSnapshot().context.raster).toBeNull()
  })

  it('fallo de fetch degrada a error con mensaje', async () => {
    const { actor } = boot({
      initialRaster: meta(T0),
      fetch: async () => {
        throw new Error('boom')
      },
    })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ product: 154 }) })
    await waitFor(actor, s => s.matches({ raster: 'error' }))
    expect(actor.getSnapshot().context.rasterError).toBe('boom')
  })
})

describe('viewerMachine — región timeline: estado inicial (SSR)', () => {
  it('arranca en ready con los times del día SSR', () => {
    const { actor } = boot({ initialTimes: [meta(T1), meta(T0)] })
    expect(actor.getSnapshot().matches({ timeline: 'ready' })).toBe(true)
    expect(actor.getSnapshot().context.times).toHaveLength(2)
    expect(actor.getSnapshot().context.day).toBe(DAY)
  })

  it('arranca en empty sin times', () => {
    const { actor } = boot({ initialTimes: [] })
    expect(actor.getSnapshot().matches({ timeline: 'empty' })).toBe(true)
  })

  it('arranca en error con fallo del /api/rasters/day en SSR', () => {
    const { actor } = boot({ initialTimelineError: 'D1 no disponible' })
    expect(actor.getSnapshot().matches({ timeline: 'error' })).toBe(true)
  })
})

describe('viewerMachine — región timeline: ROUTE_CHANGED', () => {
  it('mismo día (stepping dentro del día) no refetchea', () => {
    const { actor, fetchDay } = boot({ initialTimes: [meta(T0)] })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: T1 }) })
    expect(fetchDay).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.day).toBe(DAY)
  })

  it('cambiar de site refetchea aunque el día no cambie', async () => {
    const { actor, fetchDay } = boot({
      initialTimes: [meta(T0)],
      fetchDay: async () => [meta(T1)],
    })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ site: 'JUA' }) })
    expect(actor.getSnapshot().matches({ timeline: 'loading' })).toBe(true)
    await waitFor(actor, s => s.matches({ timeline: 'ready' }))
    expect(fetchDay).toHaveBeenCalledWith({ site: 'JUA', product: 153, day: DAY })
  })

  it('cambiar a un día distinto refetchea y puede degradar a empty', async () => {
    const { actor, fetchDay } = boot({
      initialTimes: [meta(T0)],
      fetchDay: async () => [],
    })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: '2026-07-12T00:00:00' }) })
    await waitFor(actor, s => s.matches({ timeline: 'empty' }))
    expect(fetchDay).toHaveBeenCalledWith({ site: 'AMX', product: 153, day: '2026-07-12' })
    expect(actor.getSnapshot().context.times).toEqual([])
  })
})

describe('viewerMachine — SELECT_DAY', () => {
  it('salta al último frame del día elegido (push)', async () => {
    const { actor, navigate, fetchDay } = boot({
      initialTimes: [meta(T0)],
      fetchDay: async () => [meta(T1), meta(T0)],
    })
    actor.send({ type: 'SELECT_DAY', day: '2026-07-10' })
    expect(actor.getSnapshot().matches({ timeline: 'jumping' })).toBe(true)
    await waitFor(actor, s => s.matches({ timeline: 'ready' }))
    expect(fetchDay).toHaveBeenCalledWith({ site: 'AMX', product: 153, day: '2026-07-10' })
    expect(navigate).toHaveBeenCalledWith({ patch: { time: T0 }, mode: 'push' })
  })

  it('día sin datos: no navega (nada a lo que saltar), queda empty', async () => {
    const { actor, navigate } = boot({
      initialTimes: [meta(T0)],
      fetchDay: async () => [],
    })
    actor.send({ type: 'SELECT_DAY', day: '2026-07-09' })
    await waitFor(actor, s => s.matches({ timeline: 'empty' }))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('seleccionar el día ya activo no refetchea', () => {
    const { actor, fetchDay } = boot({ initialTimes: [meta(T0)] })
    actor.send({ type: 'SELECT_DAY', day: DAY })
    expect(fetchDay).not.toHaveBeenCalled()
  })
})

describe('viewerMachine — SELECT_TIME', () => {
  it('navega con replace al time del tick clicado', () => {
    const { actor, navigate } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SELECT_TIME', time: T1 })
    expect(navigate).toHaveBeenCalledWith({ patch: { time: T1 }, mode: 'replace' })
  })
})

describe('viewerMachine — STEP', () => {
  const T2 = '2026-07-11T03:20:00'
  const TIMES = [meta(T1), meta(T0), meta(T2)] // ascendente: T1 < T0 < T2

  it('vecino local: navega con replace, sin llamar a la API', () => {
    const { actor, navigate, fetchStep } = boot({
      route: { time: T1 },
      initialRaster: meta(T1),
      initialTimes: TIMES,
    })
    actor.send({ type: 'STEP', dir: 1 })
    expect(navigate).toHaveBeenCalledWith({ patch: { time: T0 }, mode: 'replace' })
    expect(fetchStep).not.toHaveBeenCalled()
  })

  it('extremo de la serie: llama a la API y navega si resuelve', async () => {
    const jump = meta('2026-07-12T00:05:00')
    const { actor, navigate, fetchStep } = boot({
      route: { time: T2 },
      initialRaster: meta(T2),
      initialTimes: TIMES,
      fetchStep: async () => jump,
    })
    actor.send({ type: 'STEP', dir: 1 })
    expect(actor.getSnapshot().matches({ raster: 'steppingNext' })).toBe(true)
    await waitFor(actor, s => s.matches({ raster: 'shown' }))
    expect(fetchStep).toHaveBeenCalledWith({ site: 'AMX', product: 153, t: T2, mode: 'next' })
    expect(navigate).toHaveBeenCalledWith({ patch: { time: jump.vol_time }, mode: 'replace' })
    expect(actor.getSnapshot().context.raster?.vol_time).toBe(jump.vol_time)
  })

  it('extremo real (404): deshabilita esa dirección, se queda en el frame actual', async () => {
    const { actor, navigate } = boot({
      route: { time: T2 },
      initialRaster: meta(T2),
      initialTimes: TIMES,
      fetchStep: async () => null,
    })
    actor.send({ type: 'STEP', dir: 1 })
    await waitFor(actor, s => s.matches({ raster: 'shown' }))
    expect(navigate).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.atEnd).toBe(true)
    expect(actor.getSnapshot().context.raster?.vol_time).toBe(T2)
  })

  it('extremo ya confirmado: no repite la llamada a la API', async () => {
    const { actor, fetchStep } = boot({
      route: { time: T2 },
      initialRaster: meta(T2),
      initialTimes: TIMES,
      fetchStep: async () => null,
    })
    actor.send({ type: 'STEP', dir: 1 })
    await waitFor(actor, s => s.matches({ raster: 'shown' }))
    expect(fetchStep).toHaveBeenCalledTimes(1)
    actor.send({ type: 'STEP', dir: 1 })
    expect(fetchStep).toHaveBeenCalledTimes(1)
  })

  it('prev en el otro extremo: mismo mecanismo con mode "prev"', async () => {
    const { actor, fetchStep } = boot({
      route: { time: T1 },
      initialRaster: meta(T1),
      initialTimes: TIMES,
      fetchStep: async () => null,
    })
    actor.send({ type: 'STEP', dir: -1 })
    await waitFor(actor, s => s.matches({ raster: 'shown' }))
    expect(fetchStep).toHaveBeenCalledWith({ site: 'AMX', product: 153, t: T1, mode: 'prev' })
    expect(actor.getSnapshot().context.atStart).toBe(true)
  })
})

describe('viewerMachine — eventos de UI', () => {
  it('SELECT_SITE / SELECT_PRODUCT navegan con push (URL manda)', () => {
    const { actor, navigate, fetch } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SELECT_SITE', site: 'JUA' })
    actor.send({ type: 'SELECT_PRODUCT', product: 154 })
    expect(navigate).toHaveBeenNthCalledWith(1, { patch: { site: 'JUA' }, mode: 'push' })
    expect(navigate).toHaveBeenNthCalledWith(2, { patch: { product: 154 }, mode: 'push' })
    // la máquina no refetchea hasta que la ruta cambie de verdad
    expect(fetch).not.toHaveBeenCalled()
  })

  it('SET_OPACITY / CURSOR_MOVE / COG_ERROR actualizan contexto', () => {
    const { actor } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SET_OPACITY', value: 0.4 })
    actor.send({ type: 'CURSOR_MOVE', sample: { level: 91, value: 12.5, rangeFolded: false } })
    actor.send({ type: 'COG_ERROR', message: 'no COG' })
    const ctx = actor.getSnapshot().context
    expect(ctx.opacity).toBe(0.4)
    expect(ctx.cursor?.value).toBe(12.5)
    expect(ctx.cogError).toBe('no COG')
  })

  it('SET_OPACITY persiste prefs y sincroniza la query (nunca el time)', () => {
    const { actor, persistPrefs, syncQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SET_OPACITY', value: 0.4 })
    expect(persistPrefs).toHaveBeenCalledWith({
      site: 'AMX',
      product: 153,
      opacity: 0.4,
      base: 'osm',
    })
    expect(syncQuery).toHaveBeenCalledWith({ opacity: 0.4, base: 'osm' })
  })
})

describe('viewerMachine — overlays (D23)', () => {
  it('TOGGLE_LAYER añade y quita la capa con replace de query', () => {
    const { actor, syncOverlayQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'cells' })
    expect(actor.getSnapshot().context.layers).toEqual(['cells'])
    expect(syncOverlayQuery).toHaveBeenLastCalledWith({ layers: ['cells'], panel: null, cell: null })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'meso' })
    expect(actor.getSnapshot().context.layers).toEqual(['cells', 'meso'])
    actor.send({ type: 'TOGGLE_LAYER', layer: 'cells' })
    expect(actor.getSnapshot().context.layers).toEqual(['meso'])
    expect(syncOverlayQuery).toHaveBeenLastCalledWith({ layers: ['meso'], panel: null, cell: null })
  })

  it('SELECT_PANEL abre y cierra el panel', () => {
    const { actor, syncOverlayQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SELECT_PANEL', panel: 'vwp' })
    expect(actor.getSnapshot().context.panel).toBe('vwp')
    actor.send({ type: 'SELECT_PANEL', panel: null })
    expect(actor.getSnapshot().context.panel).toBeNull()
    expect(syncOverlayQuery).toHaveBeenLastCalledWith({ layers: [], panel: null, cell: null })
  })

  it('SELECT_CELL con panel cerrado abre la tendencia; con panel abierto lo respeta', () => {
    const { actor, syncOverlayQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SELECT_CELL', cellId: 'D4' })
    expect(actor.getSnapshot().context.cell).toBe('D4')
    expect(actor.getSnapshot().context.panel).toBe('trend')
    expect(syncOverlayQuery).toHaveBeenLastCalledWith({ layers: [], panel: 'trend', cell: 'D4' })

    actor.send({ type: 'SELECT_PANEL', panel: 'cells' })
    actor.send({ type: 'SELECT_CELL', cellId: 'A1' })
    expect(actor.getSnapshot().context.panel).toBe('cells')
    actor.send({ type: 'SELECT_CELL', cellId: null })
    expect(actor.getSnapshot().context.cell).toBeNull()
    expect(actor.getSnapshot().context.panel).toBe('cells')
  })

  it('el raster no reparpadea al cambiar solo la query de overlays (sameFrame)', () => {
    const { actor, fetch } = boot({ initialRaster: meta(T0) })
    actor.send({
      type: 'ROUTE_CHANGED',
      route: routeAt({ layers: ['cells'], panel: 'cells' }),
    })
    expect(actor.getSnapshot().matches({ raster: 'shown' })).toBe(true)
    expect(actor.getSnapshot().context.layers).toEqual(['cells'])
    expect(actor.getSnapshot().context.panel).toBe('cells')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('viewerMachine — prefs vía ROUTE_CHANGED', () => {
  it('toda navegación persiste site/product/opacity/base (nunca las prefs de display)', () => {
    const { actor, persistPrefs } = boot({ initialRaster: meta(T0) })
    actor.send({
      type: 'ROUTE_CHANGED',
      route: routeAt({ product: 154, opacity: 0.5, base: 'off' }),
    })
    expect(persistPrefs).toHaveBeenCalledWith({
      site: 'AMX',
      product: 154,
      opacity: 0.5,
      base: 'off',
    })
  })
})

describe('viewerMachine — preferencias de display (D28)', () => {
  it('el contexto inicial usa placeholders SSR deterministas', () => {
    const { actor } = boot({ initialRaster: meta(T0) })
    const ctx = actor.getSnapshot().context
    expect(ctx.coverage).toBe(true)
    expect(ctx.units).toBe('imperial')
    expect(ctx.clock).toBe('utc')
  })

  it('PREFS_LOADED asigna sin persistir (write-on-read prohibido)', () => {
    const { actor, persistPrefs } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'PREFS_LOADED', prefs: { coverage: false, units: 'si', clock: 'local' } })
    const ctx = actor.getSnapshot().context
    expect(ctx.coverage).toBe(false)
    expect(ctx.units).toBe('si')
    expect(ctx.clock).toBe('local')
    expect(persistPrefs).not.toHaveBeenCalled()
  })

  it('SET_PREF asigna y persiste exactamente el patch', () => {
    const { actor, persistPrefs } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SET_PREF', patch: { units: 'si' } })
    expect(actor.getSnapshot().context.units).toBe('si')
    expect(actor.getSnapshot().context.coverage).toBe(true) // el resto intacto
    expect(persistPrefs).toHaveBeenCalledWith({ units: 'si' })
  })

  it('canario ensombrecido: ambos eventos surten efecto con las dos regiones paralelas activas', () => {
    // en XState v5 un `on` raíz muere si alguna región define el mismo evento;
    // este test detecta si un refactor futuro lo introduce sin querer
    const { actor } = boot({ initialRaster: meta(T0) })
    const snap = actor.getSnapshot()
    expect(Object.keys(snap.value)).toEqual(['raster', 'timeline'])
    actor.send({ type: 'PREFS_LOADED', prefs: { coverage: false, units: 'imperial', clock: 'utc' } })
    expect(actor.getSnapshot().context.coverage).toBe(false)
    actor.send({ type: 'SET_PREF', patch: { coverage: true } })
    expect(actor.getSnapshot().context.coverage).toBe(true)
  })
})
