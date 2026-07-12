// Adaptador live: binding D1 (solo SELECT — decisión 17) + URLs R2.
import type {
  Health,
  Phenomenon,
  PhenomenonRow,
  Product,
  Radar,
  RasterRow,
  VwpLevel,
} from '../../shared/contract'
import { dayRange } from '../../shared/contract'
import { buildHealth, pickClosest, toPhenomenon, toRasterMeta } from './mappers'
import type { D1Like, Dal, RasterLookupMode } from './types'

type RasterCols = Omit<RasterRow, 'size_bytes'>

const RASTER_COLS
  = 'site_id, product_code, vol_time, r2_key, el_angle, vcp, '
    + 'value_scale, value_offset, max_level, width, height, cell_m'

const PHENOMENON_COLS
  = 'site_id, product_code, vol_time, kind, cell_id, lat, lon, azimuth_deg, range_km, attrs'

export class LiveDal implements Dal {
  constructor(
    private readonly db: D1Like,
    private readonly r2BaseUrl: string | null,
  ) {}

  async listRadars(): Promise<Radar[]> {
    const { results } = await this.db
      .prepare(
        'SELECT site_id, icao, lat, lon, height_m, proj4, last_seen_at FROM radars ORDER BY site_id',
      )
      .all<Radar>()
    return results
  }

  async listProducts(): Promise<Product[]> {
    const { results } = await this.db
      .prepare('SELECT code, mnemonic, unit, kind FROM products ORDER BY code')
      .all<Product>()
    return results
  }

  async listRasterTimes(site: string, productCode: number, day: string): Promise<string[]> {
    const { from, to } = dayRange(day)
    const { results } = await this.db
      .prepare(
        'SELECT vol_time FROM rasters '
        + 'WHERE site_id = ? AND product_code = ? AND vol_time >= ? AND vol_time < ? '
        + 'ORDER BY vol_time',
      )
      .bind(site, productCode, from, to)
      .all<{ vol_time: string }>()
    return results.map(r => r.vol_time)
  }

  async findRaster(site: string, productCode: number, t: string, mode: RasterLookupMode) {
    const one = (cmp: string, order: string) =>
      this.db
        .prepare(
          `SELECT ${RASTER_COLS} FROM rasters `
          + `WHERE site_id = ? AND product_code = ? AND vol_time ${cmp} ? `
          + `ORDER BY vol_time ${order} LIMIT 1`,
        )
        .bind(site, productCode, t)
        .first<RasterCols>()

    let row: RasterCols | null
    if (mode === 'next') {
      row = await one('>', 'ASC')
    }
    else if (mode === 'prev') {
      row = await one('<', 'DESC')
    }
    else {
      const [prev, next] = await Promise.all([one('<=', 'DESC'), one('>=', 'ASC')])
      row = pickClosest(prev, next, t)
    }
    return row ? toRasterMeta(row, this.r2BaseUrl) : null
  }

  async listPhenomena(site: string, volTime: string): Promise<Phenomenon[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${PHENOMENON_COLS} FROM phenomena `
        + 'WHERE site_id = ? AND vol_time = ? ORDER BY kind, cell_id',
      )
      .bind(site, volTime)
      .all<PhenomenonRow>()
    return results.map(toPhenomenon)
  }

  async listPhenomenaByCell(site: string, cellId: string): Promise<Phenomenon[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${PHENOMENON_COLS} FROM phenomena `
        + 'WHERE site_id = ? AND cell_id = ? ORDER BY vol_time',
      )
      .bind(site, cellId)
      .all<PhenomenonRow>()
    return results.map(toPhenomenon)
  }

  async listVwp(site: string, volTime: string): Promise<VwpLevel[]> {
    const { results } = await this.db
      .prepare(
        'SELECT site_id, vol_time, height_ft, wind_dir_deg, wind_speed_kt, rms_kt '
        + 'FROM vwp WHERE site_id = ? AND vol_time = ? ORDER BY height_ft',
      )
      .bind(site, volTime)
      .all<VwpLevel>()
    return results
  }

  async health(now: Date): Promise<Health> {
    const { results } = await this.db
      .prepare('SELECT site_id, last_seen_at FROM radars ORDER BY site_id')
      .all<{ site_id: string, last_seen_at: string }>()
    return buildHealth(results, now)
  }
}
