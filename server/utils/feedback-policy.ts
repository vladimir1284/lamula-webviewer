import type { FeedbackApp } from '#shared/contract'

/**
 * Apps que no montan el widget de Turnstile y entran sin captcha.
 *
 * lamula-process es una app offline-first de escritorio/kiosko: cargar el
 * script de challenges.cloudflare.com sería su única dependencia de red
 * externa. Decisión 51: se exime del captcha y se apoya solo en el
 * rate-limit. A cambio, el límite por IP de `processRateLimit` es la única
 * barrera real, porque cualquiera puede mandar `app: 'process'` en el cuerpo.
 */
const CAPTCHA_EXEMPT_APPS: readonly FeedbackApp[] = ['process']

export function requiresCaptcha(app: FeedbackApp): boolean {
  return !CAPTCHA_EXEMPT_APPS.includes(app)
}

/** Límite por IP que se aplica SOLO a los envíos sin captcha. */
export const PROCESS_IP_LIMIT = 30
export const PROCESS_IP_WINDOW_MS = 3600000

/**
 * IP real del cliente.
 *
 * `x-forwarded-for` es una lista que los proxys van APPENDEANDO, así que su
 * primer elemento lo controla quien llama y es trivial de falsear: bastaría
 * variarlo para estrenar cubo de rate-limit en cada envío. Cloudflare sí
 * sobrescribe `cf-connecting-ip`, y el último elemento de la cadena XFF es el
 * que añadió el proxy más cercano a nosotros. Ese orden de preferencia es el
 * que seguimos.
 *
 * Supone que el servicio solo es alcanzable a través del proxy. Si alguien
 * pudiera llegar al contenedor directo, ambas cabeceras serían falseables.
 */
export function resolveClientIp(
  headers: { cfConnectingIp?: string | null, forwardedFor?: string | null },
  socketAddress?: string | null,
): string {
  const cf = headers.cfConnectingIp?.trim()
  if (cf) {
    return cf
  }

  const chain = (headers.forwardedFor ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  if (chain.length > 0) {
    return chain[chain.length - 1]!
  }

  return socketAddress?.trim() || 'unknown'
}
