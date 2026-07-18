// GET /api/wind/times?site=AMX&day=2026-07-11 — grillas de viento GFS del
// día UTC ±2 h (metadata + wind_url). Índice para el join temporal cliente
// (D24); el JSON u/v se descarga directo de R2, como los COGs.
import { zSiteDay } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, day } = parseQueryParams(event, zSiteDay)
  const grids = await useDal(event).listWindTimes(site, day)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return grids
})
