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
  /** fase inyectada por el driver del export (F7.3); null ⇒ reloj real */
  private exportPhase: number | null = null
  /** píxeles de búfer por píxel CSS; 1 fuera del export */
  private renderRatio = 1
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
      // durante el export la pausa no puede borrar lo ya pintado: el driver
      // lee el canvas justo después del render
      if (this.exportPhase === null) this.clearCanvas()
    }
    else {
      this.loopOriginMs = null // reanudar = bucle desde cero, sin salto
      this.scheduleTick()
    }
  }

  /**
   * Fase 0–1 inyectada por el driver del export (F7.3); null devuelve el
   * reloj real. A diferencia del viento, aquí no hay estado acumulado: el
   * canvas se limpia y se repinta entero, así que repetir el render de la
   * misma fase da exactamente los mismos píxeles. Como la edad es modular,
   * repartir las fases en `k/N` cierra el bucle del GIF sin costura.
   */
  setExportPhase(phase: number | null): void {
    this.exportPhase = phase
    if (phase === null) {
      this.loopOriginMs = null
      this.scheduleTick()
      return
    }
    this.stopLoop()
    this.changed()
  }

  /** Búfer a `r` px de salida por px CSS (export a 2×); null vuelve a DPR 1. */
  setExportPixelRatio(r: number | null): void {
    this.renderRatio = r ?? 1
    this.changed()
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
    // DPR 1 deliberado fuera del export (misma razón que el viento):
    // destellos difuminados no necesitan retina y la mitad de píxeles es la
    // mitad de trabajo. El export a 2× sí sube el búfer.
    const ratio = this.renderRatio
    const bufW = Math.round(width * ratio)
    const bufH = Math.round(height * ratio)
    if (this.canvas.width !== bufW || this.canvas.height !== bufH) {
      this.canvas.width = bufW
      this.canvas.height = bufH
    }
    // ver la nota equivalente en wind-layer.ts: con tamaño CSS explícito el
    // compositor del export resuelve la capa por la rama de `style.width`
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`

    const ctx = this.ctx
    if (!ctx || this.paused || this.strikes === null || this.strikes.length === 0) {
      return this.canvas
    }
    // el búfer está en px de salida; de aquí abajo se dibuja en px CSS
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    if (this.loopOriginMs === null) this.loopOriginMs = frameState.time
    const phase = this.exportPhase ?? loopPhase(frameState.time, this.loopOriginMs)

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

    if (this.exportPhase === null) this.scheduleTick()
    return this.canvas
  }
}
