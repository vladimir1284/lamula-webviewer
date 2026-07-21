// Preferencias no compartibles (arquitectura: estado en URL). Solo cliente:
// localStorage no existe en SSR — los llamadores aplican prefs tras montar.
// El time jamás se persiste (se pudre con la retención de 72 h).
import type { BaseMapId } from '#shared/basemaps'
import { isBaseMapId } from '#shared/basemaps'

export interface ViewerPrefs {
  v: 4
  site: string
  product: number
  opacity: number
  base: BaseMapId
  /** overlay de alcance del radar visible */
  coverage: boolean
  units: 'imperial' | 'si'
  clock: 'utc' | 'local'
  animationFrames: number
  /** suavizado de la capa raster estática — bilineal GPU + lerp de color (decisión 32) */
  smooth: boolean
  /** radio de suavizado (decisión 33): 1 = solo lerp 1-texel; 2/4/8 = remuestrea
   * el nivel crudo a una grilla más gruesa antes del mismo lerp. Sin efecto si
   * `smooth` es false. */
  smoothRadius: 1 | 2 | 4 | 8
}

export const PREF_DEFAULTS = {
  site: '',
  product: 0,
  opacity: 0.8,
  base: 'osm',
  coverage: true,
  units: 'imperial',
  clock: 'local',
  animationFrames: 12,
  smooth: false,
  smoothRadius: 1,
} as const satisfies Omit<ViewerPrefs, 'v'>

const KEY = 'lamula:prefs'

// shape v1 histórico (pre coverage/units/clock) — se migra en memoria al leer
// y se materializa como v4 en el siguiente savePrefs
function isValidV1(p: Record<string, unknown>): boolean {
  return p.v === 1
    && typeof p.site === 'string'
    && typeof p.product === 'number'
    && typeof p.opacity === 'number'
    && isBaseMapId(p.base)
}

// shape v2 histórico (pre smooth) — idem, se migra en memoria al leer
function isValidV2(p: Record<string, unknown>): boolean {
  return p.v === 2
    && typeof p.site === 'string'
    && typeof p.product === 'number'
    && typeof p.opacity === 'number'
    && isBaseMapId(p.base)
    && typeof p.coverage === 'boolean'
    && (p.units === 'imperial' || p.units === 'si')
    && (p.clock === 'utc' || p.clock === 'local')
    && typeof p.animationFrames === 'number'
}

// shape v3 histórico (pre smoothRadius) — idem, se migra en memoria al leer
// y se materializa como v4 en el siguiente savePrefs
function isValidV3(p: Record<string, unknown>): boolean {
  return p.v === 3
    && typeof p.site === 'string'
    && typeof p.product === 'number'
    && typeof p.opacity === 'number'
    && isBaseMapId(p.base)
    && typeof p.coverage === 'boolean'
    && (p.units === 'imperial' || p.units === 'si')
    && (p.clock === 'utc' || p.clock === 'local')
    && typeof p.animationFrames === 'number'
    && typeof p.smooth === 'boolean'
}

function isValidV4(p: Record<string, unknown> | ViewerPrefs): p is ViewerPrefs {
  return p.v === 4
    && typeof p.site === 'string'
    && typeof p.product === 'number'
    && typeof p.opacity === 'number'
    && isBaseMapId(p.base)
    && typeof p.coverage === 'boolean'
    && (p.units === 'imperial' || p.units === 'si')
    && (p.clock === 'utc' || p.clock === 'local')
    && typeof p.animationFrames === 'number'
    && typeof p.smooth === 'boolean'
    && (p.smoothRadius === 1 || p.smoothRadius === 2 || p.smoothRadius === 4 || p.smoothRadius === 8)
}

export function loadPrefs(): ViewerPrefs | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (isValidV4(parsed)) return parsed
    if (isValidV3(parsed)) {
      return {
        v: 4,
        site: parsed.site as string,
        product: parsed.product as number,
        opacity: parsed.opacity as number,
        base: parsed.base as BaseMapId,
        coverage: parsed.coverage as boolean,
        units: parsed.units as 'imperial' | 'si',
        clock: parsed.clock as 'utc' | 'local',
        animationFrames: parsed.animationFrames as number,
        smooth: parsed.smooth as boolean,
        smoothRadius: PREF_DEFAULTS.smoothRadius,
      }
    }
    if (isValidV2(parsed)) {
      return {
        v: 4,
        site: parsed.site as string,
        product: parsed.product as number,
        opacity: parsed.opacity as number,
        base: parsed.base as BaseMapId,
        coverage: parsed.coverage as boolean,
        units: parsed.units as 'imperial' | 'si',
        clock: parsed.clock as 'utc' | 'local',
        animationFrames: parsed.animationFrames as number,
        smooth: PREF_DEFAULTS.smooth,
        smoothRadius: PREF_DEFAULTS.smoothRadius,
      }
    }
    if (isValidV1(parsed)) {
      return {
        v: 4,
        site: parsed.site as string,
        product: parsed.product as number,
        opacity: parsed.opacity as number,
        base: parsed.base as BaseMapId,
        coverage: PREF_DEFAULTS.coverage,
        units: PREF_DEFAULTS.units,
        clock: PREF_DEFAULTS.clock,
        animationFrames: PREF_DEFAULTS.animationFrames,
        smooth: PREF_DEFAULTS.smooth,
        smoothRadius: PREF_DEFAULTS.smoothRadius,
      }
    }
    return null
  }
  catch {
    return null // JSON corrupto → como si no hubiera prefs
  }
}

export function savePrefs(patch: Partial<Omit<ViewerPrefs, 'v'>>): void {
  if (typeof localStorage === 'undefined') return
  const current = loadPrefs()
  const next: ViewerPrefs = {
    v: 4,
    site: current?.site ?? PREF_DEFAULTS.site,
    product: current?.product ?? PREF_DEFAULTS.product,
    opacity: current?.opacity ?? PREF_DEFAULTS.opacity,
    base: current?.base ?? PREF_DEFAULTS.base,
    coverage: current?.coverage ?? PREF_DEFAULTS.coverage,
    units: current?.units ?? PREF_DEFAULTS.units,
    clock: current?.clock ?? PREF_DEFAULTS.clock,
    animationFrames: current?.animationFrames ?? PREF_DEFAULTS.animationFrames,
    smooth: current?.smooth ?? PREF_DEFAULTS.smooth,
    smoothRadius: current?.smoothRadius ?? PREF_DEFAULTS.smoothRadius,
    ...patch,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  catch {
    // cuota llena / modo privado: las prefs son opcionales, no romper la UI
  }
}
