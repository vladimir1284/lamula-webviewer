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
      v: 5,
      site: 'AMX',
      product: 153,
      opacity: 0.6,
      base: 'off',
      coverage: true,
      units: 'imperial',
      clock: 'local',
      animationFrames: 12,
      smooth: false,
      smoothRadius: 1,
      showPalette: true,
    })
  })

  it('save parcial conserva el resto', () => {
    savePrefs({ site: 'AMX', product: 153, opacity: 0.8, base: 'osm', units: 'si' })
    savePrefs({ opacity: 0.3 })
    expect(loadPrefs()).toMatchObject({ v: 5, site: 'AMX', product: 153, opacity: 0.3, base: 'osm', units: 'si' })
  })

  it('JSON corrupto → null', () => {
    localStorage.setItem('lamula:prefs', '{not json')
    expect(loadPrefs()).toBeNull()
  })

  it('versión desconocida → null', () => {
    localStorage.setItem('lamula:prefs', JSON.stringify({ v: 6, site: 'AMX' }))
    expect(loadPrefs()).toBeNull()
  })

  it('shape inválido (tipos incorrectos) → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 5, site: 'AMX', product: '153', opacity: 0.8, base: 'osm', coverage: true, units: 'imperial', clock: 'utc', animationFrames: 12, smooth: false, smoothRadius: 1, showPalette: true }),
    )
    expect(loadPrefs()).toBeNull()
  })

  it('v5 con enum fuera de rango → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 5, site: 'AMX', product: 153, opacity: 0.8, base: 'osm', coverage: true, units: 'metric', clock: 'utc', animationFrames: 12, smooth: false, smoothRadius: 1, showPalette: true }),
    )
    expect(loadPrefs()).toBeNull()
  })

  it('v5 con smoothRadius fuera de rango → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 5, site: 'AMX', product: 153, opacity: 0.8, base: 'osm', coverage: true, units: 'imperial', clock: 'utc', animationFrames: 12, smooth: false, smoothRadius: 3, showPalette: true }),
    )
    expect(loadPrefs()).toBeNull()
  })

  it('v5 con showPalette de tipo incorrecto → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 5, site: 'AMX', product: 153, opacity: 0.8, base: 'osm', coverage: true, units: 'imperial', clock: 'utc', animationFrames: 12, smooth: false, smoothRadius: 1, showPalette: 'yes' }),
    )
    expect(loadPrefs()).toBeNull()
  })

  it('base del catálogo (carto-*) valida; base desconocida → null', () => {
    const base = (b: string) => JSON.stringify({
      v: 2, site: 'AMX', product: 153, opacity: 0.8, base: b, coverage: true, units: 'imperial', clock: 'utc', animationFrames: 12,
    })
    localStorage.setItem('lamula:prefs', base('carto-voyager'))
    expect(loadPrefs()?.base).toBe('carto-voyager')
    localStorage.setItem('lamula:prefs', base('google-maps'))
    expect(loadPrefs()).toBeNull()
  })

  it('v1 válido → migra con defaults nuevos, conserva lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 1, site: 'BYX', product: 94, opacity: 0.5, base: 'off' }),
    )
    expect(loadPrefs()).toEqual({
      v: 5,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: true,
      units: 'imperial',
      clock: 'local',
      animationFrames: 12,
      smooth: false,
      smoothRadius: 1,
      showPalette: true,
    })
  })

  it('v1 con shape inválido → null', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 1, site: 'BYX', product: '94', opacity: 0.5, base: 'off' }),
    )
    expect(loadPrefs()).toBeNull()
  })

  it('save parcial sobre storage v1 → escribe v5 completo conservando lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 1, site: 'BYX', product: 94, opacity: 0.5, base: 'off' }),
    )
    savePrefs({ units: 'si' })
    expect(JSON.parse(localStorage.getItem('lamula:prefs')!)).toEqual({
      v: 5,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: true,
      units: 'si',
      clock: 'local',
      animationFrames: 12,
      smooth: false,
      smoothRadius: 1,
      showPalette: true,
    })
  })

  it('v2 válido (pre-smooth) → migra con smooth:false y smoothRadius:1, conserva lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 2, site: 'BYX', product: 94, opacity: 0.5, base: 'off', coverage: false, units: 'si', clock: 'utc', animationFrames: 20 }),
    )
    expect(loadPrefs()).toEqual({
      v: 5,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: false,
      units: 'si',
      clock: 'utc',
      animationFrames: 20,
      smooth: false,
      smoothRadius: 1,
      showPalette: true,
    })
  })

  it('save parcial sobre storage v2 → escribe v5 completo conservando lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 2, site: 'BYX', product: 94, opacity: 0.5, base: 'off', coverage: false, units: 'si', clock: 'utc', animationFrames: 20 }),
    )
    savePrefs({ smooth: true })
    expect(JSON.parse(localStorage.getItem('lamula:prefs')!)).toEqual({
      v: 5,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: false,
      units: 'si',
      clock: 'utc',
      animationFrames: 20,
      smooth: true,
      smoothRadius: 1,
      showPalette: true,
    })
  })

  it('v3 válido (pre-smoothRadius) → migra con smoothRadius:1, conserva lo viejo incl. smooth', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 3, site: 'BYX', product: 94, opacity: 0.5, base: 'off', coverage: false, units: 'si', clock: 'utc', animationFrames: 20, smooth: true }),
    )
    expect(loadPrefs()).toEqual({
      v: 5,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: false,
      units: 'si',
      clock: 'utc',
      animationFrames: 20,
      smooth: true,
      smoothRadius: 1,
      showPalette: true,
    })
  })

  it('save parcial sobre storage v3 → escribe v5 completo conservando lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 3, site: 'BYX', product: 94, opacity: 0.5, base: 'off', coverage: false, units: 'si', clock: 'utc', animationFrames: 20, smooth: true }),
    )
    savePrefs({ smoothRadius: 4 })
    expect(JSON.parse(localStorage.getItem('lamula:prefs')!)).toEqual({
      v: 5,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: false,
      units: 'si',
      clock: 'utc',
      animationFrames: 20,
      smooth: true,
      smoothRadius: 4,
      showPalette: true,
    })
  })

  it('v4 válido (pre-showPalette) → migra con showPalette:true, conserva lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 4, site: 'BYX', product: 94, opacity: 0.5, base: 'off', coverage: false, units: 'si', clock: 'utc', animationFrames: 20, smooth: true, smoothRadius: 4 }),
    )
    expect(loadPrefs()).toEqual({
      v: 5,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: false,
      units: 'si',
      clock: 'utc',
      animationFrames: 20,
      smooth: true,
      smoothRadius: 4,
      showPalette: true,
    })
  })

  it('save parcial sobre storage v4 → escribe v5 completo conservando lo viejo', () => {
    localStorage.setItem(
      'lamula:prefs',
      JSON.stringify({ v: 4, site: 'BYX', product: 94, opacity: 0.5, base: 'off', coverage: false, units: 'si', clock: 'utc', animationFrames: 20, smooth: true, smoothRadius: 4 }),
    )
    savePrefs({ showPalette: false })
    expect(JSON.parse(localStorage.getItem('lamula:prefs')!)).toEqual({
      v: 5,
      site: 'BYX',
      product: 94,
      opacity: 0.5,
      base: 'off',
      coverage: false,
      units: 'si',
      clock: 'utc',
      animationFrames: 20,
      smooth: true,
      smoothRadius: 4,
      showPalette: false,
    })
  })
})
