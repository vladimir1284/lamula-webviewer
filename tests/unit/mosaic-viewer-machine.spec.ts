// mosaicViewerMachine pura (D43/P4) — hermana reducida de viewer-machine.spec.ts:
// mismas regiones 'raster'/'timeline', indexadas por domain/product/slot_time.
import type { MosaicRasterMeta, Phenomenon, WindGridFile } from '#shared/contract'
import { describe, expect, it, vi } from 'vitest'
import { createActor, fromPromise } from 'xstate'
import type { MosaicRouteState, MosaicViewerInput } from '../../machines/mosaic-viewer'
import { mosaicViewerMachine } from '../../machines/mosaic-viewer'
import type { NormalizedStrike } from '../../utils/overlay/lightning-join'

function cell(site: string, cellId: string): Phenomenon {
  return {
    site_id: site,
    product_code: 153,
    vol_time: T0,
    kind: 'storm_cell',
    cell_id: cellId,
    lat: 25,
    lon: -80,
    azimuth_deg: null,
    range_km: null,
    attrs: { dbz_max: 50 },
  }
}

const T0 = '2026-07-11T03:15:00'
const T1 = '2026-07-11T03:10:00'
const T2 = '2026-07-11T03:20:00'
const NOW_T = '2026-07-11T04:00:00'

function meta(slotTime: string): MosaicRasterMeta {
  return {
    domain_id: 'GULF',
    product_code: 153,
    slot_time: slotTime,
    slot_s: 300,
    r2_key: `mosaic/GULF/153/${slotTime}.tif`,
    cog_url: null,
    value_scale: 0.5,
    value_offset: -33,
    max_level: 255,
    proj4: '+proj=aeqd +lat_0=25 +lon_0=-80',
    width: 1000,
    height: 1000,
    cell_m: 1000,
    method: 'weighted',
    contributing: [{ site: 'AMX', vol_time: slotTime, lag_s: 0 }],
  }
}

const routeAt = (patch: Partial<MosaicRouteState> = {}): MosaicRouteState => ({
  domain: 'GULF',
  product: 153,
  time: T0,
  opacity: 0.8,
  base: 'osm',
  coverage: true,
  cell: null,
  layers: [],
  sat: false,
  satVariant: 'ir',
  satOpacity: 0.6,
  windLevel: '10m',
  ...patch,
})

function boot(opts: {
  route?: Partial<MosaicRouteState>
  initialRaster?: MosaicRasterMeta | null
  initialError?: string | null
  initialTimes?: MosaicRasterMeta[]
  initialTimelineError?: string | null
  fetch?: (input: { domain: string, product: number, t: string }) => Promise<MosaicRasterMeta | null>
  fetchDay?: (input: { domain: string, product: number, day: string }) => Promise<MosaicRasterMeta[]>
  fetchStep?: (
    input: { domain: string, product: number, t: string, mode: 'next' | 'prev' }
  ) => Promise<MosaicRasterMeta | null>
  fetchCells?: (input: { domain: string, t: string }) => Promise<Phenomenon[]>
  fetchWind?: (input: { domain: string, t: string, level: string }) => Promise<WindGridFile | null>
  fetchLightning?: (
    input: { domain: string, t: string, prevT: string | null }
  ) => Promise<NormalizedStrike[] | null>
} = {}) {
  const navigate = vi.fn()
  const syncQuery = vi.fn()
  const syncCellQuery = vi.fn()
  const syncLayersQuery = vi.fn()
  const persistPrefs = vi.fn()
  const fetch = vi.fn(opts.fetch ?? (async () => null))
  const fetchDay = vi.fn(opts.fetchDay ?? (async () => []))
  const fetchStep = vi.fn(opts.fetchStep ?? (async () => null))
  const fetchCells = vi.fn(opts.fetchCells ?? (async () => []))
  const fetchWind = vi.fn(opts.fetchWind ?? (async () => null))
  const fetchLightning = vi.fn(opts.fetchLightning ?? (async () => []))
  const input: MosaicViewerInput = {
    route: routeAt(opts.route),
    nowT: NOW_T,
    initialRaster: opts.initialRaster ?? null,
    initialError: opts.initialError ?? null,
    initialTimes: opts.initialTimes ?? [],
    initialTimelineError: opts.initialTimelineError ?? null,
  }
  const actor = createActor(
    mosaicViewerMachine.provide({
      actors: {
        fetchClosest: fromPromise(({ input: i }) => fetch(i)),
        fetchDay: fromPromise(({ input: i }) => fetchDay(i)),
        fetchStep: fromPromise(({ input: i }) => fetchStep(i)),
        fetchCells: fromPromise(({ input: i }) => fetchCells(i)),
        fetchWind: fromPromise(({ input: i }) => fetchWind(i)),
        fetchLightning: fromPromise(({ input: i }) => fetchLightning(i)),
      },
      actions: {
        navigate: (_, params) => navigate(params),
        syncQuery: (_, params) => syncQuery(params),
        syncCellQuery: (_, params) => syncCellQuery(params),
        syncLayersQuery: (_, params) => syncLayersQuery(params),
        persistPrefs: (_, params) => persistPrefs(params),
      },
    }),
    { input },
  )
  actor.start()
  return {
    actor,
    navigate,
    fetch,
    fetchDay,
    fetchStep,
    fetchCells,
    fetchWind,
    fetchLightning,
    syncQuery,
    syncCellQuery,
    syncLayersQuery,
    persistPrefs,
  }
}

