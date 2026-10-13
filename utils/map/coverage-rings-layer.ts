// Overlay de cobertura del mosaico: marcador+label por radar CONTRIBUYENTE
// al slot mostrado (D46). El anillo con borde de color (D44) se sustituyó
// por una máscara de opacidad en canvas (`coverage-mask-layer.ts`, mismo
// criterio que la máscara de un solo radar en RadarMap.vue: sin dato ⇒
// oscuro) — los radares ausentes ya no llevan marcador ni label, su área
// queda cubierta por la máscara sin marca adicional (decisión del usuario).
import Feature from 'ol/Feature'
import { Point } from 'ol/geom'
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
  const color = isContributing ? CONTRIBUTING_COLOR : ABSENT_COLOR
  return new Style({
    image: new Circle({
      radius: 4,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#0f172a', width: 1.5 }),
    }),
    text: new Text({
      text: String(feature.get(COVERAGE_PROP)),
      font: 'bold 11px sans-serif',
      fill: new Fill({ color: isContributing ? '#5eead4' : '#94a3b8' }),
      stroke: new Stroke({ color: '#0f172a', width: 3 }),
      offsetY: -10,
      textBaseline: 'bottom',
      overflow: true,
    }),
  })
}
