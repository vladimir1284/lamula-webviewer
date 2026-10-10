import { beforeEach, describe, expect, it } from 'vitest'
import { EXPORT_PREF_DEFAULTS, loadExportPrefs, saveExportPrefs } from '~/composables/useExportPrefs'

beforeEach(() => localStorage.clear())

describe('useExportPrefs', () => {
  it('sin nada guardado devuelve los defaults (franja + 2x)', () => {
    const p = loadExportPrefs()
    expect(p.chrome).toBe('bar')
    expect(p.scale).toBe(2)
    expect(p.parts).toEqual(EXPORT_PREF_DEFAULTS.parts)
  })

  it('ida y vuelta', () => {
    saveExportPrefs({ v: 1, chrome: 'overlay', scale: 1, parts: { title: false, meta: true, legend: true, attribution: false } })
    const p = loadExportPrefs()
    expect(p.chrome).toBe('overlay')
    expect(p.scale).toBe(1)
    expect(p.parts.title).toBe(false)
  })

  it('un shape inválido cae a defaults en vez de romper', () => {
    localStorage.setItem('lamula:export', JSON.stringify({ v: 1, chrome: 'nope', scale: 7 }))
    expect(loadExportPrefs().chrome).toBe('bar')
    localStorage.setItem('lamula:export', '{{{')
    expect(loadExportPrefs().chrome).toBe('bar')
  })

  it('no contamina la clave del viewer', () => {
    saveExportPrefs({ v: 1, chrome: 'none', scale: 1, parts: EXPORT_PREF_DEFAULTS.parts })
    expect(localStorage.getItem('lamula:prefs')).toBeNull()
  })
})
