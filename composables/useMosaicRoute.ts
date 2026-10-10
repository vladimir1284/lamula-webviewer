// Puente ruta ⇄ mosaicViewerMachine — hermano reducido de useViewerRoute.ts
// (misma arquitectura URL-manda, decisión 18), indexado por `domain` en vez
// de `site`.
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { isBaseMapId } from '#shared/basemaps'
import { isoToPath, pathToIso } from '#shared/url/time-path'
import type { MosaicDisplayQueryParams, MosaicNavigatePatch, MosaicRouteState } from '../machines/mosaic-viewer'

export const DOMAIN_RE = /^[A-Z0-9]{2,12}$/
export const MOSAIC_PRODUCT_RE = /^\d+$/
export const MOSAIC_DEFAULT_OPACITY = 0.8

/** null si la ruta actual no es una ruta del mosaico o trae params inválidos */
export function parseMosaicRoute(
  route: RouteLocationNormalizedLoaded,
): MosaicRouteState | null {
  const { domain, product, time } = route.params
  if (typeof domain !== 'string' || !DOMAIN_RE.test(domain)) return null
  if (typeof product !== 'string' || !MOSAIC_PRODUCT_RE.test(product)) return null

  let timeIso: string | null = null
  if (typeof time === 'string' && time !== '') {
    timeIso = pathToIso(time)
    if (timeIso === null) return null
  }

  const rawOpacity = Number.parseFloat(String(route.query.opacity ?? ''))
  const opacity = Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0, rawOpacity)) : MOSAIC_DEFAULT_OPACITY

  // ausencia = default (el overlay de cobertura siempre va encendido salvo
  // que el usuario lo apague explícitamente — D43/P4)
  const coverage = route.query.coverage !== '0'

  return {
    domain,
    product: Number(product),
    time: timeIso,
    opacity,
    base: isBaseMapId(route.query.base) ? route.query.base : 'osm',
    coverage,
  }
}

export function mosaicQueryPatch(params: MosaicDisplayQueryParams): Record<string, string | undefined> {
  return {
    opacity: params.opacity !== MOSAIC_DEFAULT_OPACITY ? String(params.opacity) : undefined,
    base: params.base !== 'osm' ? params.base : undefined,
    coverage: params.coverage ? undefined : '0',
  }
}

export function mosaicPath(sel: { domain: string, product: number, time: string | null }): string {
  const timeSeg = sel.time === null ? '' : `/${isoToPath(sel.time)}`
  return `/mosaic/${sel.domain}/${sel.product}${timeSeg}`
}

export function useMosaicNavigate() {
  const route = useRoute()
  const router = useRouter()
  return (patch: MosaicNavigatePatch, mode: 'push' | 'replace') => {
    const current = parseMosaicRoute(route)
    if (!current) return
    const next = { ...current, ...patch }
    router[mode]({ path: mosaicPath(next), query: route.query })
  }
}
