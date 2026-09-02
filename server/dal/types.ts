// Interfaz única de datos (decisión 3): nada por encima del DAL sabe si
// los datos vienen del binding D1 real o de fixtures grabadas.
import type {
  Health,
  LightningBucketMeta,
  Phenomenon,
  Product,
  Radar,
  RasterMeta,
  VwpLevel,
  WindGridMeta,
  WindLevel,
} from '../../shared/contract'

export type RasterLookupMode = 'closest' | 'next' | 'prev'

export interface Dal {
  listRadars(): Promise<Radar[]>
  listProducts(): Promise<Product[]>
  /** vol_times ascendentes de un (site, product) dentro de un día UTC. */
  listRasterTimes(site: string, productCode: number, day: string): Promise<string[]>
  /** Metadata completa (batch) de un (site, product) dentro de un día UTC, ascendente — timeline y frames de animación en un solo request. */
  listRasters(site: string, productCode: number, day: string): Promise<RasterMeta[]>
  /** Raster más cercano / siguiente estricto / anterior estricto a t. */
  findRaster(
    site: string,
    productCode: number,
    t: string,
    mode: RasterLookupMode,
  ): Promise<RasterMeta | null>
  /** vol_times ascendentes con fenómenos de un site dentro de un día UTC — índice para el join temporal cliente (D24). */
  listPhenomenaTimes(site: string, day: string): Promise<string[]>
  /** Fenómenos del volumen mostrado (overlay del frame). */
  listPhenomena(site: string, volTime: string): Promise<Phenomenon[]>
  /** Serie cross-volumen por cell_id (charts de tendencia). */
  listPhenomenaByCell(site: string, cellId: string): Promise<Phenomenon[]>
  /** vol_times ascendentes con perfil VWP de un site dentro de un día UTC — índice para el join temporal cliente (D24). */
  listVwpTimes(site: string, day: string): Promise<string[]>
  /** Niveles del perfil de viento de un volumen, por altura ascendente. */
  listVwp(site: string, volTime: string): Promise<VwpLevel[]>
  /** Grillas de viento GFS de un site/nivel en un día UTC ±2 h
   * (WIND_DAY_PAD_S), ascendente por valid_time — índice para el join
   * temporal cliente (D24). Nivel forma parte de la PK desde
   * 0005_wind_levels.sql — un nivel a la vez, no se traen los 4 juntos. */
  listWindTimes(site: string, day: string, level: WindLevel): Promise<WindGridMeta[]>
  /** Cubos de rayos de un site en un día UTC ±900 s (LIGHTNING_DAY_PAD_S),
   * ascendente por bucket_start — índice para el join por ventana cliente. */
  listLightningBuckets(site: string, day: string): Promise<LightningBucketMeta[]>
  /** Frescura por radar desde radars.last_seen_at. */
  health(now: Date): Promise<Health>
}

/**
 * Subconjunto estructural del cliente Postgres que usa el adaptador
 * live — permite testearlo contra better-sqlite3 con el schema real
 * del pipeline (ver tests/helpers/pg-sqlite.ts::asPg).
 *
 * `sql` usa placeholders numerados ($1, $2, …) — sintaxis Postgres
 * nativa, sin traducción en el adaptador de producción (server/dal/pg.ts).
 */
export interface PgLike {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
}
