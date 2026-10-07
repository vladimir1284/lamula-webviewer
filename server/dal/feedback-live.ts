import type {
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
import type { PgLike } from './types'

export class FeedbackLiveDal implements FeedbackDal {
  constructor(private readonly db: PgLike) {}

  async upsertUser(
    tokenHash: string,
    role: string,
    profile?: Partial<FeedbackProfile> | null,
  ): Promise<void> {
    const roleOther = profile?.roleOther ?? null
    const displayName = profile?.displayName ?? null
    const email = profile?.email ?? null
    const organization = profile?.organization ?? null
    const country = profile?.country ?? null
    const locale = profile?.locale ?? null

    const sql = `
      INSERT INTO viewer.feedback_users (
        token_hash, role, role_other, display_name, email, organization, country, locale, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      ON CONFLICT (token_hash) DO UPDATE SET
        role = EXCLUDED.role,
        role_other = COALESCE(EXCLUDED.role_other, viewer.feedback_users.role_other),
        display_name = COALESCE(EXCLUDED.display_name, viewer.feedback_users.display_name),
        email = COALESCE(EXCLUDED.email, viewer.feedback_users.email),
        organization = COALESCE(EXCLUDED.organization, viewer.feedback_users.organization),
        country = COALESCE(EXCLUDED.country, viewer.feedback_users.country),
        locale = COALESCE(EXCLUDED.locale, viewer.feedback_users.locale),
        updated_at = now();
    `
    await this.db.query(sql, [
      tokenHash,
      role,
      roleOther,
      displayName,
      email,
      organization,
      country,
      locale,
    ])
  }

  async createFeedback(tokenHash: string, submission: FeedbackSubmission): Promise<{ id: string }> {
    await this.upsertUser(tokenHash, submission.role, submission.profile)

    const sql = `
      INSERT INTO viewer.feedback (token_hash, kind, rating, message, context)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id::text;
    `
    const rows = await this.db.query<{ id: string }>(sql, [
      tokenHash,
      submission.kind,
      submission.rating ?? null,
      submission.message,
      JSON.stringify(submission.context ?? {}),
    ])

    return { id: String(rows[0]!.id) }
  }

  async listMine(tokenHash: string): Promise<FeedbackThreadItem[]> {
    const sqlFeedback = `
      SELECT id::text, kind, rating, message, status, created_at::text as "createdAt", context
      FROM viewer.feedback
      WHERE token_hash = $1
      ORDER BY created_at DESC;
    `
    const items = await this.db.query<{
      id: string
      kind: FeedbackKind
      rating: number | null
      message: string
      status: FeedbackStatus
      createdAt: string
      context: FeedbackContext | string
    }>(sqlFeedback, [tokenHash])

    if (items.length === 0) return []

    const feedbackIds = items.map(i => Number(i.id))
    const sqlReplies = `
      SELECT id::text, feedback_id::text as "feedbackId", body, author, created_at::text as "createdAt", read_at::text as "readAt"
      FROM viewer.feedback_replies
      WHERE feedback_id = ANY($1::bigint[])
      ORDER BY created_at ASC;
    `
    const replies = await this.db.query<{
      id: string
      feedbackId: string
      body: string
      author: string
      createdAt: string
      readAt: string | null
    }>(sqlReplies, [feedbackIds])

    const repliesByFeedback = new Map<string, typeof replies>()
    for (const reply of replies) {
      const fid = String(reply.feedbackId)
      if (!repliesByFeedback.has(fid)) {
        repliesByFeedback.set(fid, [])
      }
      repliesByFeedback.get(fid)!.push(reply)
    }

    return items.map(item => ({
      ...item,
      id: String(item.id),
      context: (typeof item.context === 'string' ? JSON.parse(item.context) : item.context) as FeedbackContext,
      replies: repliesByFeedback.get(String(item.id)) ?? [],
    }))
  }

  async markRepliesRead(tokenHash: string): Promise<void> {
    const sql = `
      UPDATE viewer.feedback_replies
      SET read_at = now()
      WHERE feedback_id IN (
        SELECT id FROM viewer.feedback WHERE token_hash = $1
      ) AND read_at IS NULL;
    `
    await this.db.query(sql, [tokenHash])
  }

  async listAll(filters?: FeedbackAdminFilters): Promise<FeedbackAdminItem[]> {
    const params: unknown[] = []
    const conditions: string[] = []

    if (filters?.status) {
      params.push(filters.status)
      conditions.push(`f.status = $${params.length}`)
    }
    if (filters?.role) {
      params.push(filters.role)
      conditions.push(`u.role = $${params.length}`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const sqlFeedback = `
      SELECT
        f.id::text, f.token_hash as "tokenHash", f.kind, f.rating, f.message, f.status, f.created_at::text as "createdAt", f.context,
        u.role, u.role_other as "roleOther", u.display_name as "displayName", u.email, u.organization, u.country, u.locale
      FROM viewer.feedback f
      JOIN viewer.feedback_users u ON f.token_hash = u.token_hash
      ${whereClause}
      ORDER BY f.created_at DESC;
    `
    const items = await this.db.query<{
      id: string
      tokenHash: string
      kind: FeedbackKind
      rating: number | null
      message: string
      status: FeedbackStatus
      createdAt: string
      context: FeedbackContext | string
      role: FeedbackRole
      roleOther: string | null
      displayName: string | null
      email: string | null
      organization: string | null
      country: string | null
      locale: string | null
    }>(sqlFeedback, params)

    if (items.length === 0) return []

    const feedbackIds = items.map(i => Number(i.id))
    const sqlReplies = `
      SELECT id::text, feedback_id::text as "feedbackId", body, author, created_at::text as "createdAt", read_at::text as "readAt"
      FROM viewer.feedback_replies
      WHERE feedback_id = ANY($1::bigint[])
      ORDER BY created_at ASC;
    `
    const replies = await this.db.query<{
      id: string
      feedbackId: string
      body: string
      author: string
      createdAt: string
      readAt: string | null
    }>(sqlReplies, [feedbackIds])

    const repliesByFeedback = new Map<string, typeof replies>()
    for (const reply of replies) {
      const fid = String(reply.feedbackId)
      if (!repliesByFeedback.has(fid)) {
        repliesByFeedback.set(fid, [])
      }
      repliesByFeedback.get(fid)!.push(reply)
    }

    return items.map(item => ({
      id: String(item.id),
      tokenHash: item.tokenHash,
      kind: item.kind,
      rating: item.rating,
      message: item.message,
      status: item.status,
      createdAt: item.createdAt,
      context: (typeof item.context === 'string' ? JSON.parse(item.context) : item.context) as FeedbackContext,
      user: {
        role: item.role,
        roleOther: item.roleOther,
        displayName: item.displayName,
        email: item.email,
        organization: item.organization,
        country: item.country,
        locale: item.locale,
      },
      replies: repliesByFeedback.get(String(item.id)) ?? [],
    }))
  }

  async addReply(feedbackId: string, body: string, author = 'LAMULA'): Promise<{ id: string }> {
    const sqlInsert = `
      INSERT INTO viewer.feedback_replies (feedback_id, body, author)
      VALUES ($1, $2, $3)
      RETURNING id::text;
    `
    const rows = await this.db.query<{ id: string }>(sqlInsert, [Number(feedbackId), body, author])

    const sqlStatus = `
      UPDATE viewer.feedback
      SET status = 'respondido'
      WHERE id = $1;
    `
    await this.db.query(sqlStatus, [Number(feedbackId)])

    return { id: String(rows[0]!.id) }
  }

  async setStatus(feedbackId: string, status: FeedbackStatus): Promise<void> {
    const sql = `
      UPDATE viewer.feedback
      SET status = $2
      WHERE id = $1;
    `
    await this.db.query(sql, [Number(feedbackId), status])
  }
}
