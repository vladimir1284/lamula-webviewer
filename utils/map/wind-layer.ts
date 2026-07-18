// Capa de partículas de viento sobre OpenLayers: `ol/layer/Layer` con
// `render` custom que devuelve un canvas 2D propio (patrón oficial de capa
// canvas, ejemplo "custom-canvas-layer" de OL). Canvas 2D y no WebGL a
// propósito: no compite por el contexto compartido del frame-pool y
// SwiftShader (CI) lo rasteriza sin drama.
//
// Animación: rAF propio que llama `layer.changed()` → OL recompone en cada
// tick (lo mismo que hace durante pan/zoom). La proyección de cada segmento
// usa `frameState.coordinateToPixelTransform`, así que la rotación del mapa
// sale gratis. En cambio de vista (pan/zoom/rotate) se limpia y resiembra —
// comportamiento earth.nullschool: sin resembrado las estelas se "estiran".
import type { WindGridFile } from '#shared/contract'
import type { FrameState } from 'ol/Map'
import { apply as applyTransform } from 'ol/transform'
import Layer from 'ol/layer/Layer'
import { toLonLat } from 'ol/proj'
import { mulberry32, WindParticles } from '../wind/particles'

/** partículas ∝ área del canvas, acotado para móvil/desktop */
const PARTICLES_PER_PX2 = 1 / 15_000
const MIN_PARTICLES = 400
const MAX_PARTICLES = 3000
/** alpha del fade de estelas por tick (destination-in) */
const TRAIL_FADE = 0.92
const STROKE = 'rgba(15, 23, 42, 0.85)' // slate-900: legible sobre OSM y raster
const LINE_WIDTH = 1.4
const MAX_DT_S = 0.05 // tab en background / hipo de rAF: no teletransportar

export interface WindLayerOptions {
  zIndex: number
  /** seed del RNG — fijado en tests/e2e para determinismo */
  seed?: number
}

export class WindParticleLayer extends Layer {
  private readonly canvas = document.createElement('canvas')
  private readonly ctx = this.canvas.getContext('2d')
  private readonly seed: number | undefined
  private grid: WindGridFile | null = null
  private particles: WindParticles | null = null
  private paused = false
  private lastTime: number | null = null
  private rafId: number | null = null
  /** firma de la vista con la que se sembró (cambia ⇒ resembrar) */
  private viewKey = ''
  private readonly onVisibility = () => {
    if (document.hidden) this.stopLoop()
    else this.scheduleTick()
  }

  constructor(opts: WindLayerOptions) {
    super({ zIndex: opts.zIndex })
    this.seed = opts.seed
    this.canvas.style.pointerEvents = 'none'
    this.canvas.classList.add('wind-particle-canvas') // hook de e2e
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /** override del patrón "custom canvas layer" de OL: sin renderer propio */
  override render(frameState: FrameState | null): HTMLElement {
    return frameState ? this.renderFrame(frameState) : this.canvas
  }

  /** null limpia la capa (noData / toggle off) — regla D24. */
  setGrid(grid: WindGridFile | null): void {
    this.grid = grid
    this.particles = null // se resiembra en el próximo render con la vista actual
    this.clearCanvas()
    if (grid === null) this.stopLoop()
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
    this.lastTime = null
  }

  private scheduleTick(): void {
    if (this.rafId !== null || this.paused || this.grid === null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      this.changed() // dispara renderFrame vía el ciclo de render de OL
    })
  }

  private renderFrame(frameState: FrameState): HTMLElement {
    const [width, height] = frameState.size
    // DPR 1 deliberado: estelas difuminadas no necesitan retina y la mitad
    // de píxeles es la mitad de fillRect/stroke por tick (móvil)
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    const ctx = this.ctx
    if (!ctx || this.grid === null || this.paused) return this.canvas

    // vista movida (pan/zoom/rotate/resize) → limpiar y resembrar
    const vs = frameState.viewState
    const key = `${vs.center[0]},${vs.center[1]},${vs.resolution},${vs.rotation},${width}x${height}`
    if (key !== this.viewKey || this.particles === null) {
      this.viewKey = key
      this.clearCanvas()
      this.lastTime = null
      this.particles = this.seedParticles(frameState)
    }

    const dtS = this.lastTime === null
      ? 0.016
      : Math.min((frameState.time - this.lastTime) / 1000, MAX_DT_S)
    this.lastTime = frameState.time

    // estelas: atenuar lo ya pintado antes de sumar el tick nuevo
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE})`
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'

    ctx.strokeStyle = STROKE
    ctx.lineWidth = LINE_WIDTH
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const s of this.particles.tick(dtS)) {
      const p0 = applyTransform(
        frameState.coordinateToPixelTransform,
        fromLonLatInPlace(s.lon0, s.lat0),
      )
      ctx.moveTo(p0[0]!, p0[1]!)
      const p1 = applyTransform(
        frameState.coordinateToPixelTransform,
        fromLonLatInPlace(s.lon1, s.lat1),
      )
      ctx.lineTo(p1[0]!, p1[1]!)
    }
    ctx.stroke()

    this.scheduleTick()
    return this.canvas
  }

  private seedParticles(frameState: FrameState): WindParticles {
    const [width, height] = frameState.size
    const count = Math.max(
      MIN_PARTICLES,
      Math.min(MAX_PARTICLES, Math.round(width * height * PARTICLES_PER_PX2)),
    )
    // extent del frame (3857, ya cubre la bbox rotada) → viewport lon/lat
    const [x0, y0, x1, y1] = frameState.extent ?? [0, 0, 0, 0]
    const sw = toLonLat([x0!, y0!])
    const ne = toLonLat([x1!, y1!])
    return new WindParticles(
      this.grid!,
      { west: sw[0]!, south: sw[1]!, east: ne[0]!, north: ne[1]! },
      { count, rng: this.seed !== undefined ? mulberry32(this.seed) : undefined },
    )
  }
}

// proyección inline EPSG:4326 → EPSG:3857 sin pasar por ol/proj en el hot
// path (miles de llamadas por tick); mismas constantes que usa OL
const R_3857 = 6378137
function fromLonLatInPlace(lon: number, lat: number): [number, number] {
  return [
    (lon * Math.PI * R_3857) / 180,
    R_3857 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ]
}
