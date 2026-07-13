// GET /api/vwp/times?site=AMX&day=2026-07-11 — vol_times con perfil VWP
// del día UTC. Índice para el join temporal cliente (D24).
import { zSiteDay } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, day } = parseQueryParams(event, zSiteDay)
  const times = await useDal(event).listVwpTimes(site, day)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return times
})