describe('mosaicViewerMachine — región raster: estado inicial (SSR)', () => {
  it('arranca en shown con el mosaico del closest SSR', () => {
    const { actor } = boot({ initialRaster: meta(T0) })
    expect(actor.getSnapshot().matches({ raster: 'shown' })).toBe(true)
    expect(actor.getSnapshot().context.raster?.slot_time).toBe(T0)
  })

  it('arranca en empty con closest 404', () => {
    const { actor } = boot({ initialRaster: null })
    expect(actor.getSnapshot().matches({ raster: 'empty' })).toBe(true)
  })

  it('arranca en error con fallo del closest SSR', () => {
    const { actor } = boot({ initialError: 'pg no disponible' })
    expect(actor.getSnapshot().matches({ raster: 'error' })).toBe(true)
    expect(actor.getSnapshot().context.rasterError).toBe('pg no disponible')
  })
})

describe('mosaicViewerMachine — vista live', () => {
  it('MOUNTED materializa el slot_time resuelto con replace', () => {
    const { actor, navigate } = boot({ route: { time: null }, initialRaster: meta(T0) })
    actor.send({ type: 'MOUNTED' })
    expect(navigate).toHaveBeenCalledWith({ patch: { time: T0 }, mode: 'replace' })
  })

  it('MOUNTED con time explícito no navega', () => {
    const { actor, navigate } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'MOUNTED' })
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('mosaicViewerMachine — sameFrame evita refetch', () => {
  it('ROUTE_CHANGED al mismo domain/product/slot_time no dispara fetchClosest', () => {
    const { actor, fetch } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ opacity: 0.5 }) })
    expect(fetch).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.opacity).toBe(0.5)
  })

  it('ROUTE_CHANGED a un slot_time ya cacheado en times resuelve localmente, sin fetch', () => {
    const { actor, fetch } = boot({ initialRaster: meta(T0), initialTimes: [meta(T1), meta(T0), meta(T2)] })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: T2 }) })
    expect(fetch).not.toHaveBeenCalled()
    expect(actor.getSnapshot().matches({ raster: 'shown' })).toBe(true)
    expect(actor.getSnapshot().context.raster?.slot_time).toBe(T2)
  })

  it('ROUTE_CHANGED a un domain distinto SÍ dispara fetchClosest', async () => {
    const { actor, fetch } = boot({ initialRaster: meta(T0), fetch: async () => meta(T1) })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ domain: 'OTRO', time: T1 }) })
    expect(actor.getSnapshot().matches({ raster: 'loading' })).toBe(true)
    expect(fetch).toHaveBeenCalledWith({ domain: 'OTRO', product: 153, t: T1 })
  })
})

