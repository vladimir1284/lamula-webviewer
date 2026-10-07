import type { FeedbackProfile } from '#shared/contract'

export const FEEDBACK_STORAGE_KEY = 'lamula:feedback'

export interface FeedbackStorageV1 {
  v: 1
  token: string
  profile?: FeedbackProfile
  nudge: {
    shownCount: number
    snoozeUntil: number | null
    submitted: boolean
  }
}

export function generateToken(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(32)
    window.crypto.getRandomValues(bytes)
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return `f_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

export function createDefaultIdentity(): FeedbackStorageV1 {
  return {
    v: 1,
    token: generateToken(),
    profile: undefined,
    nudge: {
      shownCount: 0,
      snoozeUntil: null,
      submitted: false,
    },
  }
}

export function loadFeedbackIdentity(): FeedbackStorageV1 {
  if (typeof localStorage === 'undefined') {
    return createDefaultIdentity()
  }

  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY)
    if (!raw) {
      const fresh = createDefaultIdentity()
      saveFeedbackIdentity(fresh)
      return fresh
    }

    const data = JSON.parse(raw)
    if (data && typeof data === 'object' && data.v === 1 && typeof data.token === 'string') {
      return data as FeedbackStorageV1
    }

    const fresh = createDefaultIdentity()
    saveFeedbackIdentity(fresh)
    return fresh
  }
  catch {
    const fresh = createDefaultIdentity()
    saveFeedbackIdentity(fresh)
    return fresh
  }
}

export function saveFeedbackIdentity(data: FeedbackStorageV1): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(data))
  }
  catch {
    // Silencioso
  }
}
