// GET /api/phenomena/times?site=AMX&day=2026-07-11 — vol_times con
// fenómenos del día UTC. Índice para el join temporal cliente (D24):
// el frame mostrado se casa con el volumen de fenómenos más cercano.
import { zSiteDay } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, day } = parseQueryParams(event, zSiteDay)
  const times = await useDal(event).listPhenomenaTimes(site, day)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return times
})
