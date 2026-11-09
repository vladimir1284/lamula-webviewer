// GET /api/demo/catalog/<sites|volumes|cases|cases/x> — catálogo de jobs-api con el token de la cookie.
import { catalogPathAllowed } from '../../../dal/demo-api'

export default defineEventHandler((event) => {
  const path = getRouterParam(event, 'path') ?? ''
  if (!catalogPathAllowed(path)) throw createError({ statusCode: 404 })
  const query = Object.fromEntries(Object.entries(getQuery(event)).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  return demoCall(event, `/v1/catalog/${path}`, { query })
})
