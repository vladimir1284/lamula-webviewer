// Puerta M1: la MISMA suite corre contra ambos adaptadores del DAL.
// El live se ejercita sobre better-sqlite3 con el schema real del pipeline
// (mismo motor que D1), sembrado con las mismas fixtures que consume el
// adaptador fixture — y al final se asserta paridad resultado a resultado.
import { describe, expect, it } from 'vitest'
import { FixtureDal } from '~/server/dal/fixture'
import { LiveDal } from '~/server/dal/live'
import type { Dal } from '~/server/dal/types'
import { zProductRow, zRadarRow } from '~/shared/contract'
import { asD1, createSeededDb } from '../helpers/d1-sqlite'

const R2_BASE = 'https://cogs.example.test'
const NOW = new Date('2026-07-06T16:00:00Z')

const adapters: [string, () => Dal][] = [
  ['fixture', () => new FixtureDal(R2_BASE)],
  ['live (D1 sobre schema real)', () => new LiveDal(asD1(createSeededDb()), R2_BASE)],
]

describe.each(adapters)('DAL %s', (_name, make) => {
  const dal = make()

  it('listRadars: catálogo ordenado, forma del contrato', async () => {
    const radars = await dal.listRadars()
    expect(radars.map(r => r.site_id)).toEqual(['AMX', 'JUA'])
    for (const radar of radars) {
      zRadarRow.omit({ first_seen_at: true }).parse(radar)
    }
  })

  it('listProducts: descriptores mínimos ordenados por code', async () => {
    const products = await dal.listProducts()
    expect(products).toHaveLength(10)
    expect(products[0]).toEqual({ code: 48, mnemonic: 'NVW', unit: 'kt', kind: 'vwp' })
    for (const product of products) zProductRow.parse(product)
  })

  it('listRasterTimes: vol_times ascendentes del día UTC', async () => {
    const times = await dal.listRasterTimes('AMX', 153, '2026-07-06')
    expect(times).toHaveLength(6)
    expect(times[0]).toBe('2026-07-06T15:15:17')
    expect(times.at(-1)).toBe('2026-07-06T15:45:17')
    expect([...times].sort()).toEqual(times)
  })

  it('listRasterTimes: día sin datos y producto desconocido → []', async () => {
    expect(await dal.listRasterTimes('AMX', 153, '2026-07-05')).toEqual([])
    expect(await dal.listRasterTimes('AMX', 999, '2026-07-06')).toEqual([])
  })

  it('closest: hit exacto devuelve ese volumen con cog_url resuelta', async () => {
    const r = await dal.findRaster('AMX', 153, '2026-07-06T15:45:17', 'closest')
    expect(r?.vol_time).toBe('2026-07-06T15:45:17')
    expect(r?.cog_url).toBe(`${R2_BASE}/AMX/N0B/2026/07/06/AMX_N0B_20260706_154517.tif`)
    expect(r?.value_scale).toBe(0.5)
    expect(r?.value_offset).toBe(-33)
  })

  it('closest: elige el volumen más cercano en el tiempo, a ambos lados', async () => {
    const haciaNext = await dal.findRaster('AMX', 153, '2026-07-06T15:43:00', 'closest')
    expect(haciaNext?.vol_time).toBe('2026-07-06T15:45:17')
    const haciaPrev = await dal.findRaster('AMX', 153, '2026-07-06T15:41:00', 'closest')
    expect(haciaPrev?.vol_time).toBe('2026-07-06T15:39:17')
  })

  it('closest: fuera de la serie devuelve el extremo, no null', async () => {
    const r = await dal.findRaster('AMX', 153, '2026-07-06T23:59:59', 'closest')
    expect(r?.vol_time).toBe('2026-07-06T15:45:17')
  })

  it('closest: serie inexistente → null', async () => {
    expect(await dal.findRaster('AMX', 999, '2026-07-06T15:45:17', 'closest')).toBeNull()
  })

  it('next/prev: estrictos, null en los bordes', async () => {
    const next = await dal.findRaster('AMX', 153, '2026-07-06T15:39:17', 'next')
    expect(next?.vol_time).toBe('2026-07-06T15:45:17')
    expect(await dal.findRaster('AMX', 153, '2026-07-06T15:45:17', 'next')).toBeNull()

    const prev = await dal.findRaster('AMX', 153, '2026-07-06T15:21:17', 'prev')
    expect(prev?.vol_time).toBe('2026-07-06T15:15:17')
    expect(await dal.findRaster('AMX', 153, '2026-07-06T15:15:17', 'prev')).toBeNull()
  })

  it('listPhenomena: filas del volumen con attrs parseado', async () => {
    const rows = await dal.listPhenomena('AMX', '2026-07-06T15:45:17')
    expect(rows.map(r => [r.kind, r.cell_id])).toEqual([
      ['meso', '4'],
      ['storm_cell', 'A0'],
      ['storm_cell', 'B7'],
    ])
    expect(rows[0]!.attrs.radius_km).toBe(3.2)
    expect(rows[1]!.attrs.movement_kt).toBe(15)
    expect(rows[2]!.attrs.new).toBe(true)
  })

  it('listPhenomena: volumen sin fenómenos → [] (estado vacío, no error)', async () => {
    expect(await dal.listPhenomena('JUA', '2026-07-06T15:43:47')).toEqual([])
  })

  it('listPhenomenaByCell: serie cross-volumen ascendente por cell_id', async () => {
    const serie = await dal.listPhenomenaByCell('AMX', 'A0')
    expect(serie.map(p => p.vol_time)).toEqual([
      '2026-07-06T15:39:17',
      '2026-07-06T15:45:17',
    ])
    expect(serie.every(p => p.kind === 'storm_cell')).toBe(true)
  })

  it('listVwp: niveles por altura ascendente, rms_kt nullable', async () => {
    const amx = await dal.listVwp('AMX', '2026-07-06T15:45:17')
    expect(amx.map(l => l.height_ft)).toEqual([1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000])

    const jua = await dal.listVwp('JUA', '2026-07-06T15:43:47')
    expect(jua).toHaveLength(3)
    expect(jua.at(-1)?.rms_kt).toBeNull()
  })

  it('health: minutos desde el último scan y umbral de frescura', async () => {
    const fresh = await dal.health(NOW)
    expect(fresh.radars.map(r => [r.site_id, r.minutes_since_last_scan, r.fresh])).toEqual([
      ['AMX', 14, true],
      ['JUA', 16, true],
    ])

    const stale = await dal.health(new Date('2026-07-06T17:00:00Z'))
    expect(stale.radars.every(r => !r.fresh)).toBe(true)
  })
})

