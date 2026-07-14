// Claves de `phenomena.attrs` por kind — contrato con nexrad-l3-pipeline
// (tabla canónica en db/README.md de aquel repo; ver docs/contrato.md).
//
// TODAS las claves son opcionales: el GAB de NST pagina de a 6 celdas
// (dbz_max puede faltar), las celdas nuevas no traen past/forecast, y el
// mapper del DAL degrada attrs corrupto a {}. Los parsers son tolerantes
// campo a campo: un valor con tipo inesperado se descarta (→ undefined)
// sin tumbar el resto de la fila. Claves desconocidas (extensiones futuras
// del pipeline: vil_kg_m2, top_kft, poh_pct…) pasan intactas.
//
// Semántica deducida de las grabaciones reales, PENDIENTE de confirmar con
// el experto (puerta M4):
//  - `past` viene reciente→viejo; `forecast` cercano→lejano. La cadena
//    dibujable es past.at(-1) → … → past[0] → posición actual → forecast.
//  - `movement_deg` es convención meteorológica "desde" (el motion real
//    apunta a movement_deg + 180°).
// El test canario de continuidad vive en tests/unit/tracks.spec.ts.
import { z } from 'zod'

/** Punto de track SCIT (packets 23/24): [x_km, y_km] AEQD radar-céntricos. */
export type TrackPoint = [number, number]

export interface StormCellAttrs {
  /** [az_deg, range_nm] posición radar-céntrica del tabular NST */
  azran_nm?: [number, number]
  /** dirección "desde" (meteorológica) del movimiento de la celda */
  movement_deg?: number
  movement_kt?: number
  /** celda nueva en este volumen (sin tracks) */
  new?: boolean
  /** posiciones pasadas, reciente→viejo */
  past?: TrackPoint[]
  /** posiciones pronosticadas, cercano→lejano */
  forecast?: TrackPoint[]
  /** reflectividad máxima (dBZ) — del GAB, puede faltar (pagina de a 6) */
  dbz_max?: number
  /** altura del máximo (kft) — acompaña a dbz_max */
  dbz_max_height_kft?: number
}

export interface MesoAttrs {
  radius_km?: number
  azran_nm?: [number, number]
  /** cell_id de la celda NST asociada — el cell_id de la fila meso es el ID del mesociclón */
  storm_id?: string
  strength_rank?: number
  msi?: number
  /** señal TVS del feed (NTV no fluye; esta columna del NMD es la señal) */
  tvs?: boolean
  low_level_rv_kt?: number
  low_level_dv_kt?: number
  base_kft?: number
  depth_kft?: number
  depth_stmrel_pct?: number
  max_rv_kft?: number
  max_rv_kt?: number
  movement_deg?: number
  movement_kt?: number
}

const tolerant = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)

const zPair = tolerant(z.tuple([z.number(), z.number()]))
const zTrack = tolerant(z.array(z.tuple([z.number(), z.number()])))
const zNum = tolerant(z.number())
const zBool = tolerant(z.boolean())

export const zStormCellAttrs = z
  .object({
    azran_nm: zPair,
    movement_deg: zNum,
    movement_kt: zNum,
    new: zBool,
    past: zTrack,
    forecast: zTrack,
    dbz_max: zNum,
    dbz_max_height_kft: zNum,
  })
  .loose()

export const zMesoAttrs = z
  .object({
    radius_km: zNum,
    azran_nm: zPair,
    storm_id: tolerant(z.string()),
    strength_rank: zNum,
    msi: zNum,
    tvs: zBool,
    low_level_rv_kt: zNum,
    low_level_dv_kt: zNum,
    base_kft: zNum,
    depth_kft: zNum,
    depth_stmrel_pct: zNum,
    max_rv_kft: zNum,
    max_rv_kt: zNum,
    movement_deg: zNum,
    movement_kt: zNum,
  })
  .loose()

/** Vista tipada de attrs de una fila kind='storm_cell'. Nunca lanza. */
export function stormCellAttrs(attrs: Record<string, unknown>): StormCellAttrs {
  return zStormCellAttrs.parse(attrs) as StormCellAttrs
}

/** Vista tipada de attrs de una fila kind='meso'. Nunca lanza. */
export function mesoAttrs(attrs: Record<string, unknown>): MesoAttrs {
  return zMesoAttrs.parse(attrs) as MesoAttrs
}
