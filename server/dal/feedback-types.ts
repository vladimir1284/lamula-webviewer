import type {
  FeedbackAdminItem,
  FeedbackProfile,
  FeedbackStatus,
  FeedbackSubmission,
  FeedbackThreadItem,
} from '#shared/contract'

export interface FeedbackAdminFilters {
  status?: FeedbackStatus
  role?: string
}

export interface FeedbackDal {
  upsertUser(tokenHash: string, role: string, profile?: Partial<FeedbackProfile> | null): Promise<void>
  createFeedback(tokenHash: string, submission: FeedbackSubmission): Promise<{ id: string }>
  listMine(tokenHash: string): Promise<FeedbackThreadItem[]>
  markRepliesRead(tokenHash: string): Promise<void>
  listAll(filters?: FeedbackAdminFilters): Promise<FeedbackAdminItem[]>
  addReply(feedbackId: string, body: string, author?: string): Promise<{ id: string }>
  setStatus(feedbackId: string, status: FeedbackStatus): Promise<void>
}
