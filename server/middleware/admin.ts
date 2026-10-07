import { createHmac } from 'crypto'

function verifySessionToken(token: string, secret: string): boolean {
  if (!token || !secret) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false

  const [payload, sig] = parts
  const hmac = createHmac('sha256', secret).update(payload!).digest('hex')
  return hmac === sig
}

export default defineEventHandler((event) => {
  const path = event.path

  if (path.startsWith('/api/admin/') && !path.startsWith('/api/admin/login')) {
    const config = useRuntimeConfig(event)
    const secret = config.adminToken
    const sessionCookie = getCookie(event, 'admin_session')

    if (!sessionCookie || !verifySessionToken(sessionCookie, secret)) {
      throw createError({
        statusCode: 401,
        statusMessage: 'No autorizado - Sesión de administrador inválida',
      })
    }
  }
})
