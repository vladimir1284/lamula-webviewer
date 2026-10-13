// Política de CORS de los endpoints públicos de feedback (decisión 50).
// Funciones puras para poder testearlas sin montar h3; el middleware
// (`server/middleware/cors.ts`) es solo el pegamento.

/** Prefijos que aceptan peticiones cross-origin. `/api/admin/**` NO está, a propósito. */
const CORS_PATHS = ['/api/feedback']

export function isCorsPath(path: string): boolean {
  const clean = path.split('?')[0] ?? ''
  return CORS_PATHS.some(prefix => clean === prefix || clean.startsWith(`${prefix}/`))
}

/** NUXT_CORS_ORIGINS: lista separada por comas. Vacío = nadie, nunca `*`. */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  return (raw ?? '').split(',').map(o => o.trim()).filter(Boolean)
}

/**
 * Cabeceras para un origen concreto, o `null` si no está permitido (y entonces el
 * navegador bloquea la respuesta, que es justo lo que queremos).
 *
 * Sin `access-control-allow-credentials`: la identidad del feedback viaja en la
 * cabecera `x-feedback-token`, no en cookie.
 */
export function corsHeaders(origin: string, allowed: string[]): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null

  return {
    'access-control-allow-origin': origin,
    // Reflejamos el origen: sin Vary, una caché intermedia podría servir la cabecera
    // de un origen a otro distinto.
    'vary': 'Origin',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-feedback-token',
    'access-control-max-age': '86400',
  }
}
