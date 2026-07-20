import { beforeEach, describe, expect, it } from 'vitest'
import { loadPrefs, savePrefs } from '../../composables/useViewerPrefs'

describe('useViewerPrefs (localStorage, nunca el time)', () => {
  beforeEach(() => localStorage.clear())

  it('sin prefs guardadas → null', () => {
    expect(loadPrefs()).toBeNull()
  })

  it('roundtrip save/load', () => {
    savePrefs({ site: 'AMX', product: 153, opacity: 0.6, base: 'off' })
    expect(loadPrefs()).toEqual({
      v: 3,
      site: 'AMX',
      product: 153,
      opacity: 0.6,
      base: 'off',
      coverage: true,
      units: 'imperial',
      clock: 'local',
      animationFrames: 12,
      smooth: false,
    })
  })

  it('save parcial conserva el resto', () => {
    savePrefs({ site: 'AMX', product: 153, opacity: 0.8, base: 'osm', units: 'si' })
    savePrefs({ opacity: 0.3 })
    expect(loadPrefs()).toMatchObject({ v: 3, site: 'AMX', product: 153, opacity: 0.3, base: 'osm', units: 'si' })
  })

  it('JSON corrupto → null', () => {
    localStorage.setItem('lamula:prefs', '{not json')
    expect(loadPrefs()).toBeNull()
  })

  it('versión desconocida → null', () => {
    localStorage.setItem('lamula:prefs', JSON.stringify({ v: 4, site: 'AMX' }))
    expect(loadPrefs()).toBeNull()
  })

  it('shape inválido (tipos incorrectos) → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 3, site: 'AMX', product: '153', opacity: 0.8, base: 'osm', coverage: true, units: 'imperial', clock: 'utc', animationFrames: 12, smooth: false }),
    )
    expect(loadPrefs()).toBeNull()
  })

  it('v3 con enum fuera de rango → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 3, site: 'AMX', product: 153, opacity: 0.8, base: 'osm', coverage: true, units: 'metric', clock: 'utc', animationFrames: 12, smooth: false }),
    )
    expect(loadPrefs()).toBeNull()
  })

  it('v1 válido → migra con defaults nuevos, conserva lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 1, site: 'BYX', product: 94, opacity: 0.5, base: 'off' }),
    )
    expect(loadPrefs()).toEqual({
      v: 3,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: true,
      units: 'imperial',
      clock: 'local',
      animationFrames: 12,
      smooth: false,
    })
  })

  it('v1 con shape inválido → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 1, site: 'BYX', product: '94', opacity: 0.5, base: 'off' }),
    )
    expect(loadPrefs()).toBeNull()
  })

  it('save parcial sobre storage v1 → escribe v3 completo conservando lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 1, site: 'BYX', product: 94, opacity: 0.5, base: 'off' }),
    )
    savePrefs({ units: 'si' })
    expect(JSON.parse(localStorage.getItem('lamula:prefs')!)).toEqual({
      v: 3,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: true,
      units: 'si',
      clock: 'local',
      animationFrames: 12,
      smooth: false,
    })
  })

  it('v2 válido (pre-smooth) → migra con smooth:false, conserva lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 2, site: 'BYX', product: 94, opacity: 0.5, base: 'off', coverage: false, units: 'si', clock: 'utc', animationFrames: 20 }),
    )
    expect(loadPrefs()).toEqual({
      v: 3,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: false,
      units: 'si',
      clock: 'utc',
      animationFrames: 20,
      smooth: false,
    })
  })

  it('save parcial sobre storage v2 → escribe v3 completo conservando lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 2, site: 'BYX', product: 94, opacity: 0.5, base: 'off', coverage: false, units: 'si', clock: 'utc', animationFrames: 20 }),
    )
    savePrefs({ smooth: true })
    expect(JSON.parse(localStorage.getItem('lamula:prefs')!)).toEqual({
      v: 3,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: false,
      units: 'si',
      clock: 'utc',
      animationFrames: 20,
      smooth: true,
    })
  })
})
