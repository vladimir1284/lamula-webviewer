// Adaptador fixture: mismas respuestas desde grabaciones commiteadas
// (server/dal/fixtures/*.json) — CI determinista y desarrollo offline.
// Debe comportarse EXACTAMENTE igual que el live: la suite de
// tests/unit/dal.spec.ts corre contra ambos y compara resultados (M1).
import type {
  Health,
  Phenomenon,
  PhenomenonRow,
  Product,
  ProductRow,
  Radar,
  RadarRow,
  RasterMeta,
  RasterRow,
  VwpLevel,
  VwpRow,
} from '../../shared/contract'
import { dayRange } from '../../shared/contract'
import phenomenaJson from './fixtures/phenomena.json'
import productsJson from './fixtures/products.json'
import radarsJson from './fixtures/radars.json'
import rastersJson from './fixtures/rasters.json'
import vwpJson from './fixtures/vwp.json'
import { buildHealth, pickClosest, toPhenomenon, toRasterMeta } from './mappers'
import type { Dal, RasterLookupMode } from './types'

// Las grabaciones incluyen created_at (columna NOT NULL, grabada tal cual);
// el DAL la ignora igual que las SELECT del live no la piden.
const radars = radarsJson as RadarRow[]
const products = productsJson as ProductRow[]
const rasters = rastersJson as (RasterRow & { created_at: string })[]
const phenomena = phenomenaJson as (PhenomenonRow & { created_at: string })[]
const vwp = vwpJson as (VwpRow & { created_at: string })[]

const byVolTime = <T extends { vol_time: string }>(a: T, b: T) =>
  a.vol_time.localeCompare(b.vol_time)

export class FixtureDal implements Dal {
  constructor(private readonly r2BaseUrl: string | null) {}

  async listRadars(): Promise<Radar[]> {
    return radars
      .map(({ first_seen_at: _first, ...rest }) => rest)
      .sort((a, b) => a.site_id.localeCompare(b.site_id))
  }

  async listProducts(): Promise<Product[]> {
    return [...products].sort((a, b) => a.code - b.code)
  }

  async listRasterTimes(site: string, productCode: number, day: string): Promise<string[]> {
    const { from, to } = dayRange(day)
    return rasters
      .filter(r =>
        r.site_id === site
        && r.product_code === productCode
        && r.vol_time >= from
        && r.vol_time < to,
      )
      .map(r => r.vol_time)
      .sort()
  }

  async listRasters(site: string, productCode: number, day: string): Promise<RasterMeta[]> {
    const { from, to } = dayRange(day)
    return rasters
      .filter(r =>
        r.site_id === site
        && r.product_code === productCode
        && r.vol_time >= from
        && r.vol_time < to,
      )
      .sort(byVolTime)
      .map((row) => {
        const { size_bytes: _size, created_at: _created, ...cols } = row
        return toRasterMeta(cols, this.r2BaseUrl)
      })
  }

  async findRaster(site: string, productCode: number, t: string, mode: RasterLookupMode) {
    const series = rasters
      .filter(r => r.site_id === site && r.product_code === productCode)
      .sort(byVolTime)

    let row: RasterRow | null
    if (mode === 'next') {
      row = series.find(r => r.vol_time > t) ?? null
    }
    else if (mode === 'prev') {
      row = series.findLast(r => r.vol_time < t) ?? null
    }
    else {
      const prev = series.findLast(r => r.vol_time <= t) ?? null
      const next = series.find(r => r.vol_time >= t) ?? null
      row = pickClosest(prev, next, t)
    }
    if (!row) return null
    const { size_bytes: _size, created_at: _created, ...cols } = row as RasterRow & { created_at: string }
    return toRasterMeta(cols, this.r2BaseUrl)
  }

  async listPhenomenaTimes(site: string, day: string): Promise<string[]> {
    const { from, to } = dayRange(day)
    return [...new Set(
      phenomena
        .filter(p => p.site_id === site && p.vol_time >= from && p.vol_time < to)
        .map(p => p.vol_time),
    )].sort()
  }

  async listPhenomena(site: string, volTime: string): Promise<Phenomenon[]> {
    return phenomena
      .filter(p => p.site_id === site && p.vol_time === volTime)
      .sort((a, b) =>
        a.kind.localeCompare(b.kind) || (a.cell_id ?? '').localeCompare(b.cell_id ?? ''),
      )
      .map(({ created_at: _created, ...row }) => toPhenomenon(row))
  }

  async listPhenomenaByCell(site: string, cellId: string): Promise<Phenomenon[]> {
    return phenomena
      .filter(p => p.site_id === site && p.cell_id === cellId)
      .sort(byVolTime)
      .map(({ created_at: _created, ...row }) => toPhenomenon(row))
  }

  async listVwpTimes(site: string, day: string): Promise<string[]> {
    const { from, to } = dayRange(day)
    return [...new Set(
      vwp
        .filter(v => v.site_id === site && v.vol_time >= from && v.vol_time < to)
        .map(v => v.vol_time),
    )].sort()
  }

  async listVwp(site: string, volTime: string): Promise<VwpLevel[]> {
    return vwp
      .filter(v => v.site_id === site && v.vol_time === volTime)
      .sort((a, b) => a.height_ft - b.height_ft)
      .map(({ created_at: _created, ...row }) => row)
  }

  async health(now: Date): Promise<Health> {
    const rows = [...radars].sort((a, b) => a.site_id.localeCompare(b.site_id))
    return buildHealth(rows, now)
  }
}