describe('paridad live ↔ fixture (puerta M1)', () => {
  const fixture: Dal = new FixtureDal(R2_BASE)
  const live: Dal = new LiveDal(asD1(createSeededDb()), R2_BASE)

  const calls: [string, (dal: Dal) => Promise<unknown>][] = [
    ['listRadars', d => d.listRadars()],
    ['listProducts', d => d.listProducts()],
    ['listRasterTimes', d => d.listRasterTimes('AMX', 153, '2026-07-06')],
    ['findRaster closest', d => d.findRaster('AMX', 153, '2026-07-06T15:43:00', 'closest')],
    ['findRaster next', d => d.findRaster('AMX', 153, '2026-07-06T15:39:17', 'next')],
    ['findRaster prev', d => d.findRaster('JUA', 153, '2026-07-06T15:43:47', 'prev')],
    ['findRaster sin resultado', d => d.findRaster('AMX', 999, '2026-07-06T12:00:00', 'closest')],
    ['listPhenomena', d => d.listPhenomena('AMX', '2026-07-06T15:45:17')],
    ['listPhenomenaByCell', d => d.listPhenomenaByCell('AMX', 'A0')],
    ['listVwp', d => d.listVwp('AMX', '2026-07-06T15:45:17')],
    ['health', d => d.health(NOW)],
  ]

  it.each(calls)('%s devuelve exactamente lo mismo en ambos', async (_name, call) => {
    expect(await call(fixture)).toEqual(await call(live))
  })
})
