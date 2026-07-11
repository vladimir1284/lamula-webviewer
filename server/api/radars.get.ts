// Vista del consumidor sobre `radars` (contrato: docs/contrato.md).
// Solo SELECT — este proyecto jamás escribe en D1.
interface RadarRow {
  site_id: string
  icao: string | null
  lat: number
  lon: number
  height_m: number
  proj4: string
  last_seen_at: string
}

export default defineEventHandler(async (event) => {
  const db = event.context.cloudflare?.env?.DB
  if (!db) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Binding D1 "DB" no configurado en este entorno',
    })
  }

  const { results } = await db
    .prepare(
      'SELECT site_id, icao, lat, lon, height_m, proj4, last_seen_at FROM radars ORDER BY site_id',
    )
    .all<RadarRow>()

  return results
})
