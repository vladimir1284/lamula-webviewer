// GET /api/mosaic/rasters/day?domain=GULF&product=153&day=2026-07-11
// Metadata completa (batch) del día UTC, slot_time ascendente — timeline y
// pool de frames en un solo request, igual que /api/rasters/day.
import { zDomainProductDay } from '../../../../shared/contract'
import { useDal } from '../../../dal'
import { parseQueryParams } from '../../../dal/params'

export default defineEventHandler(async (event) => {
  const { domain, product, day } = parseQueryParams(event, zDomainProductDay)
  const rasters = await useDal(event).listMosaicRasters(domain, product, day)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=30')
  return rasters
})
