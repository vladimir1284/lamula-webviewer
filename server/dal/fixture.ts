// Adaptador fixture: mismas respuestas desde grabaciones commiteadas
// (server/dal/fixtures/*.json) — CI determinista y desarrollo offline.
// Debe comportarse EXACTAMENTE igual que el live: la suite de
// tests/unit/dal.spec.ts corre contra ambos y compara resultados (M1).
import type {
  Health,
  LightningBucketMeta,
  LightningBucketRow,
  MosaicDomain,
  MosaicDomainRow,
  MosaicRasterMeta,
  MosaicRasterRow,
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
  WindGridMeta,
  WindGridRow,
  WindLevel,
} from '../../shared/contract'
import { dayRange, dayRangePadded, LIGHTNING_DAY_PAD_S, WIND_DAY_PAD_S } from '../../shared/contract'
import lightningJson from './fixtures/lightning.json'
import mosaicDomainSitesJson from './fixtures/mosaic-domain-sites.json'
import mosaicDomainsJson from './fixtures/mosaic-domains.json'
import mosaicRastersJson from './fixtures/mosaic-rasters.json'
import phenomenaJson from './fixtures/phenomena.json'
import productsJson from './fixtures/products.json'
import radarsJson from './fixtures/radars.json'
import rastersJson from './fixtures/rasters.json'
import vwpJson from './fixtures/vwp.json'
import windJson from './fixtures/wind.json'
import { buildHealth, pickClosest, pickClosestBy, toLightningMeta, toMosaicMeta, toPhenomenon, toRasterMeta, toWindMeta } from './mappers'
import type { Dal, RasterLookupMode } from './types'

// Las grabaciones incluyen created_at (columna NOT NULL, grabada tal cual);
// el DAL la ignora igual que las SELECT del live no la piden.
const radars = radarsJson as RadarRow[]
const products = productsJson as ProductRow[]
const rasters = rastersJson as (RasterRow & { created_at: string })[]
const phenomena = phenomenaJson as (PhenomenonRow & { created_at: string })[]
const vwp = vwpJson as (VwpRow & { created_at: string })[]
// wind es SINTÉTICO (scripts/make-wind-fixture.mjs) hasta que el pipeline
// implemente la ingesta GFS — misma forma que la tabla propuesta.
const wind = windJson as (WindGridRow & { created_at: string })[]
// lightning es SINTÉTICO (scripts/make-lightning-fixture.mjs) hasta que el
// pipeline implemente la ingesta GLM — misma forma que la tabla propuesta.
const lightning = lightningJson as (LightningBucketRow & { created_at: string })[]

// mosaico es SINTÉTICO (scripts/make-mosaic-fixture.mjs): re-grabar hoy
// destruiría el caso e2e BYX 03:08:18 (COGs irreproducibles tras la purga
// de 72 h). Misma forma que las tablas de 0002_mosaic.sql.
const mosaicDomains = mosaicDomainsJson as (MosaicDomainRow & {
  created_at: string
  updated_at: string
})[]
const mosaicDomainSites = mosaicDomainSitesJson as { domain_id: string, site_id: string }[]
const mosaicRasters = mosaicRastersJson as (MosaicRasterRow & { created_at: string })[]

const byVolTime = <T extends { vol_time: string }>(a: T, b: T) =>
  a.vol_time.localeCompare(b.vol_time)

const bySlotTime = <T extends { slot_time: string }>(a: T, b: T) =>
  a.slot_time.localeCompare(b.slot_time)

const toMeta = (row: MosaicRasterRow & { created_at: string }, base: string | null) => {
  const { size_bytes: _size, created_at: _created, ...cols } = row
  return toMosaicMeta(cols, base)
}

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

  async listWindTimes(site: string, day: string, level: WindLevel): Promise<WindGridMeta[]> {
    const { from, to } = dayRangePadded(day, WIND_DAY_PAD_S)
    return wind
      .filter(w =>
        w.site_id === site && w.level === level && w.valid_time >= from && w.valid_time < to,
      )
      .sort((a, b) => a.valid_time.localeCompare(b.valid_time))
      .map(({ size_bytes: _size, created_at: _created, ...row }) => toWindMeta(row, this.r2BaseUrl))
  }

  async listLightningBuckets(site: string, day: string): Promise<LightningBucketMeta[]> {
    const { from, to } = dayRangePadded(day, LIGHTNING_DAY_PAD_S)
    return lightning
      .filter(b => b.site_id === site && b.bucket_start >= from && b.bucket_start < to)
      .sort((a, b) => a.bucket_start.localeCompare(b.bucket_start))
      .map(({ size_bytes: _size, created_at: _created, ...row }) => toLightningMeta(row, this.r2BaseUrl))
  }

  async listMosaicDomains(): Promise<MosaicDomain[]> {
    return [...mosaicDomains]
      .sort((a, b) => a.domain_id.localeCompare(b.domain_id))
      .map(({ created_at: _created, updated_at: _updated, ...row }) => ({
        ...row,
        site_ids: mosaicDomainSites
          .filter(m => m.domain_id === row.domain_id)
          .map(m => m.site_id)
          .sort(),
      }))
  }

  async listMosaicRasters(
    domain: string,
    productCode: number,
    day: string,
  ): Promise<MosaicRasterMeta[]> {
    const { from, to } = dayRange(day)
    return mosaicRasters
      .filter(m =>
        m.domain_id === domain
        && m.product_code === productCode
        && m.slot_time >= from
        && m.slot_time < to,
      )
      .sort(bySlotTime)
      .map(row => toMeta(row, this.r2BaseUrl))
  }

  async findMosaicRaster(
    domain: string,
    productCode: number,
    t: string,
    mode: RasterLookupMode,
  ) {
    const series = mosaicRasters
      .filter(m => m.domain_id === domain && m.product_code === productCode)
      .sort(bySlotTime)

    let row: (MosaicRasterRow & { created_at: string }) | null
    if (mode === 'next') {
      row = series.find(m => m.slot_time > t) ?? null
    }
    else if (mode === 'prev') {
      row = series.findLast(m => m.slot_time < t) ?? null
    }
    else {
      const prev = series.findLast(m => m.slot_time <= t) ?? null
      const next = series.find(m => m.slot_time >= t) ?? null
      row = pickClosestBy(prev, next, t, m => m.slot_time)
    }
    return row ? toMeta(row, this.r2BaseUrl) : null
  }

  async health(now: Date): Promise<Health> {
    const rows = [...radars].sort((a, b) => a.site_id.localeCompare(b.site_id))
    return buildHealth(rows, now)
  }
}
