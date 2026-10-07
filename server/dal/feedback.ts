import type { H3Event } from 'h3'
import { FeedbackLiveDal } from './feedback-live'
import { FeedbackMemoryDal } from './feedback-memory'
import type { FeedbackDal } from './feedback-types'
import { getPgClient } from './pg'

let memoryInstance: FeedbackMemoryDal | undefined

export function useFeedbackDal(event: H3Event): FeedbackDal {
  const config = useRuntimeConfig(event)

  if (config.dalAdapter === 'fixture') {
    memoryInstance ??= new FeedbackMemoryDal()
    return memoryInstance
  }

  const host = config.pgHost
  const port = Number(config.pgPort) || 5432
  const database = config.pgDatabase
  const username = config.pgWriteUser || config.pgUser
  const password = config.pgWritePassword || config.pgPassword

  if (!host || !database || !username) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Base de datos de escrituras/feedback no configurada',
    })
  }

  const client = getPgClient({
    host,
    port,
    database,
    username,
    password,
  })

  return new FeedbackLiveDal(client)
}
