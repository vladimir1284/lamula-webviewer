// mosaicViewerMachine pura (D43/P4) — hermana reducida de viewer-machine.spec.ts:
// mismas regiones 'raster'/'timeline', indexadas por domain/product/slot_time.
import type { MosaicRasterMeta, Phenomenon } from '#shared/contract'
import { describe, expect, it, vi } from 'vitest'
import { createActor, fromPromise } from 'xstate'
import type { MosaicRouteState, MosaicViewerInput } from '../../machines/mosaic-viewer'
import { mosaicViewerMachine } from '../../machines/mosaic-viewer'

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
} = {}) {
  const navigate = vi.fn()
  const syncQuery = vi.fn()
  const syncCellQuery = vi.fn()
  const fetch = vi.fn(opts.fetch ?? (async () => null))
  const fetchDay = vi.fn(opts.fetchDay ?? (async () => []))
  const fetchStep = vi.fn(opts.fetchStep ?? (async () => null))
  const fetchCells = vi.fn(opts.fetchCells ?? (async () => []))
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
      },
      actions: {
        navigate: (_, params) => navigate(params),
        syncQuery: (_, params) => syncQuery(params),
        syncCellQuery: (_, params) => syncCellQuery(params),
      },
    }),
    { input },
  )
  actor.start()
  return { actor, navigate, fetch, fetchDay, fetchStep, fetchCells, syncQuery, syncCellQuery }
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
    expect(syncQuery).toHaveBeenCalledWith({ opacity: 0.8, base: 'osm', coverage: false })
  })

  it('SET_OPACITY asigna y sincroniza', () => {
    const { actor, syncQuery } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'SET_OPACITY', value: 0.3 })
    expect(actor.getSnapshot().context.opacity).toBe(0.3)
    expect(syncQuery).toHaveBeenCalledWith({ opacity: 0.3, base: 'osm', coverage: true })
  })
})

describe('mosaicViewerMachine — región cells (P5/D45)', () => {
  it('arranca en idle, sin fetch antes de CELLS_INIT (nunca en SSR)', () => {
    const { actor, fetchCells } = boot({ initialRaster: meta(T0) })
    expect(actor.getSnapshot().matches({ cells: 'idle' })).toBe(true)
    expect(fetchCells).not.toHaveBeenCalled()
  })

  it('CELLS_INIT dispara fetchCells con domain+time y resuelve a ready', async () => {
    const { actor, fetchCells } = boot({
      initialRaster: meta(T0),
      fetchCells: async () => [cell('AMX', 'A0'), cell('BYX', 'A0')],
    })
    actor.send({ type: 'CELLS_INIT' })
    expect(actor.getSnapshot().matches({ cells: 'loading' })).toBe(true)
    expect(fetchCells).toHaveBeenCalledWith({ domain: 'GULF', t: T0 })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    expect(actor.getSnapshot().context.cells).toHaveLength(2)
  })

  it('CELLS_INIT repetido no vuelve a disparar fetch (cellsKey ya resuelto)', async () => {
    const { actor, fetchCells } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'CELLS_INIT' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    actor.send({ type: 'CELLS_INIT' })
    expect(fetchCells).toHaveBeenCalledTimes(1)
  })

  it('ROUTE_CHANGED con mismo slot_time no refetchea celdas', async () => {
    const { actor, fetchCells } = boot({ initialRaster: meta(T0) })
    actor.send({ type: 'CELLS_INIT' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ opacity: 0.5 }) })
    expect(fetchCells).toHaveBeenCalledTimes(1)
  })

  it('ROUTE_CHANGED a otro slot_time SÍ refetchea celdas', async () => {
    const { actor, fetchCells } = boot({
      initialRaster: meta(T0),
      initialTimes: [meta(T1), meta(T0), meta(T2)],
    })
    actor.send({ type: 'CELLS_INIT' })
    await vi.waitFor(() => expect(actor.getSnapshot().matches({ cells: 'ready' })).toBe(true))
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: T2 }) })
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
