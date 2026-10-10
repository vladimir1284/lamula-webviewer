// Modelo de las anotaciones del export (F7.2). Puro: ni `ol` ni DOM — la
// capa vectorial que las dibuja vive en utils/map/annotation-layer.ts.
//
// Las coordenadas van en METROS EPSG:3857 (la proyección de la vista), NO en
// píxeles: así la anotación queda clavada a la geografía y sobrevive a
// pan/zoom, a exportar con otro pixelRatio y a la secuencia de frames de
// F7.3. Se guardan redondeadas al metro — la precisión de un trazo a mano
// alzada no da para más y el JSON de localStorage se reduce a la mitad.
//
// Persistencia en localStorage y NO en la URL: es una excepción explícita a
// la decisión 23 (lo compartible vive en la URL), documentada en la decisión
// 40 — un trazo a mano alzada son cientos de puntos y reventaría la longitud
// de la URL.

export const ANNOTATION_KINDS = ['arrow', 'circle', 'text', 'freehand'] as const
export type AnnotationKind = typeof ANNOTATION_KINDS[number]

/** Coordenada EPSG:3857 en metros. */
export type AnnotationPoint = [number, number]

export interface Annotation {
  id: string
  kind: AnnotationKind
  /**
   * arrow: [origen, punta] · circle: [centro, punto del borde] ·
   * text: [ancla] · freehand: traza completa (≥ 2 puntos)
   */
  coords: AnnotationPoint[]
  /** color del trazo, `#rrggbb` */
  color: string
  /** solo kind 'text' */
  text?: string
}

/** Alto contraste sobre radar y sobre mapa base, en ese orden de prioridad. */
export const ANNOTATION_COLORS = ['#f8fafc', '#facc15', '#f97316', '#22d3ee', '#a3e635'] as const
export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0]

/** Puntos mínimos por tipo; menos que eso es un trazo degenerado, no una anotación. */
const MIN_POINTS: Record<AnnotationKind, number> = { arrow: 2, circle: 2, text: 1, freehand: 2 }

const HEX = /^#[0-9a-f]{6}$/i

export function isAnnotationKind(v: unknown): v is AnnotationKind {
  return typeof v === 'string' && (ANNOTATION_KINDS as readonly string[]).includes(v)
}

/** Sin `crypto.randomUUID` a propósito: no existe en todos los contextos no seguros. */
export function newAnnotationId(rand: () => number = Math.random): string {
  return `a${Date.now().toString(36)}${Math.floor(rand() * 1e6).toString(36)}`
}

function roundPoint(p: AnnotationPoint): AnnotationPoint {
  return [Math.round(p[0]), Math.round(p[1])]
}

function readPoint(v: unknown): AnnotationPoint | null {
  if (!Array.isArray(v) || v.length < 2) return null
  const [x, y] = v
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return [x, y]
}

/** Normaliza y valida una anotación cruda; `null` si no es utilizable. */
export function readAnnotation(v: unknown): Annotation | null {
  if (typeof v !== 'object' || v === null) return null
  const raw = v as Record<string, unknown>
  if (typeof raw.id !== 'string' || raw.id === '') return null
  if (!isAnnotationKind(raw.kind)) return null
  if (!Array.isArray(raw.coords)) return null

  const coords: AnnotationPoint[] = []
  for (const c of raw.coords) {
    const p = readPoint(c)
    if (!p) return null // un punto corrupto deja la geometría sin sentido
    coords.push(roundPoint(p))
  }
  if (coords.length < MIN_POINTS[raw.kind]) return null

  const color = typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color : DEFAULT_ANNOTATION_COLOR
  const text = typeof raw.text === 'string' ? raw.text.slice(0, 120) : undefined
  if (raw.kind === 'text' && !text) return null // un rótulo vacío no se ve: es basura

  const out: Annotation = { id: raw.id, kind: raw.kind, coords, color }
  if (text !== undefined) out.text = text
  return out
}

/**
 * Tolerante por diseño: una anotación corrupta se descarta sin tumbar las
 * demás (mismo criterio que los parsers de `attrs` del contrato).
 */
export function readAnnotations(v: unknown): Annotation[] {
  if (!Array.isArray(v)) return []
  const out: Annotation[] = []
  for (const raw of v) {
    const a = readAnnotation(raw)
    if (a) out.push(a)
  }
  return out
}

export function makeAnnotation(
  kind: AnnotationKind,
  coords: AnnotationPoint[],
  opts: { color?: string, text?: string, id?: string } = {},
): Annotation | null {
  return readAnnotation({
    id: opts.id ?? newAnnotationId(),
    kind,
    coords,
    color: opts.color ?? DEFAULT_ANNOTATION_COLOR,
    text: opts.text,
  })
}

/** Radio en metros de un círculo guardado como [centro, punto del borde]. */
export function circleRadius(a: Annotation): number {
  const [c, edge] = a.coords
  if (!c || !edge) return 0
  return Math.hypot(edge[0] - c[0], edge[1] - c[1])
}
