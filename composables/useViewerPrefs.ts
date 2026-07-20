// Preferencias no compartibles (arquitectura: estado en URL). Solo cliente:
// localStorage no existe en SSR — los llamadores aplican prefs tras montar.
// El time jamás se persiste (se pudre con la retención de 72 h).
export interface ViewerPrefs {
  v: 3
  site: string
  product: number
  opacity: number
  base: 'osm' | 'off'
  /** overlay de alcance del radar visible */
  coverage: boolean
  units: 'imperial' | 'si'
  clock: 'utc' | 'local'
  animationFrames: number
  /** suavizado de la capa raster estática — bilineal GPU + lerp de color (decisión 29) */
  smooth: boolean
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
} as const satisfies Omit<ViewerPrefs, 'v'>

const KEY = 'lamula:prefs'

// shape v1 histórico (pre coverage/units/clock) — se migra en memoria al leer
// y se materializa como v3 en el siguiente savePrefs
function isValidV1(p: Record<string, unknown>): boolean {
  return p.v === 1
    && typeof p.site === 'string'
    && typeof p.product === 'number'
    && typeof p.opacity === 'number'
    && (p.base === 'osm' || p.base === 'off')
}

// shape v2 histórico (pre smooth) — idem, se migra en memoria al leer
function isValidV2(p: Record<string, unknown>): boolean {
  return p.v === 2
    && typeof p.site === 'string'
    && typeof p.product === 'number'
    && typeof p.opacity === 'number'
    && (p.base === 'osm' || p.base === 'off')
    && typeof p.coverage === 'boolean'
    && (p.units === 'imperial' || p.units === 'si')
    && (p.clock === 'utc' || p.clock === 'local')
    && typeof p.animationFrames === 'number'
}

function isValidV3(p: Record<string, unknown> | ViewerPrefs): p is ViewerPrefs {
  return p.v === 3
    && typeof p.site === 'string'
    && typeof p.product === 'number'
    && typeof p.opacity === 'number'
    && (p.base === 'osm' || p.base === 'off')
    && typeof p.coverage === 'boolean'
    && (p.units === 'imperial' || p.units === 'si')
    && (p.clock === 'utc' || p.clock === 'local')
    && typeof p.animationFrames === 'number'
    && typeof p.smooth === 'boolean'
}

export function loadPrefs(): ViewerPrefs | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (isValidV3(parsed)) return parsed
    if (isValidV2(parsed)) {
      return {
        v: 3,
        site: parsed.site as string,
        product: parsed.product as number,
        opacity: parsed.opacity as number,
        base: parsed.base as 'osm' | 'off',
        coverage: parsed.coverage as boolean,
        units: parsed.units as 'imperial' | 'si',
        clock: parsed.clock as 'utc' | 'local',
        animationFrames: parsed.animationFrames as number,
        smooth: PREF_DEFAULTS.smooth,
      }
    }
    if (isValidV1(parsed)) {
      return {
        v: 3,
        site: parsed.site as string,
        product: parsed.product as number,
        opacity: parsed.opacity as number,
        base: parsed.base as 'osm' | 'off',
        coverage: PREF_DEFAULTS.coverage,
        units: PREF_DEFAULTS.units,
        clock: PREF_DEFAULTS.clock,
        animationFrames: PREF_DEFAULTS.animationFrames,
        smooth: PREF_DEFAULTS.smooth,
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
    v: 3,
    site: current?.site ?? PREF_DEFAULTS.site,
    product: current?.product ?? PREF_DEFAULTS.product,
    opacity: current?.opacity ?? PREF_DEFAULTS.opacity,
    base: current?.base ?? PREF_DEFAULTS.base,
    coverage: current?.coverage ?? PREF_DEFAULTS.coverage,
    units: current?.units ?? PREF_DEFAULTS.units,
    clock: current?.clock ?? PREF_DEFAULTS.clock,
    animationFrames: current?.animationFrames ?? PREF_DEFAULTS.animationFrames,
    smooth: current?.smooth ?? PREF_DEFAULTS.smooth,
    ...patch,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  catch {
    // cuota llena / modo privado: las prefs son opcionales, no romper la UI
  }
}
