// Preferencias no compartibles (arquitectura: estado en URL). Solo cliente:
// localStorage no existe en SSR — los llamadores aplican prefs tras montar.
// El time jamás se persiste (se pudre con la retención de 72 h).
export interface ViewerPrefs {
  v: 1
  site: string
  product: number
  opacity: number
  base: 'osm' | 'off'
}

const KEY = 'lamula:prefs'

export function loadPrefs(): ViewerPrefs | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ViewerPrefs>
    if (
      parsed.v !== 1
      || typeof parsed.site !== 'string'
      || typeof parsed.product !== 'number'
      || typeof parsed.opacity !== 'number'
      || (parsed.base !== 'osm' && parsed.base !== 'off')
    ) {
      return null
    }
    return parsed as ViewerPrefs
  }
  catch {
    return null // JSON corrupto → como si no hubiera prefs
  }
}

export function savePrefs(patch: Partial<Omit<ViewerPrefs, 'v'>>): void {
  if (typeof localStorage === 'undefined') return
  const current = loadPrefs()
  const next: ViewerPrefs = {
    v: 1,
    site: current?.site ?? '',
    product: current?.product ?? 0,
    opacity: current?.opacity ?? 0.8,
    base: current?.base ?? 'osm',
    ...patch,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  catch {
    // cuota llena / modo privado: las prefs son opcionales, no romper la UI
  }
}
