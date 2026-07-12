// GET /api/phenomena/series?site=AMX&cell_id=A0 — serie cross-volumen
// por cell_id del RPG (estable entre volúmenes) para charts de tendencia.
import { zSiteCell } from '../../../shared/contract'
import { useDal } from '../../dal'
import { parseQueryParams } from '../../dal/params'

export default defineEventHandler(async (event) => {
  const { site, cell_id } = parseQueryParams(event, zSiteCell)
  const series = await useDal(event).listPhenomenaByCell(site, cell_id)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return series
})