describe('mosaicViewerMachine — stepping', () => {
  it('STEP local navega al vecino en times sin roundtrip', () => {
    const { actor, navigate, fetchStep } = boot({
      initialRaster: meta(T0),
      initialTimes: [meta(T1), meta(T0), meta(T2)],
    })
    actor.send({ type: 'STEP', dir: 1 })
    expect(fetchStep).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith({ patch: { time: T2 }, mode: 'replace' })
  })

  it('STEP en el extremo cruza de día vía fetchStep', async () => {
    const { actor, fetchStep } = boot({
      route: { time: T2 },
      initialRaster: meta(T2),
      initialTimes: [meta(T1), meta(T0), meta(T2)],
      fetchStep: async () => null,
    })
    actor.send({ type: 'STEP', dir: 1 })
    expect(actor.getSnapshot().matches({ raster: 'steppingNext' })).toBe(true)
    expect(fetchStep).toHaveBeenCalledWith({ domain: 'GULF', product: 153, t: T2, mode: 'next' })
  })
})

describe('mosaicViewerMachine — timeline', () => {
  it('sameDay evita refetch de /api/mosaic/rasters/day', () => {
    const { actor, fetchDay } = boot({ initialTimes: [meta(T0)] })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ opacity: 0.6 }) })
    expect(fetchDay).not.toHaveBeenCalled()
  })

  it('SELECT_DAY distinto salta al último frame del día elegido', async () => {
    const { actor, navigate } = boot({
      initialTimes: [meta(T0)],
      fetchDay: async () => [meta(T1), meta(T2)],
    })
    actor.send({ type: 'SELECT_DAY', day: '2026-07-12' })
    expect(actor.getSnapshot().matches({ timeline: 'jumping' })).toBe(true)
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ patch: { time: T2 }, mode: 'push' }))
  })
})

describe('mosaicViewerMachine — display prefs', () => {
  it('TOGGLE_COVERAGE invierte el flag y sincroniza la query', () => {
    const { actor, syncQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'TOGGLE_COVERAGE' })
    expect(actor.getSnapshot().context.coverage).toBe(false)
    expect(syncQuery).toHaveBeenCalledWith({
      opacity: 0.8,
      base: 'osm',
      coverage: false,
      sat: false,
      satVariant: 'ir',
      satOpacity: 0.6,
    })
  })

  it('SET_OPACITY asigna y sincroniza', () => {
    const { actor, syncQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SET_OPACITY', value: 0.3 })
    expect(actor.getSnapshot().context.opacity).toBe(0.3)
    expect(syncQuery).toHaveBeenCalledWith({
      opacity: 0.3,
      base: 'osm',
      coverage: true,
      sat: false,
      satVariant: 'ir',
      satOpacity: 0.6,
    })
  })
})

