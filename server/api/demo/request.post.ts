// POST /api/demo/request — formulario público de solicitud de acceso (lamula-jobs D20).
// Reenvía a `jobs-api`, que verifica Turnstile (un token de Turnstile solo se puede comprobar una vez: aquí no se
// comprueba) y avisa al dueño por correo. La IP real va en `cf-connecting-ip` para el límite por IP de jobs-api.
import { checkRateLimit } from '../../utils/rate-limit'

const INTERESES = ['huracan', 'dia', 'propias', 'otra']

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.jobsApiUrl) throw createError({ statusCode: 404 })
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'anon'
  if (!checkRateLimit(`demo-request:${ip}`, 10, 600000)) throw createError({ statusCode: 429, statusMessage: 'Demasiados intentos' })
  const b = await readBody<Record<string, unknown>>(event)
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
  const interes = Array.isArray(b?.interes) ? b.interes.filter((i): i is string => typeof i === 'string' && INTERESES.includes(i)) : []
  const body = {
    email: s(b?.email, 320), org: s(b?.org, 200), cargo: s(b?.cargo, 120) || null, interes,
    radar: s(b?.radar, 120) || null, comentario: s(b?.comentario, 2000) || null,
    acepta_aviso: b?.acepta_aviso === true, turnstile: s(b?.turnstile, 2048),
  }
  const res = await fetch(`${config.jobsApiUrl.replace(/\/$/, '')}/v1/public/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip !== 'anon' ? { 'cf-connecting-ip': ip } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  }).catch(() => { throw createError({ statusCode: 502, statusMessage: 'jobs-api no responde' }) })
  if (res.status !== 202) {
    const d = (await res.json().catch(() => null)) as { detail?: unknown } | null
    throw createError({ statusCode: [403, 422, 429].includes(res.status) ? res.status : 502, statusMessage: typeof d?.detail === 'string' ? d.detail : `jobs-api respondió ${res.status}` })
  }
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { recibida: true }
})
