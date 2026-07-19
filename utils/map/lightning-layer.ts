// Capa de rayos animados sobre OpenLayers: mismo patrón "custom canvas
// layer" que WindParticleLayer (canvas 2D propio devuelto por `render`,
// rAF vía `layer.changed()`, posicionado absolute — ver la nota de
// desplazamiento de capas en wind-layer.ts). Canvas 2D a propósito: no
// compite por el contexto WebGL del frame-pool y SwiftShader (CI) lo
// rasteriza sin drama.
//
// El reloj del bucle vive aquí: `setStrikes()` lo reinicia (cambiar de
// frame de radar ⇒ el bucle arranca en fase 0), la matemática de fase/
// vida/color es pura (utils/lightning/anim.ts) — la capa solo proyecta y
// pinta. A diferencia del viento no hay estelas: se limpia y repinta
// entero cada tick.
import type { FrameState } from 'ol/Map'
import Layer from 'ol/layer/Layer'
import { apply as applyTransform } from 'ol/transform'
import { drawList, loopPhase } from '../lightning/anim'
import type { NormalizedStrike } from '../overlay/lightning-join'
import { fromLonLat3857 } from './mercator'

const BASE_RADIUS_PX = 3
/** halo exterior (destello): múltiplo del radio y fracción del alpha */
const GLOW_SCALE = 2.5
const GLOW_ALPHA = 0.35

export interface LightningLayerOptions {
  zIndex: number
}

export class LightningLayer extends Layer {
  private readonly canvas = document.createElement('canvas')
  private readonly ctx = this.canvas.getContext('2d')
  private strikes: NormalizedStrike[] | null = null
  private paused = false
  private rafId: number | null = null
  /** origen del bucle (frameState.time); null ⇒ fase 0 en el próximo tick */
  private loopOriginMs: number | null = null
  private readonly onVisibility = () => {
    if (document.hidden) this.stopLoop()
    else this.scheduleTick()
  }

  constructor(opts: LightningLayerOptions) {
    super({ zIndex: opts.zIndex })
    // misma regla que la capa de viento: los contenedores de capa de OL
    // son absolute sin top/left — un canvas en flujo desplaza las capas
    // siguientes fuera del viewport
    this.canvas.style.position = 'absolute'
    this.canvas.style.left = '0'
    this.canvas.style.top = '0'
    this.canvas.style.pointerEvents = 'none'
    this.canvas.classList.add('lightning-canvas') // hook de e2e
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /** override del patrón "custom canvas layer" de OL: sin renderer propio */
  override render(frameState: FrameState | null): HTMLElement {
    return frameState ? this.renderFrame(frameState) : this.canvas
  }

  /** null limpia la capa (noData / toggle off); una lista nueva reinicia
   * el reloj del bucle (frame nuevo ⇒ bucle desde cero). */
  setStrikes(strikes: NormalizedStrike[] | null): void {
    this.strikes = strikes
    this.loopOriginMs = null
    this.clearCanvas()
    if (strikes === null || strikes.length === 0) this.stopLoop()
    else this.scheduleTick()
  }

  /** pausa dura (animación de frames del radar reproduciendo, etc.) */
  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) {
      this.stopLoop()
      this.clearCanvas()
    }
    else {
      this.loopOriginMs = null // reanudar = bucle desde cero, sin salto
      this.scheduleTick()
    }
  }

  protected override disposeInternal(): void {
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.stopLoop()
    super.disposeInternal()
  }

  private clearCanvas(): void {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private scheduleTick(): void {
    if (this.rafId !== null || this.paused) return
    if (this.strikes === null || this.strikes.length === 0) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.changed() // dispara renderFrame vía el ciclo de render de OL
    })
  }

  private renderFrame(frameState: FrameState): HTMLElement {
    const [width, height] = frameState.size
    // DPR 1 deliberado (misma razón que el viento): destellos difuminados
    // no necesitan retina y la mitad de píxeles es la mitad de trabajo
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    const ctx = this.ctx
    if (!ctx || this.paused || this.strikes === null || this.strikes.length === 0) {
      return this.canvas
    }

    if (this.loopOriginMs === null) this.loopOriginMs = frameState.time
    const phase = loopPhase(frameState.time, this.loopOriginMs)

    ctx.clearRect(0, 0, width, height)
    // los destellos suman luz entre sí (varios rayos juntos = más brillo)
    ctx.globalCompositeOperation = 'lighter'
    for (const dot of drawList(this.strikes, phase, BASE_RADIUS_PX)) {
      const [x, y] = applyTransform(
        frameState.coordinateToPixelTransform,
        fromLonLat3857(dot.lon, dot.lat),
      ) as [number, number]
      const [r, g, b] = dot.color
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${dot.alpha * GLOW_ALPHA})`
      ctx.beginPath()
      ctx.arc(x, y, dot.radius * GLOW_SCALE, 0, 2 * Math.PI)
      ctx.fill()
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${dot.alpha})`
      ctx.beginPath()
      ctx.arc(x, y, dot.radius, 0, 2 * Math.PI)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'

    this.scheduleTick()
    return this.canvas
  }
}
