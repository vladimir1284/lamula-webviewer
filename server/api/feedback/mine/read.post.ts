import createHash from 'crypto'
import { useFeedbackDal } from '../../../dal/feedback'

export default defineEventHandler(async (event) => {
  const rawToken = getHeader(event, 'x-feedback-token')
  if (!rawToken || rawToken.trim().length < 10) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cabecera x-feedback-token requerida y válida',
    })
  }

  const tokenHash = createHash.createHash('sha256').update(rawToken).digest('hex')
  const dal = useFeedbackDal(event)

  await dal.markRepliesRead(tokenHash)
  return { ok: true }
})
