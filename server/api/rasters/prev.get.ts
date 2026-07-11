// GET /api/rasters/prev?site=AMX&product=153&t=… — anterior estricto.
import { defineRasterLookupHandler } from '../../dal/raster-route'

export default defineRasterLookupHandler('prev')
