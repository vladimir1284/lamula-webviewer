// Capa de anotaciones (F7.2): conversión geometría ↔ modelo y estilos.
// Usa `ol` de verdad, como phenomena-layer.spec.ts.
import { describe, expect, it } from 'vitest'
import Feature from 'ol/Feature'
import { Circle as CircleGeom, LineString, Point, Polygon } from 'ol/geom'
import {
  ANNOTATION_PROP,
  annotationFeature,
  annotationFromGeometry,
  annotationGeometry,
  annotationStyle,
  arrowRotation,
  buildAnnotationFeatures,
  coordsFromGeometry,
  drawTypeFor,
} from '~/utils/map/annotation-layer'
import { makeAnnotation } from '~/utils/export/annotations'

describe('annotationGeometry', () => {
  it('cada tipo produce su geometría', () => {
    expect(annotationGeometry(makeAnnotation('arrow', [[0, 0], [10, 10]])!)).toBeInstanceOf(LineString)
    expect(annotationGeometry(makeAnnotation('freehand', [[0, 0], [1, 1], [2, 2]])!)).toBeInstanceOf(LineString)
    expect(annotationGeometry(makeAnnotation('text', [[0, 0]], { text: 'hola' })!)).toBeInstanceOf(Point)
    const circle = annotationGeometry(makeAnnotation('circle', [[0, 0], [3000, 4000]])!)
    expect(circle).toBeInstanceOf(CircleGeom)
    expect((circle as CircleGeom).getRadius()).toBe(5000)
  })

  it('un círculo de radio 0 no es geometría', () => {
    expect(annotationGeometry(makeAnnotation('circle', [[0, 0], [0, 0]])!)).toBeNull()
  })
})

describe('coordsFromGeometry', () => {
  it('el círculo se guarda como [centro, punto del borde]', () => {
    expect(coordsFromGeometry('circle', new CircleGeom([100, 200], 500))).toEqual([[100, 200], [600, 200]])
  })

  it('ida y vuelta geometría → modelo → geometría conserva el radio', () => {
    const a = annotationFromGeometry('circle', new CircleGeom([100, 200], 500), { color: '#facc15' })!
    expect((annotationGeometry(a) as CircleGeom).getRadius()).toBe(500)
  })

  it('una geometría que no corresponde al tipo se rechaza', () => {
    expect(coordsFromGeometry('circle', new Point([0, 0]))).toBeNull()
    expect(coordsFromGeometry('text', new LineString([[0, 0], [1, 1]]))).toBeNull()
    expect(coordsFromGeometry('arrow', new Polygon([[[0, 0], [1, 0], [1, 1], [0, 0]]]))).toBeNull()
  })

  it('un trazo de un solo punto no vale como línea', () => {
    expect(coordsFromGeometry('freehand', new LineString([[0, 0]]))).toBeNull()
  })
})

describe('annotationFromGeometry', () => {
  it('conserva el id al re-leer una existente tras Modify', () => {
    const a = annotationFromGeometry('arrow', new LineString([[0, 0], [10, 10]]), { color: '#facc15', id: 'a1' })!
    expect(a.id).toBe('a1')
    expect(a.color).toBe('#facc15')
  })

  it('sin rótulo, la herramienta de texto no crea nada', () => {
    expect(annotationFromGeometry('text', new Point([0, 0]), { color: '#facc15' })).toBeNull()
    expect(annotationFromGeometry('text', new Point([0, 0]), { color: '#facc15', text: 'eco' })).not.toBeNull()
  })
})

describe('arrowRotation', () => {
  it('apunta al norte con rotación 0 y al este con π/2', () => {
    expect(arrowRotation([0, 0], [0, 10])).toBeCloseTo(0, 6)
    expect(arrowRotation([0, 0], [10, 0])).toBeCloseTo(Math.PI / 2, 6)
  })
})

describe('annotationStyle', () => {
  it('flecha: halo + trazo + punta', () => {
    const a = makeAnnotation('arrow', [[0, 0], [10, 10]], { color: '#facc15' })!
    const styles = annotationStyle(annotationFeature(a)!)
    expect(styles).toHaveLength(3)
    expect(styles[1]!.getStroke()!.getColor()).toBe('#facc15')
    expect(styles[2]!.getImage()).not.toBeNull()
  })

  it('trazo libre: sin punta de flecha', () => {
    const a = makeAnnotation('freehand', [[0, 0], [1, 1], [2, 2]])!
    expect(annotationStyle(annotationFeature(a)!)).toHaveLength(2)
  })

  it('texto: dibuja el rótulo y nada más', () => {
    const a = makeAnnotation('text', [[0, 0]], { text: 'eco gancho' })!
    const styles = annotationStyle(annotationFeature(a)!)
    expect(styles).toHaveLength(1)
    expect(styles[0]!.getText()!.getText()).toBe('eco gancho')
  })

  it('una feature ajena (fenómenos) no recibe estilo de anotación', () => {
    expect(annotationStyle(new Feature({ geometry: new Point([0, 0]) }))).toEqual([])
  })
})

describe('buildAnnotationFeatures', () => {
  it('salta las degeneradas y deja el modelo en la prop', () => {
    const ok = makeAnnotation('arrow', [[0, 0], [10, 10]])!
    const degenerada = { ...ok, id: 'x', kind: 'circle' as const, coords: [[0, 0], [0, 0]] as [number, number][] }
    const features = buildAnnotationFeatures([ok, degenerada])
    expect(features).toHaveLength(1)
    expect(features[0]!.get(ANNOTATION_PROP)).toBe(ok)
    expect(features[0]!.getId()).toBe(ok.id)
  })
})

describe('drawTypeFor', () => {
  it('mapea cada herramienta al tipo de Draw de OL', () => {
    expect(drawTypeFor('arrow')).toBe('LineString')
    expect(drawTypeFor('freehand')).toBe('LineString')
    expect(drawTypeFor('circle')).toBe('Circle')
    expect(drawTypeFor('text')).toBe('Point')
  })
})
