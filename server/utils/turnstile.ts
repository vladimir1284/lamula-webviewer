import type { H3Event } from 'h3'

export async function verifyTurnstileToken(
  event: H3Event,
  token?: string | null,
): Promise<boolean> {
  const config = useRuntimeConfig(event)

  if (config.turnstileDisabled === '1' || config.dalAdapter === 'fixture') {
    return true
  }

  if (!config.turnstileSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw createError({
        statusCode: 503,
        statusMessage: 'Captcha Turnstile no configurado en servidor',
      })
    }
    return true
  }

  if (!token) {
    return false
  }

  try {
    const res = await $fetch<{ success: boolean }>(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: {
          secret: config.turnstileSecret,
          response: token,
        },
      },
    )
    return res.success
  }
  catch {
    return false
  }
}
