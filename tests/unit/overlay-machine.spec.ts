// overlayMachine pura: fetch inyectados como mocks — sin red. Regiones
// paralelas index/frame/series/vwp/wind; diagrama en docs/maquinas-estado.md.
import type { Phenomenon, VwpLevel, WindGridFile, WindGridMeta } from '#shared/contract'
import { describe, expect, it, vi } from 'vitest'
import { createActor, fromPromise, waitFor } from 'xstate'
import { overlayMachine } from '../../machines/overlay'

const SITE = 'AMX'
const DAY = '2026-07-11'
const PT = ['2026-07-11T02:50:38', '2026-07-11T02:55:54', '2026-07-11T03:01:02']
const VT = ['2026-07-11T03:06:27', '2026-07-11T03:11:52']
const WT = ['2026-07-11T02:00:00', '2026-07-11T03:00:00', '2026-07-11T04:00:00']

function phen(volTime: string, cellId: string): Phenomenon {
  return {
    site_id: SITE,
    product_code: 58,
    vol_time: volTime,
    kind: 'storm_cell',
    cell_id: cellId,
    lat: 25.5,
    lon: -80.5,
    azimuth_deg: 90,
    range_km: 50,
    attrs: { dbz_max: 50 },
  }
}

function vwpLevel(volTime: string, heightFt: number): VwpLevel {
  return {
    site_id: SITE,
    vol_time: volTime,
    height_ft: heightFt,
    wind_dir_deg: 180,
    wind_speed_kt: 20,
    rms_kt: 3,
  }
}

function windMeta(validTime: string): WindGridMeta {
  return {
    site_id: SITE,
    valid_time: validTime,
    cycle_time: '2026-07-11T00:00:00',
    forecast_hour: Number(validTime.slice(11, 13)),
    model: 'gfs0p25',
    r2_key: `${SITE}/WIND/x_${validTime}.json`,
    wind_url: `https://r2.test/${SITE}/WIND/x_${validTime}.json`,
  }
}

function windFile(validTime: string): WindGridFile {
  return {
    header: { nx: 2, ny: 2, lo1: -81, la1: 26, dx: 0.25, dy: 0.25, refTime: `${validTime}Z`, forecastHour: 0 },
    u: [1, 2, 3, 4],
    v: [0, 0, 0, 0],
  }
}

function boot(opts: {
  phenTimes?: string[]
  vwpTimes?: string[]
  windTimes?: string[]
  fetchTimes?: (i: { site: string, day: string }) => Promise<{ phen: string[], vwp: string[] }>
  fetchPhenomena?: (i: { site: string, volTime: string }) => Promise<Phenomenon[]>
  fetchSeries?: (i: { site: string, cellId: string }) => Promise<Phenomenon[]>
  fetchVwp?: (i: { site: string, volTimes: string[] }) => Promise<Record<string, VwpLevel[]>>
  fetchWindTimes?: (i: { site: string, day: string }) => Promise<WindGridMeta[]>
  fetchWindGrid?: (i: { meta: WindGridMeta }) => Promise<WindGridFile>
} = {}) {
  const fetchTimes = vi.fn(
    opts.fetchTimes
    ?? (async () => ({ phen: opts.phenTimes ?? PT, vwp: opts.vwpTimes ?? VT })),
  )
  const fetchPhenomena = vi.fn(
    opts.fetchPhenomena ?? (async ({ volTime }) => [phen(volTime, 'A3')]),
  )
  const fetchSeries = vi.fn(opts.fetchSeries ?? (async ({ cellId }) => [phen(PT[0]!, cellId)]))
  const fetchVwp = vi.fn(
    opts.fetchVwp
    ?? (async ({ volTimes }: { site: string, volTimes: string[] }) =>
      Object.fromEntries(volTimes.map(t => [t, [vwpLevel(t, 1000)]]))),
  )
  const fetchWindTimes = vi.fn(
    opts.fetchWindTimes ?? (async () => (opts.windTimes ?? WT).map(windMeta)),
  )
  const fetchWindGrid = vi.fn(
    opts.fetchWindGrid ?? (async ({ meta }: { meta: WindGridMeta }) => windFile(meta.valid_time)),
  )
  const actor = createActor(
    overlayMachine.provide({
      actors: {
        fetchTimes: fromPromise(({ input: i }) => fetchTimes(i)),
        fetchPhenomena: fromPromise(({ input: i }) => fetchPhenomena(i)),
        fetchSeries: fromPromise(({ input: i }) => fetchSeries(i)),
        fetchVwp: fromPromise(({ input: i }) => fetchVwp(i)),
        fetchWindTimes: fromPromise(({ input: i }) => fetchWindTimes(i)),
        fetchWindGrid: fromPromise(({ input: i }) => fetchWindGrid(i)),
      },
    }),
    { input: { site: SITE, day: DAY } },
  )
  actor.start()
  return { actor, fetchTimes, fetchPhenomena, fetchSeries, fetchVwp, fetchWindTimes, fetchWindGrid }
}

