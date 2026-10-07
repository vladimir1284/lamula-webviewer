import type { H3Event } from 'h3'
import type { FeedbackSubmission } from '#shared/contract'

export async function sendFeedbackWebhook(
  event: H3Event,
  feedbackId: string,
  submission: FeedbackSubmission,
): Promise<void> {
  const config = useRuntimeConfig(event)
  const webhookUrl = config.feedbackWebhookUrl

  if (!webhookUrl) return

  try {
    await $fetch(webhookUrl, {
      method: 'POST',
      body: {
        event: 'new_feedback',
        id: feedbackId,
        kind: submission.kind,
        rating: submission.rating,
        role: submission.role,
        message: submission.message,
        context: submission.context,
        createdAt: new Date().toISOString(),
      },
      timeout: 3000,
    })
  }
  catch (err) {
    console.error('Error enviando webhook de feedback:', err)
  }
}
