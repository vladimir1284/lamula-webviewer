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

// ── Viento en grilla (GFS 10 m, ingerido por el pipeline) ──────────────

/** `wind_grids` — una fila por (site_id, valid_time). Contrato propuesto
 * en docs/pipeline-viento.md; hasta que el pipeline lo mergee el DDL vive
 * en tests/contract/proposed/. */
export interface WindGridRow {
  site_id: string
  /** momento al que aplica el campo, ISO-8601 UTC naive (como vol_time) */
  valid_time: string
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
