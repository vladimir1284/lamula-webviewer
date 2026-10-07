import type { FeedbackStatus } from '#shared/contract'
import { zFeedbackStatus } from '#shared/contract'
import { z } from 'zod'
import { useFeedbackDal } from '../../../../dal/feedback'
import { parseBody } from '../../../../dal/params'

const zStatusBody = z.object({
  status: zFeedbackStatus,
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID de feedback requerido' })
  }

  const { status } = await parseBody(event, zStatusBody)
  const dal = useFeedbackDal(event)

  await dal.setStatus(id, status as FeedbackStatus)
  return { ok: true }
})
