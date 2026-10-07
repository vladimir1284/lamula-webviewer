import { describe, expect, it } from 'vitest'
import {
  zAdminReply,
  zFeedbackProfile,
  zFeedbackSubmission,
  zFeedbackThreadItem,
} from '#shared/contract'

describe('Feedback Zod Schemas', () => {
  it('valida un perfil de usuario correctamente', () => {
    const valid = zFeedbackProfile.parse({
      role: 'meteorologo',
      displayName: 'Carlos',
      email: 'carlos@meteorologia.org',
    })
    expect(valid.role).toBe('meteorologo')
    expect(valid.displayName).toBe('Carlos')
  })

  it('rechaza una entrega sin mensaje', () => {
    const res = zFeedbackSubmission.safeParse({
      kind: 'bug',
      role: 'aficionado',
      message: '',
    })
    expect(res.success).toBe(false)
  })

  it('valida una entrega completa de feedback', () => {
    const valid = zFeedbackSubmission.parse({
      kind: 'mejora',
      rating: 4,
      message: 'Añadir exportación de imágenes',
      role: 'investigador',
      context: { site: 'BYX' },
    })
    expect(valid.kind).toBe('mejora')
    expect(valid.rating).toBe(4)
  })

  it('valida items del hilo con respuestas de administración', () => {
    const reply = zAdminReply.parse({
      id: '1',
      feedbackId: '10',
      body: 'Tomamos nota',
      author: 'Admin',
      createdAt: '2026-07-11T12:00:00',
    })

    const thread = zFeedbackThreadItem.parse({
      id: '10',
      kind: 'mejora',
      message: 'Sugerencia',
      status: 'respondido',
      createdAt: '2026-07-11T10:00:00',
      replies: [reply],
    })

    expect(thread.replies.length).toBe(1)
    expect(thread.replies[0]!.body).toBe('Tomamos nota')
  })
})
