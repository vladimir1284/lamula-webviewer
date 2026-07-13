// Datetime compacto en el path de la ruta viewer:
// /{site}/{product}/{YYYYMMDDTHHMMSS} ↔ ISO naive del contrato.
// Compacto porque el ':' del ISO es hostil a proxies/copy-paste; conserva
// el orden lexicográfico y la conversión es 1:1.
import { ISO_NAIVE_RE } from '../contract'

export const PATH_TIME_RE = /^\d{8}T\d{6}$/

export function isoToPath(iso: string): string {
  return iso.replace(/[-:]/g, '')
}

/** ISO naive del contrato, o null si el segmento es malformado o no es una fecha real */
export function pathToIso(seg: string): string | null {
  if (!PATH_TIME_RE.test(seg)) return null
  const iso = `${seg.slice(0, 4)}-${seg.slice(4, 6)}-${seg.slice(6, 11)}:${seg.slice(11, 13)}:${seg.slice(13, 15)}`
  if (!ISO_NAIVE_RE.test(iso)) return null
  // fecha real (mes 13, día 99, hora 25 pasan la regex pero no un Date UTC)
  const d = new Date(`${iso}Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 19) === iso ? iso : null
}
