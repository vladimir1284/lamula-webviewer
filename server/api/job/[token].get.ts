// GET /api/job/<token> — estado de un job del plano demo y, de paso, la cookie que lo ata a esta sesión.
// Solo existe con NUXT_JOBS_API_URL; en el viewer de producción responde 404.
import { RASTER_PRODUCTS } from '../../../shared/products'
import { JOB_COOKIE, firstProductWithRasters, resolveJob, validToken } from '../../dal/job-token'
import { useDal } from '../../dal'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const token = getRouterParam(event, 'token')
  if (!config.jobsApiUrl || !validToken(token)) throw createError({ statusCode: 404 })

  const job = await resolveJob(token, { url: config.jobsApiUrl, key: config.jobsInternalKey })
    .catch((e) => { throw createError({ statusCode: 502, statusMessage: String(e.message ?? e) }) })
  if (!job) throw createError({ statusCode: 404, statusMessage: 'El job no existe o caducó' })

  setCookie(event, JOB_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: getRequestProtocol(event) === 'https',
    maxAge: 60 * 60 * 24,
  })

  // El radar y el producto salen del schema del job, y no hay fila hasta que se publica el primer lote.
  let siteId: string | null = null
  let product: number | null = null
  try {
    const dal = useDal(event, token)
    siteId = (await dal.listRadars())[0]?.site_id ?? null
    const days = [...new Set([job.vol_from, job.vol_to].filter((d): d is string => !!d).map(d => d.slice(0, 10)))]
    if (siteId && days.length) {
      product = await firstProductWithRasters(
        (code, day) => dal.listRasterTimes(siteId!, code, day),
        Object.keys(RASTER_PRODUCTS).map(Number),
        days,
      )
    }
  }
  catch { /* el schema puede no estar listo: se informa del estado y nada más */ }

  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { state: job.state, vol_from: job.vol_from, vol_to: job.vol_to, expires_at: job.expires_at, site_id: siteId, product }
})
