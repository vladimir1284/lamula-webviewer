// Puerta M1: la MISMA suite corre contra ambos adaptadores del DAL.
// El live se ejercita sobre better-sqlite3 con el schema real del pipeline
// (mismo motor que D1), sembrado con las mismas fixtures que consume el
// adaptador fixture — y al final se asserta paridad resultado a resultado.
//
// Las fixtures son GRABACIONES de la D1 real: las expectativas se derivan
// de ellas (tests/helpers/derive.ts), no se hardcodean.
import { describe, expect, it } from 'vitest'
import { FixtureDal } from '~/server/dal/fixture'
import { LiveDal } from '~/server/dal/live'
import type { Dal } from '~/server/dal/types'
import { FRESH_MAX_MINUTES, naiveUtcToEpochMs, zProductRow, zRadarRow } from '~/shared/contract'
import { asD1, createSeededDb } from '../helpers/d1-sqlite'
import {
  healthNow,
  lightningDay,
  lightningEmptySite,
  phenDay,
  phenVolume,
  radars,
  series,
  shiftIso,
  siteIds,
  trackedCell,
  vwpDay,
  vwpVolume,
  windDay,
  windEmptySite,
} from '../helpers/derive'

const R2_BASE = 'https://cogs.example.test'

const adapters: [string, () => Dal][] = [
  ['fixture', () => new FixtureDal(R2_BASE)],
  ['live (D1 sobre schema real)', () => new LiveDal(asD1(createSeededDb()), R2_BASE)],
]

