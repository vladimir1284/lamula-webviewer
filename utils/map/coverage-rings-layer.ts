// Overlay de cobertura del mosaico (D43/P4): un anillo por radar miembro del
// dominio, estilo sólido para los que aportaron al slot mostrado y estilo
// atenuado/punteado para los ausentes — así el usuario siempre sabe qué
// radares componen lo que está viendo (decisión del usuario, ver resumen de
// la conversación de planificación). Mismo truco geométrico que la máscara
// de cobertura de un solo radar en RadarMap.vue (`circular()` + reproyectar
// a 3857): un círculo esférico centrado en el radar, no un círculo plano en
// 3857 (que a 460 km de radio ya se ve visiblemente elíptico/desplazado).
import Feature from 'ol/Feature'
import { Point } from 'ol/geom'
import { circular } from 'ol/geom/Polygon'
import { fromLonLat } from 'ol/proj'
import Circle from 'ol/style/Circle'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'
import Text from 'ol/style/Text'

export interface CoverageSite {
  site_id: string
  lat: number
  lon: number
}

export const COVERAGE_PROP = 'coverageSite' as const

const CONTRIBUTING_COLOR = 'rgba(45, 212, 191, 0.9)' // teal-400
const ABSENT_COLOR = 'rgba(148, 163, 184, 0.55)' // slate-400

/**
 * Una feature de anillo por sitio. `radiusM` es el radio de la malla del
 * dominio (`MosaicDomainRow.radius_m`): no hay un radio por-radar en el
 * contrato, así que los N anillos salen con el mismo tamaño — aproximación
 * visual, no el alcance físico exacto de cada antena.
 */
export function buildCoverageFeatures(
  sites: CoverageSite[],
  radiusM: number,
  contributing: ReadonlySet<string>,
): Feature[] {
  return sites.map((site) => {
    const circle = circular([site.lon, site.lat], radiusM, 96)
    circle.transform('EPSG:4326', 'EPSG:3857')
    const feature = new Feature(circle)
    feature.set(COVERAGE_PROP, site.site_id)
    feature.set('contributing', contributing.has(site.site_id))
    feature.setGeometryName('geometry')
    return feature
  })
}

export function coverageRingStyle(feature: Feature): Style {
  const isContributing = feature.get('contributing') === true
  const color = isContributing ? CONTRIBUTING_COLOR : ABSENT_COLOR
  return new Style({
    stroke: new Stroke({ color, width: isContributing ? 2 : 1.5, lineDash: isContributing ? undefined : [6, 6] }),
    fill: new Fill({ color: 'rgba(0, 0, 0, 0)' }),
    text: new Text({
      text: String(feature.get(COVERAGE_PROP)),
      font: 'bold 11px sans-serif',
      fill: new Fill({ color: isContributing ? '#5eead4' : '#94a3b8' }),
      stroke: new Stroke({ color: '#0f172a', width: 3 }),
      offsetY: -10,
      textBaseline: 'bottom',
      overflow: true,
    }),
    // el centro del anillo (marcador del sitio) — radio fijo en píxeles vía
    // image no hace falta acá: la propia etiqueta ya marca la posición.
  })
}

/** Marcador puntual en el centro de cada sitio (la antena misma). */
export function buildCoverageCenterFeatures(sites: CoverageSite[], contributing: ReadonlySet<string>): Feature[] {
  return sites.map((site) => {
    const feature = new Feature(new Point(fromLonLat([site.lon, site.lat])))
    feature.set(COVERAGE_PROP, site.site_id)
    feature.set('contributing', contributing.has(site.site_id))
    return feature
  })
}

export function coverageCenterStyle(feature: Feature): Style {
  const isContributing = feature.get('contributing') === true
  return new Style({
    image: new Circle({
      radius: 4,
      fill: new Fill({ color: isContributing ? CONTRIBUTING_COLOR : ABSENT_COLOR }),
      stroke: new Stroke({ color: '#0f172a', width: 1.5 }),
    }),
  })
}
