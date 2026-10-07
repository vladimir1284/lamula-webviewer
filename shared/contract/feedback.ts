import { z } from 'zod'

export const FEEDBACK_ROLES = [
  'profesor',
  'meteorologo',
  'investigador',
  'estudiante',
  'aficionado',
  'otro',
] as const
export type FeedbackRole = (typeof FEEDBACK_ROLES)[number]

export const FEEDBACK_KINDS = ['mejora', 'bug', 'dato', 'otro'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FEEDBACK_STATUSES = ['nuevo', 'leido', 'respondido', 'cerrado'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const zFeedbackRole = z.enum(FEEDBACK_ROLES)
export const zFeedbackKind = z.enum(FEEDBACK_KINDS)
export const zFeedbackStatus = z.enum(FEEDBACK_STATUSES)

export const zFeedbackProfile = z.object({
  role: zFeedbackRole,
  roleOther: z.string().optional().nullable(),
  displayName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  organization: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
})
export type FeedbackProfile = z.infer<typeof zFeedbackProfile>

export const zFeedbackContext = z.record(z.string(), z.unknown())
export type FeedbackContext = z.infer<typeof zFeedbackContext>

export const zFeedbackSubmission = z.object({
  kind: zFeedbackKind,
  rating: z.number().int().min(1).max(5).optional().nullable(),
  message: z.string().min(1, 'El mensaje no puede estar vacío').max(5000),
  role: zFeedbackRole,
  roleOther: z.string().optional().nullable(),
  profile: zFeedbackProfile.partial().optional().nullable(),
  context: zFeedbackContext.optional().nullable(),
  turnstileToken: z.string().optional().nullable(),
})
export type FeedbackSubmission = z.infer<typeof zFeedbackSubmission>

export const zAdminReply = z.object({
  id: z.string(),
  feedbackId: z.string(),
  body: z.string(),
  author: z.string(),
  createdAt: z.string(),
  readAt: z.string().nullable().optional(),
})
export type AdminReply = z.infer<typeof zAdminReply>

export const zFeedbackThreadItem = z.object({
  id: z.string(),
  kind: zFeedbackKind,
  rating: z.number().nullable().optional(),
  message: z.string(),
  status: zFeedbackStatus,
  createdAt: z.string(),
  context: zFeedbackContext.optional().nullable(),
  replies: z.array(zAdminReply),
})
export type FeedbackThreadItem = z.infer<typeof zFeedbackThreadItem>

export const zFeedbackAdminItem = z.object({
  id: z.string(),
  tokenHash: z.string(),
  kind: zFeedbackKind,
  rating: z.number().nullable().optional(),
  message: z.string(),
  status: zFeedbackStatus,
  createdAt: z.string(),
  context: zFeedbackContext.optional().nullable(),
  user: z.object({
    role: zFeedbackRole,
    roleOther: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    organization: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    locale: z.string().nullable().optional(),
  }),
  replies: z.array(zAdminReply),
})
export type FeedbackAdminItem = z.infer<typeof zFeedbackAdminItem>
