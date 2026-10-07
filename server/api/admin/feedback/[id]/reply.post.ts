import { z } from 'zod'
import { useFeedbackDal } from '../../../../dal/feedback'
import { parseBody } from '../../../../dal/params'

const zReplyBody = z.object({
  body: z.string().min(1, 'La respuesta no puede estar vacía'),
  author: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID de feedback requerido' })
  }

  const { body, author } = await parseBody(event, zReplyBody)
  const dal = useFeedbackDal(event)

  const result = await dal.addReply(id, body, author)
  setResponseStatus(event, 201)
  return result
})
