// POST /api/demo/session {token} — comprueba el token de acceso contra jobs-api y lo guarda en cookie httpOnly.
import { ACCESS_COOKIE, callJobsApi, validAccessToken } from '../../dal/demo-api'
import { checkRateLimit } from '../../utils/rate-limit'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.jobsApiUrl) throw createError({ statusCode: 404 })
  // Evita que esto sirva para adivinar tokens a martillazos.
  if (!checkRateLimit(`demo-session:${getRequestIP(event, { xForwardedFor: true }) ?? 'anon'}`, 20, 600000)) {
    throw createError({ statusCode: 429, statusMessage: 'Demasiados intentos' })
  }
  const { token } = await readBody<{ token?: string }>(event)
  if (!validAccessToken(token)) throw createError({ statusCode: 401, statusMessage: 'Token no válido' })
  const r = await callJobsApi({ url: config.jobsApiUrl, token, path: '/v1/catalog/cases' }).catch(() => {
    throw createError({ statusCode: 502, statusMessage: 'jobs-api no responde' })
  })
  if (r.status === 401) throw createError({ statusCode: 401, statusMessage: 'Token no válido, caducado o revocado' })
  if (r.status >= 400) throw createError({ statusCode: 502, statusMessage: `jobs-api respondió ${r.status}` })
  setCookie(event, ACCESS_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', secure: getRequestProtocol(event) === 'https', maxAge: 60 * 60 * 24 * 7,
  })
  return { ok: true }
})
