// Nombre del fichero exportado. Puro y determinista: el vol_time va en el
// mismo formato compacto que la URL (`shared/url/time-path.ts`), así que el
// nombre del fichero y el deep-link que lo reproduce son el mismo string.
import { isoToPath } from '#shared/url/time-path'

const SLUG_RE = /[^A-Z0-9]+/gi

function slug(s: string): string {
  return s.replace(SLUG_RE, '').toUpperCase()
}

export interface ExportFilenameParts {
  site: string
  /** mnemónico del producto (N0B, N0G…); si falta, el código numérico */
  product: string | number
  /** ISO naive UTC del volumen, o null si no hay dato resuelto */
  volTime: string | null
  /** extensión sin punto: 'png', 'gif', 'webm', 'mp4' */
  ext: string
  /** solo para tests: sustituye al reloj cuando no hay volTime */
  now?: Date
}

export function exportFilename(p: ExportFilenameParts): string {
  const stamp = p.volTime
    ? `${isoToPath(p.volTime)}Z`
    : `${isoToPath((p.now ?? new Date()).toISOString().slice(0, 19))}Z`
  return `lamula_${slug(p.site)}_${slug(String(p.product))}_${stamp}.${p.ext}`
}
