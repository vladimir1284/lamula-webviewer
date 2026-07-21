// GET /api/wind/times?site=AMX&day=2026-07-11&level=10m — grillas de viento
// GFS del día UTC ±2 h (metadata + wind_url), un nivel a la vez (level
// ausente → DEFAULT_WIND_LEVEL, back-compat). Índice para el join temporal
// cliente (D24); el JSON u/v se descarga directo de R2, como los COGs.
import { zSiteDayLevel } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, day, level } = parseQueryParams(event, zSiteDayLevel)
  const grids = await useDal(event).listWindTimes(site, day, level)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return grids
})
