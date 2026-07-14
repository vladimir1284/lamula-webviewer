// Puente ruta ⇄ viewerMachine (URL manda, decisión 18): parseo de la ruta
// del viewer a ViewerRouteState y efecto de navegación que la máquina
// invoca vía la acción 'navigate'.
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { isoToPath, pathToIso } from '#shared/url/time-path'
import type { NavigatePatch, ViewerRouteState } from '../machines/viewer'

export const SITE_RE = /^[A-Z0-9]{3}$/
export const PRODUCT_RE = /^\d+$/
export const DEFAULT_OPACITY = 0.8

/** null si la ruta actual no es una ruta del viewer o trae params inválidos */
export function parseViewerRoute(
  route: RouteLocationNormalizedLoaded,
): ViewerRouteState | null {
  const { site, product, time } = route.params
  if (typeof site !== 'string' || !SITE_RE.test(site)) return null
  if (typeof product !== 'string' || !PRODUCT_RE.test(product)) return null

  let timeIso: string | null = null
  if (typeof time === 'string' && time !== '') {
    timeIso = pathToIso(time)
    if (timeIso === null) return null
  }

  const rawOpacity = Number.parseFloat(String(route.query.opacity ?? ''))
  const opacity = Number.isFinite(rawOpacity)
    ? Math.min(1, Math.max(0, rawOpacity))
    : DEFAULT_OPACITY

  return {
    site,
    product: Number(product),
    time: timeIso,
    opacity,
    base: route.query.base === 'off' ? 'off' : 'osm',
  }
}

export function viewerPath(sel: { site: string, product: number, time: string | null }): string {
  const timeSeg = sel.time === null ? '' : `/${isoToPath(sel.time)}`
  return `/${sel.site}/${sel.product}${timeSeg}`
}

/** Efecto de navegación para viewerMachine: aplica el patch conservando el resto */
export function useViewerNavigate() {
  const route = useRoute()
  const router = useRouter()
  return (patch: NavigatePatch, mode: 'push' | 'replace') => {
    const current = parseViewerRoute(route)
    if (!current) return
    const next = { ...current, ...patch }
    router[mode]({ path: viewerPath(next), query: route.query })
  }
}
