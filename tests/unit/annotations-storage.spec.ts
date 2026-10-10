// Persistencia de anotaciones en localStorage (F7.2).
import { beforeEach, describe, expect, it } from 'vitest'
import { loadAnnotations, saveAnnotations } from '~/composables/useAnnotations'
import { makeAnnotation } from '~/utils/export/annotations'

const KEY = 'lamula:annotations'
const arrow = (id: string) => makeAnnotation('arrow', [[0, 0], [1000, 1000]], { id })!

beforeEach(() => localStorage.clear())

describe('useAnnotations', () => {
  it('ida y vuelta por sitio', () => {
    saveAnnotations({ BYX: [arrow('a1')], KTLX: [arrow('b1'), arrow('b2')] })
    const back = loadAnnotations()
    expect(back.BYX!.map(a => a.id)).toEqual(['a1'])
    expect(back.KTLX).toHaveLength(2)
  })

  it('borrar todo deja la clave limpia, no un objeto vacío', () => {
    saveAnnotations({ BYX: [arrow('a1')] })
    saveAnnotations({ BYX: [] })
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(loadAnnotations()).toEqual({})
  })

  it('una anotación corrupta no se lleva por delante al resto', () => {
    localStorage.setItem(KEY, JSON.stringify({
      v: 1,
      bySite: {
        BYX: [{ id: 'a1', kind: 'arrow', coords: [[0, 0], [1, 1]] }, { id: 'rota', kind: 'arrow', coords: [[0, 0]] }],
        KTLX: 'basura',
      },
    }))
    const back = loadAnnotations()
    expect(back.BYX!.map(a => a.id)).toEqual(['a1'])
    expect(back.KTLX).toBeUndefined()
  })

  it('versión desconocida o JSON roto devuelve vacío', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 99, bySite: { BYX: [arrow('a1')] } }))
    expect(loadAnnotations()).toEqual({})
    localStorage.setItem(KEY, '{{{')
    expect(loadAnnotations()).toEqual({})
  })

  it('no toca las otras claves del viewer', () => {
    saveAnnotations({ BYX: [arrow('a1')] })
    expect(localStorage.getItem('lamula:prefs')).toBeNull()
    expect(localStorage.getItem('lamula:export')).toBeNull()
  })
})