const settled = (actor: ReturnType<typeof boot>['actor']) =>
  waitFor(actor, s =>
    !s.matches({ index: 'loading' })
    && !s.matches({ frame: 'fetching' })
    && !s.matches({ series: 'loading' })
    && !s.matches({ vwp: 'loading' })
    && !s.matches({ wind: 'loadingIndex' })
    && !s.matches({ wind: 'fetching' }))

describe('overlayMachine — gating y arranque', () => {
  it('arranca todo idle y sin fetch (hidratación segura)', () => {
    const { actor, fetchTimes } = boot()
    const s = actor.getSnapshot()
    expect(s.matches({ index: 'idle' })).toBe(true)
    expect(s.matches({ frame: 'idle' })).toBe(true)
    expect(fetchTimes).not.toHaveBeenCalled()
  })

  it('SET_TIME sin toggles activos solo registra el volTime, sin fetch', () => {
    const { actor, fetchTimes, fetchPhenomena } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[0]! })
    expect(actor.getSnapshot().context.volTime).toBe(PT[0])
    expect(actor.getSnapshot().matches({ frame: 'idle' })).toBe(true)
    expect(fetchTimes).not.toHaveBeenCalled()
    expect(fetchPhenomena).not.toHaveBeenCalled()
  })

  it('activar una capa carga índice y resuelve el frame pendiente', async () => {
    const { actor, fetchTimes, fetchPhenomena } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[1]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await settled(actor)
    expect(fetchTimes).toHaveBeenCalledOnce()
    expect(fetchPhenomena).toHaveBeenCalledWith({ site: SITE, volTime: PT[1] })
    const s = actor.getSnapshot()
    expect(s.matches({ frame: 'shown' })).toBe(true)
    expect(s.context.phenomena).toHaveLength(1)
  })

  it('desactivar todo vuelve el frame a idle', async () => {
    const { actor } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[1]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await settled(actor)
    actor.send({ type: 'SET_ACTIVE', layers: [], panel: null })
    expect(actor.getSnapshot().matches({ frame: 'idle' })).toBe(true)
  })
})

