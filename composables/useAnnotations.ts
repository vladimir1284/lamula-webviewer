// Persistencia de las anotaciones (F7.2). Clave propia `lamula:annotations`,
// separada de `lamula:export` (preferencias + avatar) y de `lamula:prefs`
// (arranque del viewer): esto crece con cada trazo y no tiene por qué leerse
// en cada carga de página si el usuario nunca anotó.
//
// Deliberadamente fuera de la URL: excepción a la decisión 23 documentada en
// la 40.
import type { AnnotationsBySite } from '../machines/annotation'
import { readAnnotations } from '../utils/export/annotations'

const KEY = 'lamula:annotations'

interface Stored {
  v: 1
  bySite: Record<string, unknown>
}

/** Tolerante: un sitio corrupto se descarta sin arrastrar a los demás. */
export function loadAnnotations(): AnnotationsBySite {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Stored>
    if (parsed?.v !== 1 || typeof parsed.bySite !== 'object' || parsed.bySite === null) return {}
    const out: AnnotationsBySite = {}
    for (const [site, list] of Object.entries(parsed.bySite)) {
      const items = readAnnotations(list)
      if (items.length > 0) out[site] = items
    }
    return out
  }
  catch {
    return {}
  }
}

export function saveAnnotations(bySite: AnnotationsBySite): void {
  if (typeof localStorage === 'undefined') return
  try {
    // los sitios vacíos no se guardan: borrar todo tiene que dejar la clave limpia
    const entries = Object.entries(bySite).filter(([, list]) => list.length > 0)
    if (entries.length === 0) {
      localStorage.removeItem(KEY)
      return
    }
    localStorage.setItem(KEY, JSON.stringify({ v: 1, bySite: Object.fromEntries(entries) } satisfies Stored))
  }
  catch {
    // cuota llena: el trazo se pierde al recargar, no rompe la sesión
  }
}
