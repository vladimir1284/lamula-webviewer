import { beforeEach, describe, expect, it } from 'vitest'
import { loadPrefs, savePrefs } from '../../composables/useViewerPrefs'

describe('useViewerPrefs (localStorage, nunca el time)', () => {
  beforeEach(() => localStorage.clear())

  it('sin prefs guardadas → null', () => {
    expect(loadPrefs()).toBeNull()
  })

  it('roundtrip save/load', () => {
    savePrefs({ site: 'AMX', product: 153, opacity: 0.6, base: 'off' })
    expect(loadPrefs()).toEqual({ v: 1, site: 'AMX', product: 153, opacity: 0.6, base: 'off' })
  })

  it('save parcial conserva el resto', () => {
    savePrefs({ site: 'AMX', product: 153, opacity: 0.8, base: 'osm' })
    savePrefs({ opacity: 0.3 })
    expect(loadPrefs()).toEqual({ v: 1, site: 'AMX', product: 153, opacity: 0.3, base: 'osm' })
  })

  it('JSON corrupto → null', () => {
    localStorage.setItem('lamula:prefs', '{not json')
    expect(loadPrefs()).toBeNull()
  })

  it('versión desconocida → null', () => {
    localStorage.setItem('lamula:prefs', JSON.stringify({ v: 2, site: 'AMX' }))
    expect(loadPrefs()).toBeNull()
  })

  it('shape inválido (tipos incorrectos) → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 1, site: 'AMX', product: '153', opacity: 0.8, base: 'osm' }),
    )
    expect(loadPrefs()).toBeNull()
  })
})
