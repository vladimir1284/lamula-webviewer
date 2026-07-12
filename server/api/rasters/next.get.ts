// GET /api/rasters/next?site=AMX&product=153&t=… — siguiente estricto.
import { defineRasterLookupHandler } from '../../dal/raster-route'

export default defineRasterLookupHandler('next')
