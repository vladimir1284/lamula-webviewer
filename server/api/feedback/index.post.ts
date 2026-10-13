import { createHash } from 'crypto'
import { zFeedbackSubmission } from '#shared/contract'
import { useFeedbackDal } from '../../dal/feedback'
import { parseBody } from '../../dal/params'
import {
  PROCESS_IP_LIMIT,
  PROCESS_IP_WINDOW_MS,
  requiresCaptcha,
  resolveClientIp,
} from '../../utils/feedback-policy'
import { checkRateLimit } from '../../utils/rate-limit'
import { verifyTurnstileToken } from '../../utils/turnstile'
import { sendFeedbackWebhook } from '../../utils/webhook'

export default defineEventHandler(async (event) => {
  const submission = await parseBody(event, zFeedbackSubmission)

  const rawToken = getHeader(event, 'x-feedback-token')
  if (!rawToken || rawToken.trim().length < 10) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cabecera x-feedback-token requerida y válida',
    })
  }

  const clientIp = resolveClientIp(
    {
      cfConnectingIp: getHeader(event, 'cf-connecting-ip'),
      forwardedFor: getHeader(event, 'x-forwarded-for'),
    },
    event.node.req.socket.remoteAddress,
  )

  const rateLimitKey = `${clientIp}:${rawToken}`
  if (!checkRateLimit(rateLimitKey, 5, 3600000)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Límite de envíos excedido (máximo 5 por hora)',
    })
  }

  if (requiresCaptcha(submission.app)) {
    const turnstileOk = await verifyTurnstileToken(event, submission.turnstileToken)
    if (!turnstileOk) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Verificación de captcha fallida o expirada',
      })
    }
  }
  else if (!checkRateLimit(`noCaptcha:${clientIp}`, PROCESS_IP_LIMIT, PROCESS_IP_WINDOW_MS)) {
    // Sin captcha, el cubo por token no frena nada: el token lo acuña el
    // cliente. Este cubo por IP es la única barrera contra un flood scriptado.
    throw createError({
      statusCode: 429,
      statusMessage: 'Límite de envíos excedido para esta red (máximo 30 por hora)',
    })
  }

  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const dal = useFeedbackDal(event)

  const result = await dal.createFeedback(tokenHash, submission)

  // Fire-and-forget webhook
  sendFeedbackWebhook(event, result.id, submission)

  setResponseStatus(event, 201)
  return result
})
