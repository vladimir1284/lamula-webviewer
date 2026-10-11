// Máscara de cobertura del mosaico (D46): oscurece todo el mapa salvo los
// círculos de los radares que aportaron al slot mostrado. Sustituye a los
// anillos con borde de color (D44): un `Polygon` con N agujeros rompe con
// radares solapados — la winding rule (nonzero/evenodd) cuenta cruces por
// agujero, así que el área donde dos círculos se superponen queda mal
// pintada (oscura cuando debería quedar transparente). Canvas propio con
// `destination-out` no tiene ese problema: punchar dos veces la misma zona
// da el mismo resultado que una vez. Mismo patrón "custom canvas layer" que
// WindParticleLayer/LightningLayer (ver nota de posicionamiento absolute en
// wind-layer.ts), sin animación: solo repinta cuando `setCircles` cambia.
import type { FrameState } from 'ol/Map'
import Layer from 'ol/layer/Layer'
import { circular } from 'ol/geom/Polygon'
import { apply as applyTransform } from 'ol/transform'
import type { CoverageSite } from './coverage-rings-layer'

const MASK_FILL = 'rgba(15, 23, 42, 0.1)'
const CIRCLE_POINTS = 96

/**
 * Vértices en EPSG:3857 del círculo geodésico de cada sitio CONTRIBUYENTE
 * (mismo método que el anillo que sustituye: `circular()` + reproyección —
 * un círculo esférico, no uno plano en 3857 que a cientos de km de radio se
 * ve elíptico/desplazado). Los sitios ausentes no generan círculo: su área
 * queda cubierta por la máscara, igual criterio que la máscara de un solo
 * radar en RadarMap.vue (sin dato ⇒ oscuro).
 */
export function buildMaskCircles(
  sites: CoverageSite[],
  radiusM: number,
  contributing: ReadonlySet<string>,
): number[][][] {
  return sites
    .filter(site => contributing.has(site.site_id))
    .map((site) => {
      const circle = circular([site.lon, site.lat], radiusM, CIRCLE_POINTS)
      circle.transform('EPSG:4326', 'EPSG:3857')
      return circle.getCoordinates()[0]!
    })
}

export interface CoverageMaskLayerOptions {
  zIndex: number
  visible?: boolean
}

export class CoverageMaskLayer extends Layer {
  private readonly canvas = document.createElement('canvas')
  private readonly ctx = this.canvas.getContext('2d')
  private circles: number[][][] = []

  constructor(opts: CoverageMaskLayerOptions) {
    super({ zIndex: opts.zIndex, visible: opts.visible })
    this.canvas.style.position = 'absolute'
    this.canvas.style.left = '0'
    this.canvas.style.top = '0'
    this.canvas.style.pointerEvents = 'none'
    this.canvas.classList.add('coverage-mask-canvas') // hook de e2e
  }

  setCircles(circles: number[][][]): void {
    this.circles = circles
    this.changed()
  }

  /** override del patrón "custom canvas layer" de OL: sin renderer propio */
  override render(frameState: FrameState | null): HTMLElement {
    return frameState ? this.renderFrame(frameState) : this.canvas
  }

  private renderFrame(frameState: FrameState): HTMLElement {
    const [width, height] = frameState.size
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`

    const ctx = this.ctx
    if (!ctx) return this.canvas

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = MASK_FILL
    ctx.fillRect(0, 0, width, height)

    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    for (const coords of this.circles) {
      ctx.beginPath()
      // `applyTransform` muta su argumento in-place (ol/transform), y
      // render() corre en cada repintado del mapa, no solo cuando cambian
      // los círculos — clonar evita corromper `this.circles` tras el primer
      // render (ver nota del módulo).
      coords.forEach((coord, i) => {
        const [px, py] = applyTransform(frameState.coordinateToPixelTransform, coord.slice()) as [number, number]
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'

    return this.canvas
  }
}
