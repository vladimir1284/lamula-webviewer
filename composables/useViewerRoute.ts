// Puente ruta ⇄ viewerMachine (URL manda, decisión 18): parseo de la ruta
// del viewer a ViewerRouteState y efecto de navegación que la máquina
// invoca vía la acción 'navigate'.
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { isBaseMapId } from '#shared/basemaps'
import { isoToPath, pathToIso } from '#shared/url/time-path'
import type { OverlayLayerId, PanelId } from '../machines/overlay'
import { OVERLAY_LAYERS, PANELS } from '../machines/overlay'
import type { NavigatePatch, OverlayQueryParams, ViewerRouteState } from '../machines/viewer'

export const SITE_RE = /^[A-Z0-9]{3}$/
export const PRODUCT_RE = /^\d+$/
export const DEFAULT_OPACITY = 0.8
export const CELL_ID_RE = /^[A-Z0-9]{1,8}$/
export const DEFAULT_SAT_VARIANT = 'ir' as const
export const DEFAULT_SAT_OPACITY = 0.6

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

  // overlays (D23): valores inválidos degradan al default, nunca anulan la ruta
  const layers = [...new Set(
    String(route.query.layers ?? '')
      .split(',')
      .filter((l): l is OverlayLayerId => (OVERLAY_LAYERS as readonly string[]).includes(l)),
  )]
  const rawPanel = route.query.panel
  const panel = typeof rawPanel === 'string' && (PANELS as readonly string[]).includes(rawPanel)
    ? rawPanel as PanelId
    : null
  const rawCell = route.query.cell
  const cell = typeof rawCell === 'string' && CELL_ID_RE.test(rawCell) ? rawCell : null

  // overrides individuales de trayectoria, independientes de trackPast/trackFuture en `layers`
  const pastCells = [...new Set(
    String(route.query.pastCells ?? '').split(',').filter(id => CELL_ID_RE.test(id)),
  )]
  const futureCells = [...new Set(
    String(route.query.futureCells ?? '').split(',').filter(id => CELL_ID_RE.test(id)),
  )]

  // capa de fondo GOES (shareable, no persistida — ver machines/viewer.ts DisplayQueryParams)
  const sat = route.query.sat === '1'
  const satVariant = route.query.satVar === 'vis' ? 'vis' : DEFAULT_SAT_VARIANT
  const rawSatOpacity = Number.parseFloat(String(route.query.satOp ?? ''))
  const satOpacity = Number.isFinite(rawSatOpacity)
    ? Math.min(1, Math.max(0, rawSatOpacity))
    : DEFAULT_SAT_OPACITY

  return {
    site,
    product: Number(product),
    time: timeIso,
    opacity,
    base: isBaseMapId(route.query.base) ? route.query.base : 'osm',
    layers,
    panel,
    cell,
    pastCells,
    futureCells,
    sat,
    satVariant,
    satOpacity,
  }
}

/** Query patch para syncOverlayQuery: ausencia = default (URLs de F3 intactas) */
export function overlayQueryPatch(params: OverlayQueryParams): Record<string, string | undefined> {
  return {
    layers: params.layers.length > 0 ? params.layers.join(',') : undefined,
    panel: params.panel ?? undefined,
    cell: params.cell ?? undefined,
    pastCells: params.pastCells.length > 0 ? params.pastCells.join(',') : undefined,
    futureCells: params.futureCells.length > 0 ? params.futureCells.join(',') : undefined,
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
