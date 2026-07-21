// Vista del consumidor sobre el contrato de datos (docs/contrato.md).
// La fuente de verdad es db/migrations/ de nexrad-l3-pipeline; aquí solo
// se declaran las formas de las que el viewer depende. Compartido entre
// server routes y cliente.

// ── Filas D1 (como salen de SELECT) ────────────────────────────────────

/** `radars` — catálogo dinámico; nada hardcodeado. */
export interface RadarRow {
  site_id: string
  icao: string | null
  lat: number
  lon: number
  height_m: number
  /** definición AEQD que se registra tal cual con proj4.defs */
  proj4: string
  first_seen_at: string
  last_seen_at: string
}

export const PRODUCT_KINDS = ['raster', 'phenomena', 'vwp'] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]

/** `products` — descriptor mínimo; el catálogo rico vive en este repo. */
export interface ProductRow {
  code: number
  mnemonic: string
  unit: string | null
  kind: ProductKind
}

/** `rasters` — metadata de cada COG en R2 (sin `id`/`created_at`: internos). */
export interface RasterRow {
  site_id: string
  product_code: number
  /** inicio del volumen, ISO-8601 UTC naive */
  vol_time: string
  /** clave literal en R2 — el viewer no construye claves */
  r2_key: string
  size_bytes: number
  /** NULL en derivados de volumen */
  el_angle: number | null
  vcp: number | null
  /** físico = nivel · value_scale + value_offset (niveles ≥ 2) */
  value_scale: number
  value_offset: number
  /** nivel máximo presente (recorte de leyenda) */
  max_level: number | null
  width: number
  height: number
  /** tamaño de celda de la malla AEQD, metros */
  cell_m: number
}

export const PHENOMENON_KINDS = ['hail', 'meso', 'tvs', 'storm_cell'] as const
export type PhenomenonKind = (typeof PHENOMENON_KINDS)[number]

/** `phenomena` — una fila por (site, vol_time, kind, cell_id). */
export interface PhenomenonRow {
  site_id: string
  product_code: number
  vol_time: string
  kind: PhenomenonKind
  /** storm ID del RPG (p.ej. "A0"), estable entre volúmenes */
  cell_id: string | null
  lat: number
  lon: number
  azimuth_deg: number | null
  range_km: number | null
  /** JSON serializado — claves por kind en docs/contrato.md */
  attrs: string
}

/** `vwp` — una fila por (site_id, vol_time, height_ft). Sin componente w. */
export interface VwpRow {
  site_id: string
  vol_time: string
  height_ft: number
  wind_dir_deg: number
  wind_speed_kt: number
  rms_kt: number | null
}

// ── DTOs de la API (/api/*) ────────────────────────────────────────────

/** /api/radars — la fila menos `first_seen_at` (el viewer no lo usa). */
export type Radar = Omit<RadarRow, 'first_seen_at'>

export type Product = ProductRow

/** /api/rasters/* — fila + URL del COG resuelta por el DAL. */
export interface RasterMeta extends Omit<RasterRow, 'size_bytes'> {
  /** URL pública del COG; null si el origen R2 no está configurado */
  cog_url: string | null
}

/** /api/phenomena — fila con `attrs` ya parseado. */
export interface Phenomenon extends Omit<PhenomenonRow, 'attrs'> {
  attrs: Record<string, unknown>
}

export type VwpLevel = VwpRow

// ── Viento en grilla (GFS 0.25°, ingerido por el pipeline) ─────────────

/** Niveles de altura del selector (0005_wind_levels.sql, fase 2). Solo
 * '10m' se ingiere en producción por ahora — 850/700/500 hPa devuelven
 * 0 filas hasta que el pipeline habilite el rollout (ver docs/pipeline-viento.md). */
export const WIND_LEVELS = ['10m', '850hPa', '700hPa', '500hPa'] as const
export type WindLevel = (typeof WIND_LEVELS)[number]

export const WIND_LEVEL_LABELS: Record<WindLevel, string> = {
  '10m': 'Superficie (10 m)',
  '850hPa': '850 hPa',
  '700hPa': '700 hPa',
  '500hPa': '500 hPa',
}

export const DEFAULT_WIND_LEVEL: WindLevel = '10m'

/** `wind_grids` — una fila por (site_id, valid_time, level) desde
 * 0005_wind_levels.sql (PK original: site_id, valid_time — filas viejas
 * backfilleadas con level='10m'). */
export interface WindGridRow {
  site_id: string
  /** momento al que aplica el campo, ISO-8601 UTC naive (como vol_time) */
  valid_time: string
  level: WindLevel
  /** ciclo del modelo, ISO-8601 UTC naive */
  cycle_time: string
  forecast_hour: number
  model: string
  /** clave literal en R2 — el viewer no construye claves */
  r2_key: string
  size_bytes: number
}

/** /api/wind/times — fila + URL del JSON resuelta por el DAL. */
export interface WindGridMeta extends Omit<WindGridRow, 'size_bytes'> {
  /** URL pública del JSON u/v; null si el origen R2 no está configurado */
  wind_url: string | null
}

/** Fichero u/v en R2 (velocity-JSON): grilla regular lon/lat, row-major
 * desde la esquina NO (oeste→este, norte→sur, convención GRIB).
 * u/v en m/s; `la1` = lat norte, `lo1` = lon oeste en [-180, 180). */
export interface WindGridFile {
  header: {
    nx: number
    ny: number
    lo1: number
    la1: number
    dx: number
    dy: number
    /** ciclo del modelo, ISO-8601 con Z */
    refTime: string
    forecastHour: number
  }
  u: number[]
  v: number[]
}

// ── Descargas eléctricas (GLM vía el pipeline, cubos de 300 s) ─────────

/** `lightning_buckets` — una fila por (site_id, bucket_start), SIEMPRE al
 * cerrar el cubo: `strike_count` 0 = cubo cubierto sin descargas (r2_key
 * NULL, sin objeto); sin fila = hueco de ingesta. Contrato propuesto en
 * docs/pipeline-rayos.md; hasta que el pipeline lo mergee el DDL vive en
 * tests/contract/proposed/. */
export interface LightningBucketRow {
  site_id: string
  /** inicio del cubo, ISO-8601 UTC naive, alineado a `bucket_s` */
  bucket_start: string
  /** duración del cubo en segundos (300 por contrato) */
  bucket_s: number
  strike_count: number
  /** clave literal en R2 — null cuando strike_count = 0 */
  r2_key: string | null
  size_bytes: number | null
  source: string
}

/** /api/lightning/times — fila + URL del JSON resuelta por el DAL. */
export interface LightningBucketMeta extends Omit<LightningBucketRow, 'size_bytes'> {
  /** URL pública del JSON; null si no hay objeto o el origen R2 no está configurado */
  lightning_url: string | null
}

/** Descarga: [lon, lat, offset_s desde bucket_start]. Posiciones extra
 * futuras se toleran (mismo espíritu que attrs). */
export type LightningStrike = [number, number, number, ...unknown[]]

/** Fichero de cubo en R2: offsets en [0, bucket_s). */
export interface LightningBucketFile {
  site: string
  bucket_start: string
  bucket_s: number
  strikes: LightningStrike[]
}

/** Umbral de frescura: mismo criterio que FreshnessBadge. */
export const FRESH_MAX_MINUTES = 30

export interface RadarHealth {
  site_id: string
  last_seen_at: string
  minutes_since_last_scan: number
  fresh: boolean
}

/** /api/health — frescura por radar desde radars.last_seen_at. */
export interface Health {
  generated_at: string
  radars: RadarHealth[]
}
