import type {
  FeedbackProfile,
  FeedbackSubmission,
  FeedbackThreadItem,
} from '#shared/contract'
import { assign, fromPromise, setup } from 'xstate'
import {
  loadFeedbackIdentity,
  saveFeedbackIdentity,
} from '../composables/useFeedbackIdentity'
import type { FeedbackStorageV1 } from '../composables/useFeedbackIdentity'
import { calcSnoozeUntil } from '../utils/feedback/nudge'

export interface FeedbackMachineContext {
  identity: FeedbackStorageV1
  sessionStartTimeMs: number
  dialogOpen: boolean
  activeTab: 'submit' | 'mine'
  submissionError: string | null
  items: FeedbackThreadItem[]
  unreadCount: number
}

export type FeedbackMachineEvent =
  | { type: 'FETCH_MINE' }
  | { type: 'OPEN_DIALOG' }
  | { type: 'CLOSE_DIALOG' }
  | { type: 'SWITCH_TAB'; tab: 'submit' | 'mine' }
  | { type: 'SUBMIT_FEEDBACK'; submission: FeedbackSubmission }
  | { type: 'MARK_READ' }
  | { type: 'CHECK_NUDGE'; nowMs: number }
  | { type: 'NUDGE_ACTION'; action: 'open' | 'later' | 'never' }
  | { type: 'SAVE_PROFILE'; profile: FeedbackProfile }

export const feedbackMachine = setup({
  types: {
    context: {} as FeedbackMachineContext,
    events: {} as FeedbackMachineEvent,
  },
  actors: {
    submitFeedbackActor: fromPromise(
      async ({ input }: { input: { submission: FeedbackSubmission; token: string } }) => {
        return $fetch<{ id: string }>('/api/feedback', {
          method: 'POST',
          headers: {
            'x-feedback-token': input.token,
          },
          body: input.submission,
        })
      },
    ),
    fetchMineActor: fromPromise(async ({ input }: { input: { token: string } }) => {
      return $fetch<FeedbackThreadItem[]>('/api/feedback/mine', {
        headers: {
          'x-feedback-token': input.token,
        },
      })
    }),
  },
  actions: {
    sendMarkRead: ({ context }) => {
      if (typeof window === 'undefined') return
      $fetch('/api/feedback/mine/read', {
        method: 'POST',
        headers: {
          'x-feedback-token': context.identity.token,
        },
      }).catch(() => {})
    },
  },
}).createMachine({
  id: 'feedback',
  type: 'parallel',
  context: () => ({
    identity: loadFeedbackIdentity(),
    sessionStartTimeMs: typeof Date !== 'undefined' ? Date.now() : 0,
    dialogOpen: false,
    activeTab: 'submit',
    submissionError: null,
    items: [],
    unreadCount: 0,
  }),
  states: {
    identity: {
      initial: 'ready',
      states: {
        ready: {
          on: {
            SAVE_PROFILE: {
              actions: [
                assign({
                  identity: ({ context, event }) => {
                    const updated = { ...context.identity, profile: event.profile }
                    saveFeedbackIdentity(updated)
                    return updated
                  },
                }),
              ],
            },
            NUDGE_ACTION: {
              actions: [
                assign({
                  identity: ({ context, event }) => {
                    const now = Date.now()
                    const nudge = { ...context.identity.nudge }
                    if (event.action === 'open') {
                      nudge.shownCount += 1
                    }
                    else if (event.action === 'later' || event.action === 'never') {
                      nudge.shownCount += 1
                      nudge.snoozeUntil = calcSnoozeUntil(event.action, now)
                    }
                    const updated = { ...context.identity, nudge }
                    saveFeedbackIdentity(updated)
                    return updated
                  },
                  dialogOpen: ({ context, event }) =>
                    event.action === 'open' ? true : context.dialogOpen,
                }),
              ],
            },
          },
        },
      },
    },
    dialog: {
      initial: 'closed',
      states: {
        closed: {
          on: {
            OPEN_DIALOG: {
              target: 'open',
              actions: assign({ dialogOpen: true, activeTab: 'submit' }),
            },
          },
        },
        open: {
          on: {
            CLOSE_DIALOG: {
              target: 'closed',
              actions: assign({ dialogOpen: false }),
            },
            SWITCH_TAB: {
              actions: assign({ activeTab: ({ event }) => event.tab }),
            },
          },
        },
      },
    },
    form: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            SUBMIT_FEEDBACK: {
              target: 'submitting',
              actions: assign({ submissionError: null }),
            },
          },
        },
        submitting: {
          invoke: {
            src: 'submitFeedbackActor',
            input: ({ context, event }) => ({
              submission: (event as { submission: FeedbackSubmission }).submission,
              token: context.identity.token,
            }),
            onDone: {
              target: 'idle',
              actions: [
                assign({
                  identity: ({ context, event }) => {
                    const submission = (event as unknown as { submission?: FeedbackSubmission }).submission ?? { role: 'meteorologo', kind: 'mejora', message: '' }
                    const profile = {
                      ...(context.identity.profile ?? { role: submission.role ?? 'meteorologo' }),
                      ...submission.profile,
                      role: submission.role ?? 'meteorologo',
                      roleOther: submission.roleOther,
                    }
                    const updated = {
                      ...context.identity,
                      profile,
                      nudge: { ...context.identity.nudge, submitted: true },
                    }
                    saveFeedbackIdentity(updated)
                    return updated
                  },
                  activeTab: 'mine',
                  submissionError: null,
                }),
              ],
            },
            onError: {
              target: 'error',
              actions: assign({
                submissionError: ({ event }) =>
                  (event.error as { statusMessage?: string; message?: string })?.statusMessage
                  || (event.error as { message?: string })?.message
                  || 'Error enviando opinión',
              }),
            },
          },
        },
        error: {
          on: {
            SUBMIT_FEEDBACK: {
              target: 'submitting',
              actions: assign({ submissionError: null }),
            },
          },
        },
      },
    },
    thread: {
      initial: 'idle',
      states: {
        idle: {
          on: {
            FETCH_MINE: 'loading',
            SUBMIT_FEEDBACK: 'loading',
          },
        },
        loading: {
          invoke: {
            src: 'fetchMineActor',
            input: ({ context }) => ({ token: context.identity.token }),
            onDone: {
              target: 'ready',
              actions: assign({
                items: ({ event }) => event.output,
                unreadCount: ({ event }) => {
                  const items: FeedbackThreadItem[] = event.output
                  let unread = 0
                  for (const item of items) {
                    for (const reply of item.replies) {
                      if (!reply.readAt) unread++
                    }
                  }
                  return unread
                },
              }),
            },
            onError: {
              target: 'error',
            },
          },
        },
        ready: {
          on: {
            FETCH_MINE: 'loading',
            SUBMIT_FEEDBACK: 'loading',
            MARK_READ: {
              actions: [
                assign({
                  unreadCount: 0,
                  items: ({ context }) => {
                    const now = new Date().toISOString()
                    return context.items.map(item => ({
                      ...item,
                      replies: item.replies.map(r => ({ ...r, readAt: r.readAt ?? now })),
                    }))
                  },
                }),
                'sendMarkRead',
              ],
            },
          },
        },
        error: {
          on: {
            FETCH_MINE: 'loading',
            SUBMIT_FEEDBACK: 'loading',
          },
        },
      },
    },
  },
})
