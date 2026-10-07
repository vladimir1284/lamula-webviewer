import { createHash } from 'crypto'
import { zFeedbackSubmission } from '#shared/contract'
import { useFeedbackDal } from '../../dal/feedback'
import { parseBody } from '../../dal/params'
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

  const clientIp = getHeader(event, 'x-forwarded-for') || event.node.req.socket.remoteAddress || 'unknown'
  const rateLimitKey = `${clientIp}:${rawToken}`
  if (!checkRateLimit(rateLimitKey, 5, 3600000)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Límite de envíos excedido (máximo 5 por hora)',
    })
  }

  const turnstileOk = await verifyTurnstileToken(event, submission.turnstileToken)
  if (!turnstileOk) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Verificación de captcha fallida o expirada',
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
