// GET /api/phenomena?site=AMX&vol_time=… — overlay del frame mostrado.
import { zSiteVolTime } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, vol_time } = parseQueryParams(event, zSiteVolTime)
  const phenomena = await useDal(event).listPhenomena(site, vol_time)
  // Inmutable una vez escrito para un vol_time dado
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
  return phenomena
})