describe('mosaicViewerMachine — región cells (P5/D45)', () => {
  it('arranca en idle, sin fetch antes de OVERLAY_INIT (nunca en SSR)', () => {
    const { actor, fetchCells } = boot({ initialRaster: meta(T0), route: { layers: ['cells'] } })
    expect(actor.getSnapshot().matches({ cells: 'idle' })).toBe(true)
    expect(fetchCells).not.toHaveBeenCalled()
  })

  it('OVERLAY_INIT dispara fetchCells con domain+time y resuelve a ready', async () => {
    const { actor, fetchCells } = boot({
      initialRaster: meta(T0),
      route: { layers: ['cells'] },
      fetchCells: async () => [cell('AMX', 'A0'), cell('BYX', 'A0')],
    })
    actor.send({ type: 'OVERLAY_INIT' })
    expect(actor.getSnapshot().matches({ cells: 'loading' })).toBe(true)
    expect(fetchCells).toHaveBeenCalledWith({ domain: 'GULF', t: T0 })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    expect(actor.getSnapshot().context.cells).toHaveLength(2)
  })

  it('OVERLAY_INIT repetido no vuelve a disparar fetch (cellsKey ya resuelto)', async () => {
    const { actor, fetchCells } = boot({ initialRaster: meta(T0), route: { layers: ['cells'] } })
    actor.send({ type: 'OVERLAY_INIT' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    actor.send({ type: 'OVERLAY_INIT' })
    expect(fetchCells).toHaveBeenCalledTimes(1)
  })

  it('ROUTE_CHANGED con mismo slot_time no refetchea celdas', async () => {
    const { actor, fetchCells } = boot({ initialRaster: meta(T0), route: { layers: ['cells'] } })
    actor.send({ type: 'OVERLAY_INIT' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ opacity: 0.5, layers: ['cells'] }) })
    expect(fetchCells).toHaveBeenCalledTimes(1)
  })

  it('ROUTE_CHANGED a otro slot_time SÍ refetchea celdas', async () => {
    const { actor, fetchCells } = boot({
      initialRaster: meta(T0),
      route: { layers: ['cells'] },
      initialTimes: [meta(T1), meta(T0), meta(T2)],
    })
    actor.send({ type: 'OVERLAY_INIT' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: T2, layers: ['cells'] }) })
    expect(actor.getSnapshot().matches({ cells: 'loading' })).toBe(true)
    await vi.waitFor(() => expect(fetchCells).toHaveBeenCalledTimes(2))
    expect(fetchCells).toHaveBeenLastCalledWith({ domain: 'GULF', t: T2 })
  })

  it('SELECT_CELL asigna selectedCell y sincroniza la query de inmediato', () => {
    const { actor, syncCellQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SELECT_CELL', cellId: 'AMX:A0' })
    expect(actor.getSnapshot().context.selectedCell).toBe('AMX:A0')
    expect(syncCellQuery).toHaveBeenCalledWith({ cellId: 'AMX:A0' })
  })

  it('SELECT_CELL con null deselecciona', () => {
    const { actor, syncCellQuery } = boot({ initialRaster: meta(T0), route: { cell: 'AMX:A0' } })
    expect(actor.getSnapshot().context.selectedCell).toBe('AMX:A0')
    actor.send({ type: 'SELECT_CELL', cellId: null })
    expect(actor.getSnapshot().context.selectedCell).toBeNull()
    expect(syncCellQuery).toHaveBeenCalledWith({ cellId: null })
  })

  it('ROUTE_CHANGED trae selectedCell desde la URL (atrás/adelante del navegador)', () => {
    const { actor } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ cell: 'BYX:C3' }) })
    expect(actor.getSnapshot().context.selectedCell).toBe('BYX:C3')
  })
})

describe('mosaicViewerMachine — capa de celdas on/off (paridad con el viewer de un solo radar)', () => {
  it('capa apagada (default): OVERLAY_INIT no dispara fetch', () => {
    const { actor, fetchCells } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'OVERLAY_INIT' })
    expect(actor.getSnapshot().matches({ cells: 'idle' })).toBe(true)
    expect(fetchCells).not.toHaveBeenCalled()
  })

  it('TOGGLE_LAYER enciende, sincroniza la query y carga las celdas', async () => {
    const { actor, fetchCells, syncLayersQuery } = boot({
      initialRaster: meta(T0),
      fetchCells: async () => [cell('AMX', 'A0')],
    })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'cells' })
    expect(actor.getSnapshot().context.layers).toEqual(['cells'])
    expect(syncLayersQuery).toHaveBeenCalledWith({ layers: ['cells'], windLevel: '10m' })
    expect(actor.getSnapshot().matches({ cells: 'loading' })).toBe(true)
    await vi.waitFor(() => expect(fetchCells).toHaveBeenCalledTimes(1))
  })

  it('apagar y reencender en el mismo slot no refetchea', async () => {
    const { actor, fetchCells, syncLayersQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'cells' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    actor.send({ type: 'TOGGLE_LAYER', layer: 'cells' })
    expect(actor.getSnapshot().context.layers).toEqual([])
    expect(syncLayersQuery).toHaveBeenLastCalledWith({ layers: [], windLevel: '10m' })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'cells' })
    expect(fetchCells).toHaveBeenCalledTimes(1)
  })

  it('con la capa apagada, cambiar de slot no refetchea celdas', async () => {
    const { actor, fetchCells } = boot({
      initialRaster: meta(T0),
      route: { layers: ['cells'] },
      initialTimes: [meta(T1), meta(T0), meta(T2)],
    })
    actor.send({ type: 'OVERLAY_INIT' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    actor.send({ type: 'TOGGLE_LAYER', layer: 'cells' })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: T2, layers: [] }) })
    expect(fetchCells).toHaveBeenCalledTimes(1)
  })
})

