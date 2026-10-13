// Handler común de /api/mosaic/rasters/{closest,next,prev} — solo cambia el modo.
import { zDomainProductTime } from '../../shared/contract'
import { useDal } from './index'
import { parseQueryParams } from './params'
import type { RasterLookupMode } from './types'

export function defineMosaicLookupHandler(mode: RasterLookupMode) {
  return defineEventHandler(async (event) => {
    const { domain, product, t } = parseQueryParams(event, zDomainProductTime)
    const raster = await useDal(event).findMosaicRaster(domain, product, t, mode)
    if (!raster) {
      throw createError({
        statusCode: 404,
        statusMessage: `Sin mosaico ${mode} para (${domain}, ${product}, ${t})`,
      })
    }
    setResponseHeader(event, 'Cache-Control', 'public, max-age=15')
    return raster
  })
}
