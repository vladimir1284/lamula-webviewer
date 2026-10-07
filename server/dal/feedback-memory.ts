import type {
  AdminReply,
  FeedbackAdminItem,
  FeedbackContext,
  FeedbackKind,
  FeedbackProfile,
  FeedbackRole,
  FeedbackStatus,
  FeedbackSubmission,
  FeedbackThreadItem,
} from '#shared/contract'
import type { FeedbackAdminFilters, FeedbackDal } from './feedback-types'

interface UserRecord {
  tokenHash: string
  role: FeedbackRole
  roleOther: string | null
  displayName: string | null
  email: string | null
  organization: string | null
  country: string | null
  locale: string | null
}

interface FeedbackRecord {
  id: string
  tokenHash: string
  kind: FeedbackKind
  rating: number | null
  message: string
  context: FeedbackContext
  status: FeedbackStatus
  createdAt: string
}

export class FeedbackMemoryDal implements FeedbackDal {
  private users = new Map<string, UserRecord>()
  private feedbackItems = new Map<string, FeedbackRecord>()
  private replies = new Map<string, AdminReply[]>()
  private nextFeedbackId = 1
  private nextReplyId = 1

  async upsertUser(
    tokenHash: string,
    role: string,
    profile?: Partial<FeedbackProfile> | null,
  ): Promise<void> {
    const existing = this.users.get(tokenHash)
    this.users.set(tokenHash, {
      tokenHash,
      role: role as FeedbackRole,
      roleOther: profile?.roleOther ?? existing?.roleOther ?? null,
      displayName: profile?.displayName ?? existing?.displayName ?? null,
      email: profile?.email ?? existing?.email ?? null,
      organization: profile?.organization ?? existing?.organization ?? null,
      country: profile?.country ?? existing?.country ?? null,
      locale: profile?.locale ?? existing?.locale ?? null,
    })
  }

  async createFeedback(tokenHash: string, submission: FeedbackSubmission): Promise<{ id: string }> {
    await this.upsertUser(tokenHash, submission.role, submission.profile)

    const id = String(this.nextFeedbackId++)
    this.feedbackItems.set(id, {
      id,
      tokenHash,
      kind: submission.kind,
      rating: submission.rating ?? null,
      message: submission.message,
      context: submission.context ?? {},
      status: 'nuevo',
      createdAt: new Date().toISOString(),
    })

    return { id }
  }

  async listMine(tokenHash: string): Promise<FeedbackThreadItem[]> {
    const items = Array.from(this.feedbackItems.values())
      .filter(f => f.tokenHash === tokenHash)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return items.map(item => ({
      id: item.id,
      kind: item.kind,
      rating: item.rating,
      message: item.message,
      status: item.status,
      createdAt: item.createdAt,
      context: item.context,
      replies: this.replies.get(item.id) ?? [],
    }))
  }

  async markRepliesRead(tokenHash: string): Promise<void> {
    const myIds = new Set(
      Array.from(this.feedbackItems.values())
        .filter(f => f.tokenHash === tokenHash)
        .map(f => f.id),
    )

    const now = new Date().toISOString()
    for (const [feedbackId, replyList] of this.replies.entries()) {
      if (myIds.has(feedbackId)) {
        for (const reply of replyList) {
          if (!reply.readAt) {
            reply.readAt = now
          }
        }
      }
    }
  }

  async listAll(filters?: FeedbackAdminFilters): Promise<FeedbackAdminItem[]> {
    let items = Array.from(this.feedbackItems.values())

    if (filters?.status) {
      items = items.filter(f => f.status === filters.status)
    }
    if (filters?.role) {
      items = items.filter(f => {
        const u = this.users.get(f.tokenHash)
        return u?.role === filters.role
      })
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return items.map(item => {
      const user = this.users.get(item.tokenHash) ?? {
        role: 'otro' as FeedbackRole,
        roleOther: null,
        displayName: null,
        email: null,
        organization: null,
        country: null,
        locale: null,
      }

      return {
        id: item.id,
        tokenHash: item.tokenHash,
        kind: item.kind,
        rating: item.rating,
        message: item.message,
        status: item.status,
        createdAt: item.createdAt,
        context: item.context,
        user: {
          role: user.role,
          roleOther: user.roleOther,
          displayName: user.displayName,
          email: user.email,
          organization: user.organization,
          country: user.country,
          locale: user.locale,
        },
        replies: this.replies.get(item.id) ?? [],
      }
    })
  }

  async addReply(feedbackId: string, body: string, author = 'LAMULA'): Promise<{ id: string }> {
    const feedback = this.feedbackItems.get(feedbackId)
    if (!feedback) {
      throw new Error(`Feedback ${feedbackId} no existe`)
    }

    feedback.status = 'respondido'

    const replyId = String(this.nextReplyId++)
    const reply: AdminReply = {
      id: replyId,
      feedbackId,
      body,
      author,
      createdAt: new Date().toISOString(),
      readAt: null,
    }

    if (!this.replies.has(feedbackId)) {
      this.replies.set(feedbackId, [])
    }
    this.replies.get(feedbackId)!.push(reply)

    return { id: replyId }
  }

  async setStatus(feedbackId: string, status: FeedbackStatus): Promise<void> {
    const feedback = this.feedbackItems.get(feedbackId)
    if (!feedback) {
      throw new Error(`Feedback ${feedbackId} no existe`)
    }
    feedback.status = status
  }
}