describe.each(adapters)('DAL %s', (_name, make) => {
  const dal = make()

  it('listRadars: catálogo grabado completo, ordenado, forma del contrato', async () => {
    const result = await dal.listRadars()
    expect(result.map(r => r.site_id)).toEqual(siteIds)
    for (const radar of result) {
      zRadarRow.omit({ first_seen_at: true }).parse(radar)
    }
  })

  it('listProducts: los descriptores grabados, ordenados por code', async () => {
    const result = await dal.listProducts()
    expect(result.length).toBeGreaterThanOrEqual(10)
    expect(result.map(p => p.code)).toEqual([...result.map(p => p.code)].sort((a, b) => a - b))
    for (const product of result) zProductRow.parse(product)
    expect(new Set(result.map(p => p.kind))).toEqual(new Set(['raster', 'phenomena', 'vwp']))
  })

  it('listRasterTimes: exactamente los vol_times grabados del día, ascendentes', async () => {
    const times = await dal.listRasterTimes(series.site, series.product, series.day)
    expect(times).toEqual(series.times)
  })

  it('listRasterTimes: día sin datos y producto desconocido → []', async () => {
    expect(await dal.listRasterTimes(series.site, series.product, '2000-01-01')).toEqual([])
    expect(await dal.listRasterTimes(series.site, 999, series.day)).toEqual([])
  })

  it('listRasters: metadata completa del día, ascendente, coherente con listRasterTimes', async () => {
    const rows = await dal.listRasters(series.site, series.product, series.day)
    expect(rows.map(r => r.vol_time)).toEqual(series.times)
    expect(rows.map(r => r.vol_time)).toEqual([...rows.map(r => r.vol_time)].sort())
    for (const row of rows) {
      expect(row.cog_url).toBe(`${R2_BASE}/${row.r2_key}`)
    }
  })

  it('listRasters: día sin datos y producto desconocido → []', async () => {
    expect(await dal.listRasters(series.site, series.product, '2000-01-01')).toEqual([])
    expect(await dal.listRasters(series.site, 999, series.day)).toEqual([])
  })

  it('closest: hit exacto devuelve ese volumen con cog_url resuelta', async () => {
    const target = series.rows[1]!
    const r = await dal.findRaster(series.site, series.product, target.vol_time, 'closest')
    expect(r?.vol_time).toBe(target.vol_time)
    expect(r?.r2_key).toBe(target.r2_key)
    expect(r?.cog_url).toBe(`${R2_BASE}/${target.r2_key}`)
    expect(r?.value_scale).toBe(target.value_scale)
    expect(r?.value_offset).toBe(target.value_offset)
  })

  it('closest: 1 s después de un volumen sigue siendo ese volumen', async () => {
    const [t0, t1] = [series.times[0]!, series.times[1]!]
    const gap = (naiveUtcToEpochMs(t1) - naiveUtcToEpochMs(t0)) / 1000
    expect(gap).toBeGreaterThan(10) // sanidad de la grabación
    const r = await dal.findRaster(series.site, series.product, shiftIso(t0, 1), 'closest')
    expect(r?.vol_time).toBe(t0)
  })

  it('closest: 1 s antes de un volumen lo elige a él, no al anterior', async () => {
    const t1 = series.times[1]!
    const r = await dal.findRaster(series.site, series.product, shiftIso(t1, -1), 'closest')
    expect(r?.vol_time).toBe(t1)
  })

  it('closest: fuera de la serie devuelve el extremo, no null', async () => {
    const after = await dal.findRaster(
      series.site,
      series.product,
      shiftIso(series.times.at(-1)!, 3600),
      'closest',
    )
    expect(after?.vol_time).toBe(series.times.at(-1))
    const before = await dal.findRaster(
      series.site,
      series.product,
      shiftIso(series.times[0]!, -3600),
      'closest',
    )
    expect(before?.vol_time).toBe(series.times[0])
  })

  it('closest: serie inexistente → null', async () => {
    expect(await dal.findRaster(series.site, 999, series.times[0]!, 'closest')).toBeNull()
  })

  it('next/prev: estrictos, null en los bordes', async () => {
    const next = await dal.findRaster(series.site, series.product, series.times[0]!, 'next')
    expect(next?.vol_time).toBe(series.times[1])
    expect(await dal.findRaster(series.site, series.product, series.times.at(-1)!, 'next')).toBeNull()

    const prev = await dal.findRaster(series.site, series.product, series.times[1]!, 'prev')
    expect(prev?.vol_time).toBe(series.times[0])
    expect(await dal.findRaster(series.site, series.product, series.times[0]!, 'prev')).toBeNull()
  })

  it('listPhenomenaTimes: exactamente los vol_times con fenómenos del día, ascendentes', async () => {
    const times = await dal.listPhenomenaTimes(phenDay.site, phenDay.day)
    expect(times).toEqual(phenDay.times)
  })

  it('listPhenomenaTimes: día sin datos → []', async () => {
    expect(await dal.listPhenomenaTimes(phenDay.site, '2000-01-01')).toEqual([])
  })

  it('listPhenomena: las filas grabadas del volumen, attrs parseado', async () => {
    const rows = await dal.listPhenomena(phenVolume.site, phenVolume.volTime)
    const expected = [...phenVolume.rows]
      .sort((a, b) => a.kind.localeCompare(b.kind) || (a.cell_id ?? '').localeCompare(b.cell_id ?? ''))
      .map(({ created_at: _c, ...row }) => ({ ...row, attrs: JSON.parse(row.attrs) as object }))
    expect(rows).toEqual(expected)
    expect(rows.length).toBeGreaterThan(0)
  })

  it('listPhenomena: volumen sin fenómenos → [] (estado vacío, no error)', async () => {
    expect(await dal.listPhenomena(phenVolume.site, '2000-01-01T00:00:00')).toEqual([])
  })

  it('listPhenomenaByCell: serie cross-volumen ascendente por cell_id', async () => {
    const serie = await dal.listPhenomenaByCell(trackedCell.site, trackedCell.cellId)
    expect(new Set(serie.map(p => p.vol_time)).size).toBe(trackedCell.volumes)
    const volTimes = serie.map(p => p.vol_time)
    expect([...volTimes].sort()).toEqual(volTimes)
    expect(serie.every(p => p.cell_id === trackedCell.cellId)).toBe(true)
  })

  it('listVwpTimes: exactamente los vol_times con perfil del día, ascendentes', async () => {
    const times = await dal.listVwpTimes(vwpDay.site, vwpDay.day)
    expect(times).toEqual(vwpDay.times)
  })

  it('listVwpTimes: día sin datos → []', async () => {
    expect(await dal.listVwpTimes(vwpDay.site, '2000-01-01')).toEqual([])
  })

  it('listVwp: los niveles grabados del volumen, por altura ascendente', async () => {
    const levels = await dal.listVwp(vwpVolume.site, vwpVolume.volTime)
    expect(levels).toHaveLength(vwpVolume.rows.length)
    const heights = levels.map(l => l.height_ft)
    expect([...heights].sort((a, b) => a - b)).toEqual(heights)
  })

  it('listVwp: volumen sin perfil → []', async () => {
    expect(await dal.listVwp(vwpVolume.site, '2000-01-01T00:00:00')).toEqual([])
  })

  it('listWindTimes: grillas del día ±2 h de un nivel, ascendentes, wind_url resuelta', async () => {
    const grids = await dal.listWindTimes(windDay.site, windDay.day, windDay.level)
    const expected = windDay.rows.map(({ size_bytes: _s, created_at: _c, ...row }) => ({
      ...row,
      wind_url: `${R2_BASE}/${row.r2_key}`,
    }))
    expect(grids).toEqual(expected)
    // padding ±2 h: vecino de un día contiguo presente si la grabación lo trae
    if (windDay.hasNeighbor) {
      expect(grids.some(g => !g.valid_time.startsWith(windDay.day))).toBe(true)
    }
  })

  it('listWindTimes: día sin datos, site sin viento, o nivel sin ingerir → []', async () => {
    expect(await dal.listWindTimes(windDay.site, '2000-01-01', windDay.level)).toEqual([])
    if (windEmptySite !== null) {
      expect(await dal.listWindTimes(windEmptySite, windDay.day, windDay.level)).toEqual([])
    }
    // 850/700/500 hPa: rollout pendiente del lado del pipeline (spec jul-2026)
    const otherLevel = windDay.level === '10m' ? '850hPa' : '10m'
    expect(await dal.listWindTimes(windDay.site, windDay.day, otherLevel)).toEqual([])
  })

  it('listLightningBuckets: cubos del día ±900 s, ascendentes, lightning_url resuelta', async () => {
    const buckets = await dal.listLightningBuckets(lightningDay.site, lightningDay.day)
    const expected = lightningDay.rows.map(({ size_bytes: _s, created_at: _c, ...row }) => ({
      ...row,
      lightning_url: row.r2_key ? `${R2_BASE}/${row.r2_key}` : null,
    }))
    expect(buckets).toEqual(expected)
    // padding ±900 s: vecino de un día contiguo presente si la grabación lo trae
    if (lightningDay.hasNeighbor) {
      expect(buckets.some(b => !b.bucket_start.startsWith(lightningDay.day))).toBe(true)
    }
    // cubo cubierto sin descargas: fila presente, sin URL (≠ hueco de ingesta)
    if (lightningDay.zeroBucket !== null) {
      const zero = buckets.find(b => b.bucket_start === lightningDay.zeroBucket!.bucket_start)!
      expect(zero.strike_count).toBe(0)
      expect(zero.r2_key).toBeNull()
      expect(zero.lightning_url).toBeNull()
    }
  })

  it('listLightningBuckets: día sin datos y site sin rayos → []', async () => {
    expect(await dal.listLightningBuckets(lightningDay.site, '2000-01-01')).toEqual([])
    if (lightningEmptySite !== null) {
      expect(await dal.listLightningBuckets(lightningEmptySite, lightningDay.day)).toEqual([])
    }
  })

  it('health: minutos desde el último scan y umbral de frescura', async () => {
    const health = await dal.health(healthNow)
    const expected = [...radars]
      .sort((a, b) => a.site_id.localeCompare(b.site_id))
      .map((r) => {
        const minutes = Math.floor((healthNow.getTime() - naiveUtcToEpochMs(r.last_seen_at)) / 60_000)
        return {
          site_id: r.site_id,
          last_seen_at: r.last_seen_at,
          minutes_since_last_scan: minutes,
          fresh: minutes <= FRESH_MAX_MINUTES,
        }
      })
    expect(health.radars).toEqual(expected)
    expect(health.generated_at).toBe(healthNow.toISOString())
  })
})