describe('overlayMachine — join temporal (D24)', () => {
  it('frame sin volumen exacto casa con el vecino dentro de tolerancia', async () => {
    const { actor, fetchPhenomena } = boot()
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await waitFor(actor, s => s.matches({ index: 'ready' }))
    actor.send({ type: 'SET_TIME', volTime: '2026-07-11T02:57:00' }) // a 66 s de PT[1]
    await settled(actor)
    expect(actor.getSnapshot().context.joined).toBe(PT[1])
    expect(fetchPhenomena).toHaveBeenCalledWith({ site: SITE, volTime: PT[1] })
  })

  it('frame fuera de tolerancia → noData con joined null, sin fetch', async () => {
    const { actor, fetchPhenomena } = boot()
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await waitFor(actor, s => s.matches({ index: 'ready' }))
    actor.send({ type: 'SET_TIME', volTime: '2026-07-11T06:00:00' })
    await settled(actor)
    const s = actor.getSnapshot()
    expect(s.matches({ frame: 'noData' })).toBe(true)
    expect(s.context.joined).toBeNull()
    expect(fetchPhenomena).not.toHaveBeenCalled()
  })

  it('volumen casado con 0 filas → noData con joined presente (distinguible)', async () => {
    const { actor } = boot({ fetchPhenomena: async () => [] })
    actor.send({ type: 'SET_TIME', volTime: PT[0]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await settled(actor)
    const s = actor.getSnapshot()
    expect(s.matches({ frame: 'noData' })).toBe(true)
    expect(s.context.joined).toBe(PT[0])
    expect(s.context.phenomena).toEqual([])
  })

  it('índice vacío (JUA) → noData visible, sin fetch de fenómenos', async () => {
    const { actor, fetchPhenomena } = boot({ phenTimes: [], vwpTimes: [] })
    actor.send({ type: 'SET_TIME', volTime: PT[0]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await settled(actor)
    expect(actor.getSnapshot().matches({ frame: 'noData' })).toBe(true)
    expect(fetchPhenomena).not.toHaveBeenCalled()
  })

  it('cache por vol_time: dos frames que casan al mismo volumen → un solo fetch', async () => {
    const { actor, fetchPhenomena } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[1]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await settled(actor)
    actor.send({ type: 'SET_TIME', volTime: '2026-07-11T02:57:00' }) // mismo joined
    await settled(actor)
    expect(actor.getSnapshot().matches({ frame: 'shown' })).toBe(true)
    expect(fetchPhenomena).toHaveBeenCalledOnce()
  })

  it('last-wins: SET_TIME rápido en cadena descarta el fetch pisado', async () => {
    let resolveFirst!: (v: Phenomenon[]) => void
    const calls: string[] = []
    const { actor } = boot({
      fetchPhenomena: async ({ volTime }) => {
        calls.push(volTime)
        if (calls.length === 1) {
          return new Promise<Phenomenon[]>((r) => {
            resolveFirst = r
          })
        }
        return [phen(volTime, 'B1'), phen(volTime, 'B2')]
      },
    })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await waitFor(actor, s => s.matches({ index: 'ready' }))
    actor.send({ type: 'SET_TIME', volTime: PT[0]! }) // fetch 1 queda colgado
    actor.send({ type: 'SET_TIME', volTime: PT[2]! }) // reentra: cancela fetch 1
    await settled(actor)
    resolveFirst([phen(PT[0]!, 'STALE')]) // llega tarde: debe ignorarse
    await settled(actor)
    const s = actor.getSnapshot()
    expect(s.context.joined).toBe(PT[2])
    expect(s.context.phenomena!.map(p => p.cell_id)).toEqual(['B1', 'B2'])
  })
})

describe('overlayMachine — SET_SCOPE', () => {
  it('cambiar de site limpia caches e índices y recarga si sigue activo', async () => {
    const { actor, fetchTimes } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[0]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: null })
    await settled(actor)
    actor.send({ type: 'SET_SCOPE', site: 'BYX', day: DAY })
    await settled(actor)
    expect(fetchTimes).toHaveBeenCalledTimes(2)
    expect(fetchTimes).toHaveBeenLastCalledWith({ site: 'BYX', day: DAY })
    const s = actor.getSnapshot()
    expect(s.context.phenCache).toEqual({})
    expect(s.context.volTime).toBeNull() // el frame del scope anterior no vale
    expect(s.matches({ frame: 'idle' })).toBe(true)
  })

  it('con todo inactivo, SET_SCOPE no dispara red', async () => {
    const { actor, fetchTimes } = boot()
    actor.send({ type: 'SET_SCOPE', site: 'BYX', day: DAY })
    await settled(actor)
    expect(fetchTimes).not.toHaveBeenCalled()
    expect(actor.getSnapshot().matches({ index: 'idle' })).toBe(true)
  })
})

describe('overlayMachine — serie de celda', () => {
  it('SELECT_CELL carga la serie; null la limpia', async () => {
    const { actor, fetchSeries } = boot()
    actor.send({ type: 'SELECT_CELL', cellId: 'D4' })
    await settled(actor)
    expect(fetchSeries).toHaveBeenCalledWith({ site: SITE, cellId: 'D4' })
    expect(actor.getSnapshot().matches({ series: 'shown' })).toBe(true)
    expect(actor.getSnapshot().context.series).toHaveLength(1)
    actor.send({ type: 'SELECT_CELL', cellId: null })
    expect(actor.getSnapshot().matches({ series: 'idle' })).toBe(true)
    expect(actor.getSnapshot().context.series).toBeNull()
  })
})

describe('overlayMachine — viento (región wind)', () => {
  it('activar wind carga SU índice y el grid del frame; cero fetch de fenómenos', async () => {
    const { actor, fetchWindTimes, fetchWindGrid, fetchTimes, fetchPhenomena } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[0]! }) // 02:50:38 → casa con 03:00
    actor.send({ type: 'SET_ACTIVE', layers: ['wind'], panel: null })
    await settled(actor)
    const s = actor.getSnapshot()
    expect(s.matches({ wind: 'shown' })).toBe(true)
    expect(s.context.windJoined).toBe(WT[1])
    expect(s.context.windGrid).toEqual(windFile(WT[1]!))
    expect(fetchWindTimes).toHaveBeenCalledWith({ site: SITE, day: DAY })
    expect(fetchWindGrid).toHaveBeenCalledOnce()
    // 'wind' no es capa de fenómenos: ni índice phen/vwp ni filas
    expect(fetchTimes).not.toHaveBeenCalled()
    expect(fetchPhenomena).not.toHaveBeenCalled()
    expect(s.matches({ frame: 'idle' })).toBe(true)
  })

  it('frame a >1 h de todo valid_time → noData con grid limpio, sin fetch del JSON', async () => {
    const { actor, fetchWindGrid } = boot()
    actor.send({ type: 'SET_TIME', volTime: '2026-07-11T08:00:00' })
    actor.send({ type: 'SET_ACTIVE', layers: ['wind'], panel: null })
    await settled(actor)
    const s = actor.getSnapshot()
    expect(s.matches({ wind: 'noData' })).toBe(true)
    expect(s.context.windJoined).toBeNull()
    expect(s.context.windGrid).toBeNull()
    expect(fetchWindGrid).not.toHaveBeenCalled()
  })

  it('cache por r2_key: dos frames que casan al mismo valid_time → un solo fetch del JSON', async () => {
    const { actor, fetchWindGrid } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[0]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['wind'], panel: null })
    await settled(actor)
    actor.send({ type: 'SET_TIME', volTime: PT[2]! }) // 03:01:02 → mismo 03:00
    await settled(actor)
    expect(actor.getSnapshot().matches({ wind: 'shown' })).toBe(true)
    expect(fetchWindGrid).toHaveBeenCalledOnce()
  })

  it('toggle off limpia join y grid; on de nuevo reusa índice y cache (cero red)', async () => {
    const { actor, fetchWindTimes, fetchWindGrid } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[0]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['wind'], panel: null })
    await settled(actor)
    actor.send({ type: 'SET_ACTIVE', layers: [], panel: null })
    let s = actor.getSnapshot()
    expect(s.matches({ wind: 'idle' })).toBe(true)
    expect(s.context.windGrid).toBeNull()
    actor.send({ type: 'SET_ACTIVE', layers: ['wind'], panel: null })
    await settled(actor)
    s = actor.getSnapshot()
    expect(s.matches({ wind: 'shown' })).toBe(true)
    expect(fetchWindTimes).toHaveBeenCalledOnce()
    expect(fetchWindGrid).toHaveBeenCalledOnce()
  })

  it('índice vacío → noData visible', async () => {
    const { actor, fetchWindGrid } = boot({ windTimes: [] })
    actor.send({ type: 'SET_TIME', volTime: PT[0]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['wind'], panel: null })
    await settled(actor)
    expect(actor.getSnapshot().matches({ wind: 'noData' })).toBe(true)
    expect(fetchWindGrid).not.toHaveBeenCalled()
  })

  it('SET_SCOPE limpia índice/cache y recarga solo si wind sigue activo', async () => {
    const { actor, fetchWindTimes } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[0]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['wind'], panel: null })
    await settled(actor)
    actor.send({ type: 'SET_SCOPE', site: 'BYX', day: DAY })
    await settled(actor)
    expect(fetchWindTimes).toHaveBeenCalledTimes(2)
    expect(fetchWindTimes).toHaveBeenLastCalledWith({ site: 'BYX', day: DAY })
    // sin frame nuevo aún (la página reemite SET_TIME): join sin volTime → noData
    expect(actor.getSnapshot().matches({ wind: 'noData' })).toBe(true)
    expect(actor.getSnapshot().context.windCache).toEqual({})
  })

  it('wind + cells conviven: cada región fetchea lo suyo', async () => {
    const { actor, fetchWindGrid, fetchPhenomena, fetchTimes, fetchWindTimes } = boot()
    actor.send({ type: 'SET_TIME', volTime: PT[1]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells', 'wind'], panel: null })
    await settled(actor)
    const s = actor.getSnapshot()
    expect(s.matches({ frame: 'shown' })).toBe(true)
    expect(s.matches({ wind: 'shown' })).toBe(true)
    expect(fetchTimes).toHaveBeenCalledOnce()
    expect(fetchWindTimes).toHaveBeenCalledOnce()
    expect(fetchPhenomena).toHaveBeenCalledOnce()
    expect(fetchWindGrid).toHaveBeenCalledOnce()
  })
})

