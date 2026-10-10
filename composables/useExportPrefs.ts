// Preferencias del export (F7). Clave propia `lamula:export`, deliberadamente
// separada de `lamula:prefs`: aquella ya va por la v5 con cadena de
// migraciones y se lee en cada arranque — el export no tiene por qué
// engordarla, y en F7.2 esta clave además guardará el avatar del usuario (una
// data-URL, que nunca debería viajar en el objeto del arranque).
//
// Solo cliente: localStorage no existe en SSR.
import type { ChromeMode, ChromeParts } from '../utils/export/chrome'

export interface ExportPrefs {
  v: 1
  chrome: ChromeMode
  parts: ChromeParts
  /** píxeles de salida por píxel CSS */
  scale: 1 | 2
}

export const EXPORT_PREF_DEFAULTS: Omit<ExportPrefs, 'v'> = {
  chrome: 'bar',
  parts: { title: true, meta: true, legend: true, attribution: true },
  scale: 2,
}

const KEY = 'lamula:export'

function isChromeMode(v: unknown): v is ChromeMode {
  return v === 'bar' || v === 'overlay' || v === 'none'
}

function isParts(v: unknown): v is ChromeParts {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return ['title', 'meta', 'legend', 'attribution'].every(k => typeof p[k] === 'boolean')
}

function isValid(p: Record<string, unknown>): boolean {
  return p.v === 1 && isChromeMode(p.chrome) && isParts(p.parts) && (p.scale === 1 || p.scale === 2)
}

export function loadExportPrefs(): ExportPrefs {
  const fallback: ExportPrefs = { v: 1, ...EXPORT_PREF_DEFAULTS, parts: { ...EXPORT_PREF_DEFAULTS.parts } }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return isValid(parsed) ? (parsed as unknown as ExportPrefs) : fallback
  }
  catch {
    return fallback
  }
}

export function saveExportPrefs(prefs: ExportPrefs): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  }
  catch {
    // cuota llena o modo privado: la preferencia es prescindible
  }
}
