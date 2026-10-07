import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createDefaultIdentity,
  FEEDBACK_STORAGE_KEY,
  generateToken,
  loadFeedbackIdentity,
  saveFeedbackIdentity,
} from '~/composables/useFeedbackIdentity'

describe('useFeedbackIdentity', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('genera un token válido no vacío', () => {
    const token = generateToken()
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(10)
  })

  it('crea identidad por defecto cuando localStorage está vacío', () => {
    const identity = loadFeedbackIdentity()
    expect(identity.v).toBe(1)
    expect(identity.token).toBeDefined()
    expect(identity.nudge.shownCount).toBe(0)
    expect(identity.nudge.submitted).toBe(false)
  })

  it('guarda y recupera la identidad correctamente', () => {
    const custom = createDefaultIdentity()
    custom.profile = { role: 'meteorologo', displayName: 'Dra. Pérez' }
    custom.nudge.shownCount = 2

    saveFeedbackIdentity(custom)

    const loaded = loadFeedbackIdentity()
    expect(loaded.token).toBe(custom.token)
    expect(loaded.profile?.role).toBe('meteorologo')
    expect(loaded.profile?.displayName).toBe('Dra. Pérez')
    expect(loaded.nudge.shownCount).toBe(2)
  })

  it('reemplaza JSON corrupto en localStorage con una nueva identidad', () => {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, '{corrupted_json')

    const loaded = loadFeedbackIdentity()
    expect(loaded.v).toBe(1)
    expect(loaded.token).toBeDefined()
  })
})
