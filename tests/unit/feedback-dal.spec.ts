import { beforeEach, describe, expect, it } from 'vitest'
import type { FeedbackSubmission } from '#shared/contract'
import { FeedbackLiveDal } from '~/server/dal/feedback-live'
import { FeedbackMemoryDal } from '~/server/dal/feedback-memory'
import type { FeedbackDal } from '~/server/dal/feedback-types'
import { asPg, createContractDb } from '../helpers/pg-sqlite'

describe('FeedbackDal Parity (Live vs Memory)', () => {
  let liveDal: FeedbackDal
  let memoryDal: FeedbackDal

  beforeEach(() => {
    const db = createContractDb()
    liveDal = new FeedbackLiveDal(asPg(db))
    memoryDal = new FeedbackMemoryDal()
  })

  it('permite crear feedback, listar mis mensajes y responder desde admin en ambas implementaciones', async () => {
    for (const dal of [liveDal, memoryDal]) {
      const tokenHash = 'hash_1234567890abcdef'
      const submission: FeedbackSubmission = {
        role: 'meteorologo',
        kind: 'mejora',
        rating: 5,
        message: 'Excelente resolución en reflectividad',
        profile: {
          role: 'meteorologo',
          displayName: 'Dra. María',
        },
        context: { site: 'AMX', product: 94 },
      }

      // 1. Crear feedback
      const created = await dal.createFeedback(tokenHash, submission)
      expect(created.id).toBeDefined()

      // 2. Listar mis mensajes (debe incluir el recien enviado sin respuestas)
      let mine = await dal.listMine(tokenHash)
      expect(mine.length).toBe(1)
      expect(mine[0]!.message).toBe('Excelente resolución en reflectividad')
      expect(mine[0]!.status).toBe('nuevo')
      expect(mine[0]!.replies).toEqual([])

      // 3. Listar admin
      const all = await dal.listAll({ status: 'nuevo' })
      expect(all.length).toBe(1)
      expect(all[0]!.user.role).toBe('meteorologo')
      expect(all[0]!.user.displayName).toBe('Dra. María')

      // 4. Responder como admin
      const reply = await dal.addReply(created.id, '¡Muchas gracias por tu comentario!', 'Equipo LAMULA')
      expect(reply.id).toBeDefined()

      // 5. Verificar que el estado del mensaje cambió a respondido y tiene la respuesta
      mine = await dal.listMine(tokenHash)
      expect(mine[0]!.status).toBe('respondido')
      expect(mine[0]!.replies.length).toBe(1)
      expect(mine[0]!.replies[0]!.body).toBe('¡Muchas gracias por tu comentario!')
      expect(mine[0]!.replies[0]!.readAt).toBeNull()

      // 6. Marcar respuestas como leídas
      await dal.markRepliesRead(tokenHash)
      mine = await dal.listMine(tokenHash)
      expect(mine[0]!.replies[0]!.readAt).toBeDefined()
    }
  })
})
