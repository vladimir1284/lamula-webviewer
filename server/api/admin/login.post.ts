import { createHmac, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { parseBody } from '../../dal/params'

const zLoginBody = z.object({
  password: z.string(),
})

function signSession(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

export default defineEventHandler(async (event) => {
  const body = await parseBody(event, zLoginBody)
  const config = useRuntimeConfig(event)
  const secret = config.adminToken

  if (!secret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Admin no configurado (falta NUXT_ADMIN_TOKEN)',
    })
  }

  const givenBuf = Buffer.from(body.password)
  const expectedBuf = Buffer.from(secret)

  const matches = givenBuf.length === expectedBuf.length && timingSafeEqual(givenBuf, expectedBuf)

  if (!matches) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Contraseña de administrador incorrecta',
    })
  }

  const payload = `admin_${Date.now()}`
  const sessionToken = signSession(payload, secret)

  setCookie(event, 'admin_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400 * 7, // 1 día * 7
  })

  return { ok: true }
})