describe('overlayMachine — VWP', () => {
  it('panel vwp carga la ventana de perfiles hasta el frame', async () => {
    const { actor, fetchVwp } = boot()
    actor.send({ type: 'SET_TIME', volTime: VT[1]! })
    actor.send({ type: 'SET_ACTIVE', layers: [], panel: 'vwp' })
    await settled(actor)
    const s = actor.getSnapshot()
    expect(s.matches({ vwp: 'shown' })).toBe(true)
    expect(s.context.vwpWindow).toEqual(VT)
    expect(s.context.vwpJoined).toBe(VT[1])
    expect(fetchVwp).toHaveBeenCalledWith({ site: SITE, volTimes: VT })
    expect(Object.keys(s.context.vwpProfiles)).toEqual(VT)
  })

  it('cache: reabrir el panel con la misma ventana no refetchea', async () => {
    const { actor, fetchVwp } = boot()
    actor.send({ type: 'SET_TIME', volTime: VT[1]! })
    actor.send({ type: 'SET_ACTIVE', layers: [], panel: 'vwp' })
    await settled(actor)
    actor.send({ type: 'SET_ACTIVE', layers: [], panel: null })
    actor.send({ type: 'SET_ACTIVE', layers: [], panel: 'vwp' })
    await settled(actor)
    expect(actor.getSnapshot().matches({ vwp: 'shown' })).toBe(true)
    expect(fetchVwp).toHaveBeenCalledOnce()
  })

  it('día sin perfiles hasta el frame → empty', async () => {
    const { actor, fetchVwp } = boot()
    actor.send({ type: 'SET_TIME', volTime: '2026-07-11T01:00:00' }) // antes del primer perfil
    actor.send({ type: 'SET_ACTIVE', layers: [], panel: 'vwp' })
    await settled(actor)
    expect(actor.getSnapshot().matches({ vwp: 'empty' })).toBe(true)
    expect(fetchVwp).not.toHaveBeenCalled()
  })

  it('la señal de fenómenos y la de VWP son independientes (JUA: sin celdas, con perfil)', async () => {
    const { actor } = boot({ phenTimes: [] })
    actor.send({ type: 'SET_TIME', volTime: VT[0]! })
    actor.send({ type: 'SET_ACTIVE', layers: ['cells'], panel: 'vwp' })
    await settled(actor)
    const s = actor.getSnapshot()
    expect(s.matches({ frame: 'noData' })).toBe(true)
    expect(s.matches({ vwp: 'shown' })).toBe(true)
  })
})
