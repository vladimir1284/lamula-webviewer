// GET /api/demo/cases — casos preparados ya procesados (D19). Sin token: son públicos y de solo lectura.
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.jobsApiUrl) throw createError({ statusCode: 404 })
  const res = await fetch(`${config.jobsApiUrl.replace(/\/$/, '')}/v1/public/cases`, { signal: AbortSignal.timeout(10000) })
    .catch(() => { throw createError({ statusCode: 502, statusMessage: 'jobs-api no responde' }) })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `jobs-api respondió ${res.status}` })
  setResponseHeader(event, 'Cache-Control', 'public, max-age=60')
  return await res.json()
})