describe('mosaicViewerMachine — prefs de display', () => {
  it('PREFS_LOADED asigna sin persistir', () => {
    const { actor, persistPrefs } = boot({ initialRaster: meta(T0) })
    actor.send({
      type: 'PREFS_LOADED',
      prefs: { units: 'si', clock: 'local', animationFrames: 20, showPalette: false },
    })
    expect(actor.getSnapshot().context.units).toBe('si')
    expect(actor.getSnapshot().context.clock).toBe('local')
    expect(actor.getSnapshot().context.animationFrames).toBe(20)
    expect(persistPrefs).not.toHaveBeenCalled()
  })

  it('SET_PREF asigna y persiste el patch exacto', () => {
    const { actor, persistPrefs } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SET_PREF', patch: { clock: 'local' } })
    expect(actor.getSnapshot().context.clock).toBe('local')
    expect(persistPrefs).toHaveBeenCalledWith({ clock: 'local' })
  })
})

describe('mosaicViewerMachine — capas de viento y rayos (D49)', () => {
  const grid: WindGridFile = {
    header: { nx: 2, ny: 2, lo1: -82, la1: 26, dx: 0.25, dy: 0.25, refTime: '2026-07-11T00:00:00Z', forecastHour: 3 },
    u: [1, 1, 1, 1],
    v: [0, 0, 0, 0],
  }

  it('viento: apagado no fetchea ni en OVERLAY_INIT', () => {
    const { actor, fetchWind } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'OVERLAY_INIT' })
    expect(fetchWind).not.toHaveBeenCalled()
    expect(actor.getSnapshot().matches({ wind: 'idle' })).toBe(true)
  })

  it('viento: TOGGLE_LAYER carga el grid unido y lo deja en contexto', async () => {
    const { actor, fetchWind } = boot({ initialRaster: meta(T0), fetchWind: async () => grid })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'wind' })
    expect(fetchWind).toHaveBeenCalledWith({ domain: 'GULF', t: T0, level: '10m' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ wind: 'ready' })).toBe(true))
    expect(actor.getSnapshot().context.windGrid).toEqual(grid)
  })

  it('viento: sin grid en tolerancia cae a noData, no a error', async () => {
    const { actor } = boot({ initialRaster: meta(T0), fetchWind: async () => null })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'wind' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ wind: 'noData' })).toBe(true))
    expect(actor.getSnapshot().context.windGrid).toBeNull()
  })

  it('viento: cambiar de nivel con la capa encendida invalida y recarga con el nivel nuevo', async () => {
    const { actor, fetchWind, syncLayersQuery } = boot({ initialRaster: meta(T0), fetchWind: async () => grid })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'wind' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ wind: 'ready' })).toBe(true))
    actor.send({ type: 'SELECT_WIND_LEVEL', level: '850hPa' })
    expect(actor.getSnapshot().context.windLevel).toBe('850hPa')
    expect(syncLayersQuery).toHaveBeenLastCalledWith({ layers: ['wind'], windLevel: '850hPa' })
    await vi.waitFor(() => expect(fetchWind).toHaveBeenCalledTimes(2))
    expect(fetchWind).toHaveBeenLastCalledWith({ domain: 'GULF', t: T0, level: '850hPa' })
  })

  it('viento: el mismo nivel no refetchea', async () => {
    const { actor, fetchWind } = boot({ initialRaster: meta(T0), fetchWind: async () => grid })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'wind' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ wind: 'ready' })).toBe(true))
    actor.send({ type: 'SELECT_WIND_LEVEL', level: '10m' })
    expect(fetchWind).toHaveBeenCalledTimes(1)
  })

  it('viento: cambiar de slot con la capa encendida recarga', async () => {
    const { actor, fetchWind } = boot({
      initialRaster: meta(T0),
      route: { layers: ['wind'] },
      initialTimes: [meta(T1), meta(T0), meta(T2)],
      fetchWind: async () => grid,
    })
    actor.send({ type: 'OVERLAY_INIT' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ wind: 'ready' })).toBe(true))
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: T2, layers: ['wind'] }) })
    await vi.waitFor(() => expect(fetchWind).toHaveBeenCalledTimes(2))
    expect(fetchWind).toHaveBeenLastCalledWith({ domain: 'GULF', t: T2, level: '10m' })
  })

  it('rayos: la ventana usa el slot ANTERIOR del día cargado, no una resta fija', async () => {
    const { actor, fetchLightning } = boot({
      initialRaster: meta(T0),
      initialTimes: [meta(T1), meta(T0), meta(T2)],
      fetchLightning: async () => [{ lon: -80, lat: 25, progress: 0.5 }],
    })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'lightning' })
    expect(fetchLightning).toHaveBeenCalledWith({ domain: 'GULF', t: T0, prevT: T1 })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ lightning: 'ready' })).toBe(true))
    expect(actor.getSnapshot().context.lightningStrikes).toHaveLength(1)
  })

  it('rayos: en el primer slot del día prevT es null (fallback de ventana)', () => {
    const { actor, fetchLightning } = boot({
      initialRaster: meta(T1),
      route: { time: T1 },
      initialTimes: [meta(T1), meta(T0)],
    })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'lightning' })
    expect(fetchLightning).toHaveBeenCalledWith({ domain: 'GULF', t: T1, prevT: null })
    expect(actor.getSnapshot().matches({ lightning: 'loading' })).toBe(true)
  })

  it('rayos: intervalo sin descargas es noData, con la lista vacía en contexto', async () => {
    const { actor } = boot({ initialRaster: meta(T0), fetchLightning: async () => [] })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'lightning' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ lightning: 'noData' })).toBe(true))
    expect(actor.getSnapshot().context.lightningStrikes).toEqual([])
  })

  it('satélite: TOGGLE_SAT/variant/opacidad asignan y sincronizan la query', () => {
    const { actor, syncQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'TOGGLE_SAT' })
    expect(actor.getSnapshot().context.sat).toBe(true)
    actor.send({ type: 'SELECT_SAT_VARIANT', variant: 'vis' })
    actor.send({ type: 'SET_SAT_OPACITY', value: 0.4 })
    expect(actor.getSnapshot().context.satVariant).toBe('vis')
    expect(actor.getSnapshot().context.satOpacity).toBe(0.4)
    expect(syncQuery).toHaveBeenLastCalledWith({
      opacity: 0.8,
      base: 'osm',
      coverage: true,
      sat: true,
      satVariant: 'vis',
      satOpacity: 0.4,
    })
  })

  it('un TOGGLE_LAYER solo dispara el fetch de SU capa', async () => {
    const { actor, fetchWind, fetchCells, fetchLightning } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'TOGGLE_LAYER', layer: 'wind' })
    await vi.waitFor(() => expect(fetchWind).toHaveBeenCalledTimes(1))
    expect(fetchCells).not.toHaveBeenCalled()
    expect(fetchLightning).not.toHaveBeenCalled()
    expect(actor.getSnapshot().context.layers).toEqual(['wind'])
  })
})
