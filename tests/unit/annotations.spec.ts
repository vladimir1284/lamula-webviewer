// Modelo puro de anotaciones (F7.2). Lo que se prueba aquí es el contrato
// de persistencia: lo que entra de localStorage puede estar corrupto.
import { describe, expect, it } from 'vitest'
import {
  ANNOTATION_COLORS,
  DEFAULT_ANNOTATION_COLOR,
  circleRadius,
  makeAnnotation,
  newAnnotationId,
  readAnnotation,
  readAnnotations,
} from '~/utils/export/annotations'

describe('readAnnotation', () => {
  it('acepta una flecha bien formada y redondea al metro', () => {
    const a = readAnnotation({
      id: 'a1',
      kind: 'arrow',
      coords: [[-9000000.4, 2800000.6], [-8990000, 2810000]],
      color: '#facc15',
    })!
    expect(a.coords).toEqual([[-9000000, 2800001], [-8990000, 2810000]])
    expect(a.color).toBe('#facc15')
  })

  it('exige los puntos mínimos de cada tipo', () => {
    expect(readAnnotation({ id: 'a', kind: 'arrow', coords: [[0, 0]] })).toBeNull()
    expect(readAnnotation({ id: 'a', kind: 'circle', coords: [[0, 0]] })).toBeNull()
    expect(readAnnotation({ id: 'a', kind: 'freehand', coords: [[0, 0]] })).toBeNull()
    expect(readAnnotation({ id: 'a', kind: 'text', coords: [[0, 0]], text: 'hola' })).not.toBeNull()
  })

  it('un rótulo vacío no es una anotación: no se vería nada', () => {
    expect(readAnnotation({ id: 'a', kind: 'text', coords: [[0, 0]] })).toBeNull()
    expect(readAnnotation({ id: 'a', kind: 'text', coords: [[0, 0]], text: '' })).toBeNull()
  })

  it('rechaza coordenadas no finitas y tipos desconocidos', () => {
    expect(readAnnotation({ id: 'a', kind: 'arrow', coords: [[0, 0], [Number.NaN, 1]] })).toBeNull()
    expect(readAnnotation({ id: 'a', kind: 'arrow', coords: [[0, 0], ['1', 2]] })).toBeNull()
    expect(readAnnotation({ id: 'a', kind: 'rectangle', coords: [[0, 0], [1, 1]] })).toBeNull()
    expect(readAnnotation({ id: '', kind: 'arrow', coords: [[0, 0], [1, 1]] })).toBeNull()
  })

  it('un color inválido cae al default en vez de descartar el trazo', () => {
    const a = readAnnotation({ id: 'a', kind: 'arrow', coords: [[0, 0], [1, 1]], color: 'rojo' })!
    expect(a.color).toBe(DEFAULT_ANNOTATION_COLOR)
    expect(ANNOTATION_COLORS).toContain(DEFAULT_ANNOTATION_COLOR)
  })

  it('recorta un rótulo desmesurado', () => {
    const a = readAnnotation({ id: 'a', kind: 'text', coords: [[0, 0]], text: 'x'.repeat(500) })!
    expect(a.text).toHaveLength(120)
  })
})

describe('readAnnotations', () => {
  it('descarta solo las corruptas, no la lista entera', () => {
    const list = readAnnotations([
      { id: 'ok1', kind: 'arrow', coords: [[0, 0], [1, 1]] },
      { id: 'mala', kind: 'arrow', coords: [[0, 0]] },
      null,
      'basura',
      { id: 'ok2', kind: 'freehand', coords: [[0, 0], [1, 1], [2, 2]] },
    ])
    expect(list.map(a => a.id)).toEqual(['ok1', 'ok2'])
  })

  it('algo que no es lista da lista vacía', () => {
    expect(readAnnotations(null)).toEqual([])
    expect(readAnnotations({})).toEqual([])
  })
})

describe('makeAnnotation', () => {
  it('genera id único sin crypto.randomUUID', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newAnnotationId()))
    expect(ids.size).toBeGreaterThan(40) // mismo ms ⇒ decide el azar
    expect(newAnnotationId(() => 0.5)).toMatch(/^a[0-9a-z]+$/)
  })

  it('devuelve null si la geometría no da', () => {
    expect(makeAnnotation('arrow', [[0, 0]])).toBeNull()
  })
})

describe('circleRadius', () => {
  it('sale de la distancia centro↔borde, en metros', () => {
    const a = makeAnnotation('circle', [[0, 0], [3000, 4000]])!
    expect(circleRadius(a)).toBe(5000)
  })
})
