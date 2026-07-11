// GET /api/rasters/closest?site=AMX&product=153&t=2026-07-06T15:44:00
import { defineRasterLookupHandler } from '../../dal/raster-route'

export default defineRasterLookupHandler('closest')
