// GET /api/rasters/times?site=AMX&product=153&day=2026-07-06
// vol_times ascendentes del día UTC (ventana de retención: 72 h).
import { zSiteProductDay } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, product, day } = parseQueryParams(event, zSiteProductDay)
  const times = await useDal(event).listRasterTimes(site, product, day)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return times
})
