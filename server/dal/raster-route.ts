// Handler común de /api/rasters/{closest,next,prev} — solo cambia el modo.
import { zSiteProductTime } from '../../shared/contract'
import { useDal } from './index'
import { parseQueryParams } from './params'
import type { RasterLookupMode } from './types'

export function defineRasterLookupHandler(mode: RasterLookupMode) {
  return defineEventHandler(async (event) => {
    const { site, product, t } = parseQueryParams(event, zSiteProductTime)
    const raster = await useDal(event).findRaster(site, product, t, mode)
    if (!raster) {
      throw createError({
        statusCode: 404,
        statusMessage: `Sin raster ${mode} para (${site}, ${product}, ${t})`,
      })
    }
    setResponseHeader(event, 'Cache-Control', 'public, max-age=15')
    return raster
  })
}
