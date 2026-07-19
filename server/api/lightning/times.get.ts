// GET /api/lightning/times?site=AMX&day=2026-07-11 — cubos de rayos del
// día UTC ±900 s (metadata + lightning_url). Índice para el join por
// ventana de observación en cliente; el JSON de strikes se descarga
// directo de R2, como los COGs y el viento.
import { zSiteDay } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, day } = parseQueryParams(event, zSiteDay)
  const buckets = await useDal(event).listLightningBuckets(site, day)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return buckets
})
