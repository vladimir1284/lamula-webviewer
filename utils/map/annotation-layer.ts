// Capa vectorial de anotaciones (F7.2): features, estilos y conversión
// feature ↔ modelo. El modelo puro vive en utils/export/annotations.ts.
//
// Decisión de fondo: las anotaciones se dibujan en una VectorLayer REAL de
// OL (zIndex 21, sobre fenómenos), no en el chrome del export. Así se ven
// mientras se dibujan, se pueden editar con hit-testing, y al compositor le
// salen gratis — quedan como `div.ol-layer > canvas` con `style.transform`,
// la rama 1 de `layerDrawTransform`, sin tocar una línea de utils/export/.
import Feature from 'ol/Feature'
import { Circle as CircleGeom, LineString, Point } from 'ol/geom'
import type { Geometry } from 'ol/geom'
import Fill from 'ol/style/Fill'
import RegularShape from 'ol/style/RegularShape'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'
import Text from 'ol/style/Text'
import type { Annotation, AnnotationKind, AnnotationPoint } from '../export/annotations'
import { circleRadius, makeAnnotation } from '../export/annotations'

/** props que viajan en la feature; `ann` discrimina contra las de fenómenos ('f4') */
export const ANNOTATION_PROP = 'ann'

const STROKE_WIDTH = 3
const HALO_WIDTH = 6
/** halo oscuro bajo el trazo: legible sobre nieve blanca del radar y sobre mar */
const HALO_COLOR = 'rgba(15, 23, 42, 0.55)'
const LABEL_SIZE = 15
const ARROW_HEAD = 11

export function annotationGeometry(a: Annotation): Geometry | null {
  const first = a.coords[0]
  if (!first) return null
  switch (a.kind) {
    case 'text':
      return new Point(first)
    case 'circle': {
      const r = circleRadius(a)
      return r > 0 ? new CircleGeom(first, r) : null
    }
    case 'arrow':
    case 'freehand':
      return a.coords.length >= 2 ? new LineString(a.coords) : null
  }
}

export function annotationFeature(a: Annotation): Feature | null {
  const geometry = annotationGeometry(a)
  if (!geometry) return null
  const feature = new Feature({ geometry })
  feature.setId(a.id)
  feature.set(ANNOTATION_PROP, a)
  return feature
}

export function buildAnnotationFeatures(items: readonly Annotation[]): Feature[] {
  const out: Feature[] = []
  for (const a of items) {
    const f = annotationFeature(a)
    if (f) out.push(f)
  }
  return out
}

/** Ángulo de la punta de flecha, en el convenio de rotación de RegularShape. */
export function arrowRotation(from: AnnotationPoint, to: AnnotationPoint): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1])
}

function strokeStyles(color: string, geometry?: Geometry): Style[] {
  return [
    new Style({ geometry, stroke: new Stroke({ color: HALO_COLOR, width: HALO_WIDTH, lineCap: 'round', lineJoin: 'round' }) }),
    new Style({ geometry, stroke: new Stroke({ color, width: STROKE_WIDTH, lineCap: 'round', lineJoin: 'round' }) }),
  ]
}

/**
 * Estilo por feature. No se cachea como en phenomena-layer: las anotaciones
 * son unidades sueltas (no 100+ por volumen) y cada una lleva su color.
 */
export function annotationStyle(feature: { get: (key: string) => unknown }): Style[] {
  const a = feature.get(ANNOTATION_PROP) as Annotation | undefined
  if (!a) return []

  if (a.kind === 'text') {
    return [
      new Style({
        text: new Text({
          text: a.text ?? '',
          font: `600 ${LABEL_SIZE}px system-ui, sans-serif`,
          fill: new Fill({ color: a.color }),
          stroke: new Stroke({ color: HALO_COLOR, width: 4 }),
          textAlign: 'left',
          offsetX: 6,
          offsetY: -2,
          overflow: true,
        }),
      }),
    ]
  }

  const styles = strokeStyles(a.color)
  if (a.kind === 'arrow') {
    const from = a.coords[0]
    const to = a.coords[a.coords.length - 1]
    if (from && to) {
      styles.push(new Style({
        geometry: new Point(to),
        image: new RegularShape({
          points: 3,
          radius: ARROW_HEAD,
          rotation: arrowRotation(from, to),
          fill: new Fill({ color: a.color }),
          stroke: new Stroke({ color: HALO_COLOR, width: 2 }),
        }),
      }))
    }
  }
  return styles
}

/** Coordenadas del modelo a partir de la geometría que acaba de dibujar OL. */
export function coordsFromGeometry(kind: AnnotationKind, geometry: Geometry): AnnotationPoint[] | null {
  if (kind === 'circle') {
    if (!(geometry instanceof CircleGeom)) return null
    const c = geometry.getCenter()
    const r = geometry.getRadius()
    if (!c || !(r > 0)) return null
    // el borde se guarda como punto: el modelo no conoce "radio", solo puntos
    return [[c[0]!, c[1]!], [c[0]! + r, c[1]!]]
  }
  if (kind === 'text') {
    if (!(geometry instanceof Point)) return null
    const c = geometry.getCoordinates()
    return [[c[0]!, c[1]!]]
  }
  if (!(geometry instanceof LineString)) return null
  const coords = geometry.getCoordinates().map(c => [c[0]!, c[1]!] as AnnotationPoint)
  return coords.length >= 2 ? coords : null
}

/**
 * Feature recién dibujada (o modificada) → modelo. `id` se pasa al re-leer
 * una existente tras un Modify; omitirlo crea una nueva.
 */
export function annotationFromGeometry(
  kind: AnnotationKind,
  geometry: Geometry,
  opts: { color: string, text?: string, id?: string },
): Annotation | null {
  const coords = coordsFromGeometry(kind, geometry)
  if (!coords) return null
  return makeAnnotation(kind, coords, opts)
}

/** Tipo de geometría que `ol/interaction/Draw` tiene que producir por herramienta. */
export function drawTypeFor(kind: AnnotationKind): 'LineString' | 'Point' | 'Circle' {
  switch (kind) {
    case 'text': return 'Point'
    case 'circle': return 'Circle'
    case 'arrow':
    case 'freehand': return 'LineString'
  }
}
