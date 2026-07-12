// GET /api/vwp?site=AMX&vol_time=… — perfil de viento del volumen.
import { zSiteVolTime } from '../../shared/contract'
import { useDal } from '../dal'
import { parseQueryParams } from '../dal/params'

export default defineEventHandler(async (event) => {
  const { site, vol_time } = parseQueryParams(event, zSiteVolTime)
  const levels = await useDal(event).listVwp(site, vol_time)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
  return levels
})
