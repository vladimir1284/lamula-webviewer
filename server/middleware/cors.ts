// CORS acotado a los endpoints públicos de feedback (decisión 50).
//
// Por qué hace falta: lamula-process es una SPA estática en otro origen y manda la
// cabecera `x-feedback-token`, que no es "simple" — el navegador dispara un preflight
// OPTIONS antes del POST. Sin este middleware ese OPTIONS devuelve 404 (la ruta solo
// tiene `index.post.ts`), así que el envío cross-origin no sale nunca.
//
// El middleware de Nitro corre ANTES del enrutado: por eso el preflight se puede
// contestar acá sin añadir un handler `.options.ts` por ruta.
//
// Qué NO cubre, a propósito:
//   - `/api/admin/**`: se autentica con cookie de sesión; abrirlo a otros orígenes
//     sería un agujero, no una comodidad.
//   - El resto de `/api/**`: nadie los pide cross-origin.
//
// Sin NUXT_CORS_ORIGINS el comportamiento es el de siempre (ninguna cabecera CORS).
import { corsHeaders, isCorsPath, parseAllowedOrigins } from '../utils/cors'

export default defineEventHandler((event) => {
  if (!isCorsPath(event.path)) return

  const origin = getHeader(event, 'origin')
  if (!origin) return

  const config = useRuntimeConfig(event)
  const headers = corsHeaders(origin, parseAllowedOrigins(config.corsOrigins))
  if (!headers) return

  setResponseHeaders(event, headers)

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
