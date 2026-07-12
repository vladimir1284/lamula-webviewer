// GET /api/health — frescura por radar (radars.last_seen_at).
import { useDal } from '../dal'

export default defineEventHandler(async (event) => {
  const health = await useDal(event).health(new Date())
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return health
})
