// Adaptador live: Postgres directo (solo SELECT — decisión 17) + URLs R2.
import type {
  Health,
  LightningBucketMeta,
  LightningBucketRow,
  Phenomenon,
  PhenomenonRow,
  Product,
  Radar,
  RasterMeta,
  RasterRow,
  VwpLevel,
  WindGridMeta,
  WindGridRow,
  WindLevel,
} from '../../shared/contract'
import { dayRange, dayRangePadded, LIGHTNING_DAY_PAD_S, WIND_DAY_PAD_S } from '../../shared/contract'
import { buildHealth, pickClosest, toLightningMeta, toPhenomenon, toRasterMeta, toWindMeta } from './mappers'
import type { Dal, PgLike, RasterLookupMode } from './types'

type RasterCols = Omit<RasterRow, 'size_bytes'>

const RASTER_COLS
  = 'site_id, product_code, vol_time, r2_key, el_angle, vcp, '
    + 'value_scale, value_offset, max_level, width, height, cell_m'

const PHENOMENON_COLS
  = 'site_id, product_code, vol_time, kind, cell_id, lat, lon, azimuth_deg, range_km, attrs'

export class LiveDal implements Dal {
  constructor(
    private readonly db: PgLike,
    private readonly r2BaseUrl: string | null,
  ) {}

  async listRadars(): Promise<Radar[]> {
    return this.db.query<Radar>(
      'SELECT site_id, icao, lat, lon, height_m, proj4, last_seen_at FROM radars ORDER BY site_id',
    )
  }

  async listProducts(): Promise<Product[]> {
    return this.db.query<Product>('SELECT code, mnemonic, unit, kind FROM products ORDER BY code')
  }

  async listRasterTimes(site: string, productCode: number, day: string): Promise<string[]> {
    const { from, to } = dayRange(day)
    const results = await this.db.query<{ vol_time: string }>(
      'SELECT vol_time FROM rasters '
      + 'WHERE site_id = $1 AND product_code = $2 AND vol_time >= $3 AND vol_time < $4 '
      + 'ORDER BY vol_time',
      [site, productCode, from, to],
    )
    return results.map(r => r.vol_time)
  }

  async listRasters(site: string, productCode: number, day: string): Promise<RasterMeta[]> {
    const { from, to } = dayRange(day)
    const results = await this.db.query<RasterCols>(
      `SELECT ${RASTER_COLS} FROM rasters `
      + 'WHERE site_id = $1 AND product_code = $2 AND vol_time >= $3 AND vol_time < $4 '
      + 'ORDER BY vol_time',
      [site, productCode, from, to],
    )
    return results.map(row => toRasterMeta(row, this.r2BaseUrl))
  }

  async findRaster(site: string, productCode: number, t: string, mode: RasterLookupMode) {
    const one = async (cmp: string, order: string) => {
      const rows = await this.db.query<RasterCols>(
        `SELECT ${RASTER_COLS} FROM rasters `
        + `WHERE site_id = $1 AND product_code = $2 AND vol_time ${cmp} $3 `
        + `ORDER BY vol_time ${order} LIMIT 1`,
        [site, productCode, t],
      )
      return rows[0] ?? null
    }

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

  async listPhenomenaTimes(site: string, day: string): Promise<string[]> {
    const { from, to } = dayRange(day)
    const results = await this.db.query<{ vol_time: string }>(
      'SELECT DISTINCT vol_time FROM phenomena '
      + 'WHERE site_id = $1 AND vol_time >= $2 AND vol_time < $3 ORDER BY vol_time',
      [site, from, to],
    )
    return results.map(r => r.vol_time)
  }

  async listPhenomena(site: string, volTime: string): Promise<Phenomenon[]> {
    const results = await this.db.query<PhenomenonRow>(
      `SELECT ${PHENOMENON_COLS} FROM phenomena `
      + 'WHERE site_id = $1 AND vol_time = $2 ORDER BY kind, cell_id',
      [site, volTime],
    )
    return results.map(toPhenomenon)
  }

  async listPhenomenaByCell(site: string, cellId: string): Promise<Phenomenon[]> {
    const results = await this.db.query<PhenomenonRow>(
      `SELECT ${PHENOMENON_COLS} FROM phenomena `
      + 'WHERE site_id = $1 AND cell_id = $2 ORDER BY vol_time',
      [site, cellId],
    )
    return results.map(toPhenomenon)
  }

  async listVwpTimes(site: string, day: string): Promise<string[]> {
    const { from, to } = dayRange(day)
    const results = await this.db.query<{ vol_time: string }>(
      'SELECT DISTINCT vol_time FROM vwp '
      + 'WHERE site_id = $1 AND vol_time >= $2 AND vol_time < $3 ORDER BY vol_time',
      [site, from, to],
    )
    return results.map(r => r.vol_time)
  }

  async listVwp(site: string, volTime: string): Promise<VwpLevel[]> {
    return this.db.query<VwpLevel>(
      'SELECT site_id, vol_time, height_ft, wind_dir_deg, wind_speed_kt, rms_kt '
      + 'FROM vwp WHERE site_id = $1 AND vol_time = $2 ORDER BY height_ft',
      [site, volTime],
    )
  }

  async listWindTimes(site: string, day: string, level: WindLevel): Promise<WindGridMeta[]> {
    const { from, to } = dayRangePadded(day, WIND_DAY_PAD_S)
    const results = await this.db.query<Omit<WindGridRow, 'size_bytes'>>(
      'SELECT site_id, valid_time, level, cycle_time, forecast_hour, model, r2_key FROM wind_grids '
      + 'WHERE site_id = $1 AND level = $2 AND valid_time >= $3 AND valid_time < $4 ORDER BY valid_time',
      [site, level, from, to],
    )
    return results.map(row => toWindMeta(row, this.r2BaseUrl))
  }

  async listLightningBuckets(site: string, day: string): Promise<LightningBucketMeta[]> {
    const { from, to } = dayRangePadded(day, LIGHTNING_DAY_PAD_S)
    const results = await this.db.query<Omit<LightningBucketRow, 'size_bytes'>>(
      'SELECT site_id, bucket_start, bucket_s, strike_count, r2_key, source '
      + 'FROM lightning_buckets '
      + 'WHERE site_id = $1 AND bucket_start >= $2 AND bucket_start < $3 ORDER BY bucket_start',
      [site, from, to],
    )
    return results.map(row => toLightningMeta(row, this.r2BaseUrl))
  }

  async health(now: Date): Promise<Health> {
    const results = await this.db.query<{ site_id: string, last_seen_at: string }>(
      'SELECT site_id, last_seen_at FROM radars ORDER BY site_id',
    )
    return buildHealth(results, now)
  }
}
