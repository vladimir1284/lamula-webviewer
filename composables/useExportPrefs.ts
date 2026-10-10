// Preferencias del export (F7). Clave propia `lamula:export`, deliberadamente
// separada de `lamula:prefs`: aquella ya va por la v5 con cadena de
// migraciones y se lee en cada arranque — el export no tiene por qué
// engordarla, y aquí además vive el avatar del usuario (una data-URL, que
// nunca debería viajar en el objeto del arranque).
//
// El avatar NO sale del navegador (decisión 40): se normaliza a 128×128 PNG
// antes de guardarse (utils/export/images.ts) y solo se dibuja en el canvas.
//
// Solo cliente: localStorage no existe en SSR.
import type { ChromeMode, ChromeParts } from '../utils/export/chrome'

export interface ExportPrefs {
  v: 2
  chrome: ChromeMode
  parts: ChromeParts
  /** píxeles de salida por píxel CSS */
  scale: 1 | 2
  /** foto del usuario como data-URL, o null (F7.2) */
  avatarDataUrl: string | null
}

export const EXPORT_PREF_DEFAULTS: Omit<ExportPrefs, 'v'> = {
  chrome: 'bar',
  parts: { title: true, meta: true, legend: true, attribution: true, watermark: true, avatar: false },
  scale: 2,
  avatarDataUrl: null,
}

const KEY = 'lamula:export'
const PART_KEYS = ['title', 'meta', 'legend', 'attribution', 'watermark', 'avatar'] as const

function defaults(): ExportPrefs {
  return { v: 2, ...EXPORT_PREF_DEFAULTS, parts: { ...EXPORT_PREF_DEFAULTS.parts } }
}

function isChromeMode(v: unknown): v is ChromeMode {
  return v === 'bar' || v === 'overlay' || v === 'none'
}

/** Tolerante con las claves nuevas: la v1 no tenía `watermark` ni `avatar`. */
function readParts(v: unknown): ChromeParts | null {
  if (typeof v !== 'object' || v === null) return null
  const raw = v as Record<string, unknown>
  const parts = { ...EXPORT_PREF_DEFAULTS.parts }
  for (const k of PART_KEYS) {
    if (typeof raw[k] === 'boolean') parts[k] = raw[k]
    else if (k !== 'watermark' && k !== 'avatar') return null
  }
  return parts
}

function readAvatar(v: unknown): string | null {
  return typeof v === 'string' && v.startsWith('data:image/') ? v : null
}

/**
 * Acepta v1 y v2. La v1 se migra en memoria (marca de agua activada, avatar
 * sin foto) y se reescribe en el siguiente guardado: una preferencia perdida
 * es más barata que una cadena de migraciones en disco.
 */
export function loadExportPrefs(): ExportPrefs {
  if (typeof localStorage === 'undefined') return defaults()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.v !== 1 && parsed.v !== 2) return defaults()
    const parts = readParts(parsed.parts)
    if (!isChromeMode(parsed.chrome) || !parts) return defaults()
    if (parsed.scale !== 1 && parsed.scale !== 2) return defaults()
    return {
      v: 2,
      chrome: parsed.chrome,
      parts,
      scale: parsed.scale,
      avatarDataUrl: readAvatar(parsed.avatarDataUrl),
    }
  }
  catch {
    return defaults()
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
