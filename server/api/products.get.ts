// GET /api/products — descriptores mínimos; el catálogo rico vive en el viewer.
import { useDal } from '../dal'

export default defineEventHandler(async (event) => {
  const products = await useDal(event).listProducts()
  setResponseHeader(event, 'Cache-Control', 'public, max-age=60')
  return products
})
