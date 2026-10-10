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
import { fromLonLat3857 } from './mercator'

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
  /** avance lógico por frame cuando manda el driver del export (F7.3) */
  private exportDtS: number | null = null
  /** píxeles de búfer por píxel CSS; 1 fuera del export */
  private renderRatio = 1
  /** frame lógico pedido / ya pintado: un settle dispara varios renders */
  private exportSeq = 0
  private exportDrawn = 0
  /** firma de la vista con la que se sembró (cambia ⇒ resembrar) */
  private viewKey = ''
  private readonly onVisibility = () => {
    if (document.hidden) this.stopLoop()
    else this.scheduleTick()
  }

  constructor(opts: WindLayerOptions) {
    super({ zIndex: opts.zIndex })
    this.seed = opts.seed
    // Los contenedores de capa de OL son absolute SIN top/left (usan su
    // posición estática): un canvas en flujo aquí empuja esa posición y las
    // capas que siguen (fenómenos) se pintan fuera del viewport.
    this.canvas.style.position = 'absolute'
    this.canvas.style.left = '0'
    this.canvas.style.top = '0'
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
      // durante el export la pausa no puede borrar lo ya pintado: el driver
      // lee el canvas justo después del render
      if (this.exportDtS === null) this.clearCanvas()
    }
    else {
      this.scheduleTick()
    }
  }

  /**
   * Modo export (F7.3): el reloj deja de ser `frameState.time` y pasa a ser un
   * avance fijo por frame que inyecta el driver. `renderSync()` estampa
   * `frameState.time = Date.now()` (ol/Map.js), así que por esa vía no hay
   * determinismo posible. Entrar o salir del modo RESIEMBRA las partículas:
   * dos exports seguidos tienen que partir del mismo estado o nunca serán
   * byte-idénticos.
   */
  setExportMode(dtS: number | null): void {
    // idempotente: el driver la llama en cada frame y resembrar ahí dejaría
    // el viento sin estelas y con las partículas de vuelta al origen
    if (dtS === this.exportDtS) return
    this.exportDtS = dtS
    this.exportSeq = 0
    this.exportDrawn = 0
    this.stopLoop()
    this.reseed()
    if (dtS === null) this.scheduleTick()
  }

  /**
   * Avanza un frame lógico. No pinta: marca el frame como pendiente y deja
   * que el render del mapa (el `renderSync()` de `settle()`) lo dibuje. Un
   * settle provoca más de un render, y repetir el fade de estelas cambiaría
   * los píxeles — de ahí el contador.
   */
  stepExport(): void {
    this.exportSeq += 1
    this.changed()
  }

  /** Búfer a `r` px de salida por px CSS (export a 2×); null vuelve a DPR 1. */
  setExportPixelRatio(r: number | null): void {
    const next = r ?? 1
    if (next === this.renderRatio) return
    this.renderRatio = next
    this.reseed()
  }

  private reseed(): void {
    this.particles = null
    this.viewKey = ''
    this.lastTime = null
    this.clearCanvas()
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
    // DPR 1 deliberado fuera del export: estelas difuminadas no necesitan
    // retina y la mitad de píxeles es la mitad de fillRect/stroke por tick
    // (móvil). El export a 2× sí sube el búfer: junto al raster nítido una
    // estela a mitad de resolución canta.
    const ratio = this.renderRatio
    const bufW = Math.round(width * ratio)
    const bufH = Math.round(height * ratio)
    if (this.canvas.width !== bufW || this.canvas.height !== bufH) {
      this.canvas.width = bufW
      this.canvas.height = bufH
    }
    // tamaño CSS explícito SIEMPRE: con él el compositor del export resuelve
    // esta capa por la rama de `style.width` y no por la de respaldo
    // (utils/export/transform.ts). Con ratio 1 las dos dan lo mismo.
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`

    const ctx = this.ctx
    if (!ctx || this.grid === null || this.paused) return this.canvas
    // el búfer está en px de salida; de aquí abajo se dibuja en px CSS
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    // vista movida (pan/zoom/rotate/resize) → limpiar y resembrar
    const vs = frameState.viewState
    const key = `${vs.center[0]},${vs.center[1]},${vs.resolution},${vs.rotation},${width}x${height}@${ratio}`
    if (key !== this.viewKey || this.particles === null) {
      this.viewKey = key
      this.clearCanvas()
      this.lastTime = null
      this.particles = this.seedParticles(frameState)
    }

    if (this.exportDtS !== null) {
      // frame lógico ya pintado: el render extra de `settle()` no debe
      // volver a atenuar las estelas
      if (this.exportDrawn === this.exportSeq) return this.canvas
      this.exportDrawn = this.exportSeq
    }

    const dtS = this.exportDtS ?? (this.lastTime === null
      ? 0.016
      : Math.min((frameState.time - this.lastTime) / 1000, MAX_DT_S))
    this.lastTime = frameState.time

    // MAX_DT_S protege de hipos reales de rAF, así que NO se sube para el
    // export: un dt grande se parte en n pasos lógicos. El fade de estelas
    // corre n veces, que es justo lo que pasa en pantalla a 60 fps.
    const steps = Math.max(1, Math.ceil(dtS / MAX_DT_S))
    for (let i = 0; i < steps; i++) {
      this.drawStep(ctx, width, height, dtS / steps, frameState)
    }

    if (this.exportDtS === null) this.scheduleTick()
    return this.canvas
  }

  /** Un paso lógico: atenuar lo pintado y sumar el tramo nuevo de cada partícula. */
  private drawStep(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dtS: number,
    frameState: FrameState,
  ): void {
    // estelas: atenuar lo ya pintado antes de sumar el tick nuevo
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = `rgba(0, 0, 0, ${TRAIL_FADE})`
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'source-over'

    ctx.strokeStyle = STROKE
    ctx.lineWidth = LINE_WIDTH
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (const s of this.particles!.tick(dtS)) {
      const p0 = applyTransform(
        frameState.coordinateToPixelTransform,
        fromLonLat3857(s.lon0, s.lat0),
      )
      ctx.moveTo(p0[0]!, p0[1]!)
      const p1 = applyTransform(
        frameState.coordinateToPixelTransform,
        fromLonLat3857(s.lon1, s.lat1),
      )
      ctx.lineTo(p1[0]!, p1[1]!)
    }
    ctx.stroke()
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
