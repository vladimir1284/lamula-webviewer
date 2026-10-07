import { z } from 'zod'
import { useFeedbackDal } from '../../../dal/feedback'
import { parseQueryParams } from '../../../dal/params'

const zAdminFeedbackQuery = z.object({
  status: z.enum(['nuevo', 'leido', 'respondido', 'cerrado']).optional(),
  role: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const query = parseQueryParams(event, zAdminFeedbackQuery)
  const dal = useFeedbackDal(event)

  return dal.listAll(query)
})