describe('paridad live ↔ fixture (puerta M1)', () => {
  const fixture: Dal = new FixtureDal(R2_BASE)
  const live: Dal = new LiveDal(asD1(createSeededDb()), R2_BASE)

  const calls: [string, (dal: Dal) => Promise<unknown>][] = [
    ['listRadars', d => d.listRadars()],
    ['listProducts', d => d.listProducts()],
    ['listRasterTimes', d => d.listRasterTimes(series.site, series.product, series.day)],
    ['listRasters', d => d.listRasters(series.site, series.product, series.day)],
    ['findRaster closest', d =>
      d.findRaster(series.site, series.product, shiftIso(series.times[1]!, -1), 'closest')],
    ['findRaster next', d => d.findRaster(series.site, series.product, series.times[0]!, 'next')],
    ['findRaster prev', d => d.findRaster(series.site, series.product, series.times[1]!, 'prev')],
    ['findRaster sin resultado', d => d.findRaster(series.site, 999, series.times[0]!, 'closest')],
    ['listPhenomenaTimes', d => d.listPhenomenaTimes(phenDay.site, phenDay.day)],
    ['listPhenomena', d => d.listPhenomena(phenVolume.site, phenVolume.volTime)],
    ['listVwpTimes', d => d.listVwpTimes(vwpDay.site, vwpDay.day)],
    ['listPhenomenaByCell', d => d.listPhenomenaByCell(trackedCell.site, trackedCell.cellId)],
    ['listVwp', d => d.listVwp(vwpVolume.site, vwpVolume.volTime)],
    ['listWindTimes', d => d.listWindTimes(windDay.site, windDay.day, windDay.level)],
    ['listLightningBuckets', d => d.listLightningBuckets(lightningDay.site, lightningDay.day)],
    ['health', d => d.health(healthNow)],
  ]

  it.each(calls)('%s devuelve exactamente lo mismo en ambos', async (_name, call) => {
    expect(await call(fixture)).toEqual(await call(live))
  })
})
