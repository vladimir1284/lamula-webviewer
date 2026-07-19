// Schemas Zod del contrato: validan filas D1 (contract/fixture tests) y
// parámetros de query de las server routes. Espejo 1:1 de types.ts.
import { z } from 'zod'
import { PHENOMENON_KINDS, PRODUCT_KINDS } from './types'

/** Timestamp del contrato: ISO-8601 UTC naive, comparable lexicográficamente. */
export const ISO_NAIVE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

export const zIsoNaive = z.string().regex(ISO_NAIVE_RE, 'ISO-8601 UTC sin zona (YYYY-MM-DDTHH:MM:SS)')
export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'día YYYY-MM-DD')
export const zSiteId = z.string().regex(/^[A-Z0-9]{3}$/, 'site_id de 3 chars (AMX)')
export const zProductCode = z.coerce.number().int().positive()

// ── Filas D1 ───────────────────────────────────────────────────────────

export const zRadarRow = z.object({
  site_id: zSiteId,
  icao: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  height_m: z.number(),
  proj4: z.string().startsWith('+proj=aeqd'),
  first_seen_at: zIsoNaive,
  last_seen_at: zIsoNaive,
})

export const zProductRow = z.object({
  code: z.number().int().positive(),
  mnemonic: z.string().min(3),
  unit: z.string().nullable(),
  kind: z.enum(PRODUCT_KINDS),
})

export const zRasterRow = z.object({
  site_id: zSiteId,
  product_code: z.number().int().positive(),
  vol_time: zIsoNaive,
  r2_key: z.string().endsWith('.tif'),
  size_bytes: z.number().int().positive(),
  el_angle: z.number().nullable(),
  vcp: z.number().int().nullable(),
  value_scale: z.number(),
  value_offset: z.number(),
  max_level: z.number().int().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cell_m: z.number().positive(),
})

export const zPhenomenonRow = z.object({
  site_id: zSiteId,
  product_code: z.number().int().positive(),
  vol_time: zIsoNaive,
  kind: z.enum(PHENOMENON_KINDS),
  cell_id: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  azimuth_deg: z.number().nullable(),
  range_km: z.number().nullable(),
  // attrs viaja como TEXT JSON; el DAL lo parsea a objeto
  attrs: z.string().refine((s) => {
    try {
      const v: unknown = JSON.parse(s)
      return typeof v === 'object' && v !== null && !Array.isArray(v)
    }
    catch {
      return false
    }
  }, 'attrs debe ser un objeto JSON serializado'),
})

export const zVwpRow = z.object({
  site_id: zSiteId,
  vol_time: zIsoNaive,
  height_ft: z.number().int().positive(),
  wind_dir_deg: z.number().min(0).max(360),
  wind_speed_kt: z.number().min(0),
  rms_kt: z.number().nullable(),
})

export const zWindGridRow = z.object({
  site_id: zSiteId,
  valid_time: zIsoNaive,
  cycle_time: zIsoNaive,
  forecast_hour: z.number().int().min(0),
  model: z.string().min(1),
  r2_key: z.string().endsWith('.json'),
  size_bytes: z.number().int().positive(),
})

/** JSON u/v de R2 — validación en cliente antes de alimentar partículas.
 * `.refine` garantiza que u/v cubren la grilla completa (nx·ny). */
export const zWindGridFile = z.object({
  header: z.object({
    nx: z.number().int().min(2),
    ny: z.number().int().min(2),
    lo1: z.number().min(-180).max(180),
    la1: z.number().min(-90).max(90),
    dx: z.number().positive(),
    dy: z.number().positive(),
    refTime: z.string(),
    forecastHour: z.number().int().min(0),
  }),
  u: z.array(z.number()),
  v: z.array(z.number()),
}).refine(
  (f) => f.u.length === f.header.nx * f.header.ny && f.v.length === f.u.length,
  'u/v deben tener exactamente nx·ny valores',
)

export const zLightningBucketRow = z.object({
  site_id: zSiteId,
  bucket_start: zIsoNaive,
  bucket_s: z.number().int().positive(),
  strike_count: z.number().int().min(0),
  r2_key: z.string().endsWith('.json').nullable(),
  size_bytes: z.number().int().positive().nullable(),
  source: z.string().min(1),
})

/** JSON de cubo de rayos en R2 — validación en cliente antes de animar.
 * Posiciones extra por strike se toleran (extensión futura, como attrs);
 * offsets fuera de [0, bucket_s) son fichero corrupto → se rechaza entero
 * (mismo criterio estricto que zWindGridFile). */
export const zLightningBucketFile = z.object({
  site: zSiteId,
  bucket_start: zIsoNaive,
  bucket_s: z.number().int().positive(),
  strikes: z.array(
    z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().min(0),
    ]).rest(z.unknown()),
  ),
}).refine(
  f => f.strikes.every(s => s[2] < f.bucket_s),
  'offset_s de cada strike debe caer en [0, bucket_s)',
)

// ── Parámetros de query de las server routes ───────────────────────────

export const zSiteProductDay = z.object({
  site: zSiteId,
  product: zProductCode,
  day: zDay,
})

export const zSiteProductTime = z.object({
  site: zSiteId,
  product: zProductCode,
  t: zIsoNaive,
})

export const zSiteDay = z.object({
  site: zSiteId,
  day: zDay,
})

export const zSiteVolTime = z.object({
  site: zSiteId,
  vol_time: zIsoNaive,
})

export const zSiteCell = z.object({
  site: zSiteId,
  cell_id: z.string().min(1).max(8),
})
