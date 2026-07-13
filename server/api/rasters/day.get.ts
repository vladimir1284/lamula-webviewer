// GET /api/rasters/day?site=AMX&product=153&day=2026-07-11
// Metadata completa (batch) del día UTC, vol_time ascendente — alimenta la
// timeline y el pool de frames de animación en un solo request (F3).
import { zSiteProductDay } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, product, day } = parseQueryParams(event, zSiteProductDay)
  const rasters = await useDal(event).listRasters(site, product, day)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return rasters
})
