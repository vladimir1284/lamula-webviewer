import type { H3Event } from 'h3'
import { ACCESS_COOKIE, callJobsApi, validAccessToken } from '../dal/demo-api'

/** Llama a `jobs-api` con el token de la cookie. Sin `NUXT_JOBS_API_URL` el plano demo no existe (404). */
export async function demoCall(event: H3Event, path: string, opts: { method?: 'GET' | 'POST', query?: Record<string, string>, body?: unknown } = {}) {
  const config = useRuntimeConfig(event)
  if (!config.jobsApiUrl) throw createError({ statusCode: 404 })
  const token = getCookie(event, ACCESS_COOKIE)
  if (!validAccessToken(token)) throw createError({ statusCode: 401, statusMessage: 'Falta el token de acceso' })
  const r = await callJobsApi({ url: config.jobsApiUrl, token, path, ...opts }).catch(() => {
    throw createError({ statusCode: 502, statusMessage: 'jobs-api no responde' })
  })
  if (r.status >= 400) {
    const detail = (r.body as { detail?: unknown } | null)?.detail
    throw createError({ statusCode: r.status === 401 ? 401 : r.status, statusMessage: typeof detail === 'string' ? detail : `jobs-api respondió ${r.status}` })
  }
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return r.body
}
