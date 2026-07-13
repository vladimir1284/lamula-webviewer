// viewerMachine pura: navegación y fetch inyectados como mocks — sin router
// ni red (decisión 18). El diagrama vive en docs/maquinas-estado.md.
import type { RasterMeta } from '#shared/contract'
import { describe, expect, it, vi } from 'vitest'
import { createActor, fromPromise, waitFor } from 'xstate'
import type { ViewerInput, ViewerRouteState } from '../../machines/viewer'
import { viewerMachine } from '../../machines/viewer'

const T0 = '2026-07-11T03:16:49'
const T1 = '2026-07-11T03:11:52'

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
  ...patch,
})

function boot(opts: {
  route?: Partial<ViewerRouteState>
  initialRaster?: RasterMeta | null
  initialError?: string | null
  fetch?: (input: { site: string, product: number, t: string }) => Promise<RasterMeta | null>
} = {}) {
  const navigate = vi.fn()
  const fetch = vi.fn(opts.fetch ?? (async () => null))
  const input: ViewerInput = {
    radars: [],
    products: [],
    route: routeAt(opts.route),
    nowT: '2026-07-11T04:00:00',
    initialRaster: opts.initialRaster ?? null,
    initialError: opts.initialError ?? null,
  }
  const actor = createActor(
    viewerMachine.provide({
      actors: { fetchClosest: fromPromise(({ input: i }) => fetch(i)) },
      actions: { navigate: (_, params) => navigate(params) },
    }),
    { input },
  )
  actor.start()
  return { actor, navigate, fetch }
}

describe('viewerMachine — estado inicial (SSR)', () => {
  it('arranca en shown con el raster del closest SSR', () => {
    const { actor } = boot({ initialRaster: meta(T0) })
    expect(actor.getSnapshot().value).toBe('shown')
    expect(actor.getSnapshot().context.raster?.vol_time).toBe(T0)
  })

  it('arranca en empty con closest 404', () => {
    const { actor } = boot({ initialRaster: null })
    expect(actor.getSnapshot().value).toBe('empty')
  })

  it('arranca en error con fallo del closest SSR', () => {
    const { actor } = boot({ initialError: 'D1 no disponible' })
    expect(actor.getSnapshot().value).toBe('error')
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
    await waitFor(actor, s => s.matches('shown'))
    expect(navigate).toHaveBeenCalledWith({ patch: { time: T1 }, mode: 'replace' })
  })
})

describe('viewerMachine — ROUTE_CHANGED', () => {
  it('sameFrame (materialización del time) no refetchea ni cambia de estado', () => {
    const { actor, fetch } = boot({ route: { time: null }, initialRaster: meta(T0) })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ time: T0 }) })
    expect(fetch).not.toHaveBeenCalled()
    expect(actor.getSnapshot().value).toBe('shown')
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
    expect(actor.getSnapshot().value).toBe('loading')
    await waitFor(actor, s => s.matches('shown'))
    expect(fetch).toHaveBeenCalledWith({ site: 'AMX', product: 154, t: T0 })
    expect(actor.getSnapshot().context.raster?.vol_time).toBe(T1)
  })

  it('closest 404 degrada a empty', async () => {
    const { actor } = boot({ initialRaster: meta(T0), fetch: async () => null })
    actor.send({ type: 'ROUTE_CHANGED', route: routeAt({ site: 'ICT' }) })
    await waitFor(actor, s => s.matches('empty'))
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
    await waitFor(actor, s => s.matches('error'))
    expect(actor.getSnapshot().context.rasterError).toBe('boom')
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
})
