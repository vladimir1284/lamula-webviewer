// Interfaz única de datos (decisión 3): nada por encima del DAL sabe si
// los datos vienen del binding D1 real o de fixtures grabadas.
import type {
  Health,
  Phenomenon,
  Product,
  Radar,
  RasterMeta,
  VwpLevel,
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
  /** Frescura por radar desde radars.last_seen_at. */
  health(now: Date): Promise<Health>
}

/**
 * Subconjunto estructural de D1Database que usa el adaptador live —
 * permite testearlo contra better-sqlite3 con el schema real del pipeline.
 */
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike
  all<T>(): Promise<{ results: T[] }>
  first<T>(): Promise<T | null>
}

export interface D1Like {
  prepare(sql: string): D1PreparedLike
}
