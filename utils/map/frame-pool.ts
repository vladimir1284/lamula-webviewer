// Pool de capas WebGL para la animación (F3 paso 6). Verificado contra
// node_modules/ol 10.9.0:
//  - visible:false NO carga tiles; opacity:0 SÍ los carga (prefetch "gratis").
//  - N WebGLTileLayer con el mismo className y zIndex contiguo comparten UN
//    contexto WebGL (sin límite práctico de contextos).
//  - setSource() dispone las texturas cacheadas (stutter) — por eso una capa
//    por frame en vez de reciclar una sola.
//  - "frame listo" = layer.getRenderer().renderComplete, muestreado en el
//    postrender del mapa (propiedad semi-pública del renderer; ver
//    docs/maquinas-estado.md § riesgos).
import type Map from 'ol/Map'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import type { Style as WebGLStyle } from 'ol/layer/WebGLTile'
import GeoTIFF from 'ol/source/GeoTIFF'
import type { RasterMeta } from '#shared/contract'

const PREFETCH_CONCURRENCY = 3
/** tope de seguridad (memoria); 20 frames típicos caben sin evicción */
const MAX_POOL = 24

interface PoolEntry {
  layer: WebGLTileLayer
  source: GeoTIFF
  state: 'loading' | 'ready' | 'error'
}

export interface FramePoolCallbacks {
  onFrameReady: (index: number) => void
  onFrameError: (index: number, message: string) => void
}

export class FramePool {
  private entries: PoolEntry[] = []
  private activeIndex = -1
  private opacity: number

  constructor(
    private readonly map: Map,
    private readonly projCode: string,
    private readonly style: WebGLStyle,
    private readonly callbacks: FramePoolCallbacks,
    opacity = 1,
  ) {
    this.opacity = opacity
    this.map.on('postrender', this.checkReady)
  }

  /** Reemplaza toda la serie (cambio de site/product/día): dispone lo anterior. */
  setFrames(frames: RasterMeta[]) {
    this.disposeEntries()
    this.activeIndex = -1
    this.entries = frames.slice(0, MAX_POOL).map((frame, i) => this.createEntry(frame, i))
    this.schedulePrefetch()
  }

  private createEntry(frame: RasterMeta, index: number): PoolEntry {
    const source = new GeoTIFF({
      sources: [{ url: frame.cog_url! }],
      normalize: false,
      interpolate: false,
      projection: this.projCode,
      transition: 0,
    })
    source.on('change', () => {
      if (source.getState() !== 'error') return
      const entry = this.entries[index]
      if (!entry || entry.state === 'error') return
      entry.state = 'error'
      this.callbacks.onFrameError(index, `No se pudo cargar el COG (${frame.r2_key})`)
      this.schedulePrefetch()
    })
    const layer = new WebGLTileLayer({
      source,
      style: this.style,
      opacity: 0,
      visible: false,
      zIndex: 5,
    })
    this.map.addLayer(layer)
    return { layer, source, state: 'loading' }
  }

  /** hasta K entradas 'loading' visibles (opacity 0) a la vez — prefetch acotado */
  private schedulePrefetch() {
    let loading = this.entries.filter(e => e.state === 'loading' && e.layer.getVisible()).length
    for (const entry of this.entries) {
      if (loading >= PREFETCH_CONCURRENCY) break
      if (entry.state === 'loading' && !entry.layer.getVisible()) {
        entry.layer.setVisible(true)
        loading++
      }
    }
  }

  private checkReady = () => {
    let advanced = false
    this.entries.forEach((entry, i) => {
      if (entry.state !== 'loading' || !entry.layer.getVisible()) return
      if (!entry.layer.getRenderer()?.renderComplete) return
      entry.state = 'ready'
      if (i !== this.activeIndex) entry.layer.setVisible(false) // liberado: sin costo de render
      this.callbacks.onFrameReady(i)
      advanced = true
    })
    if (advanced) this.schedulePrefetch()
  }

  /** Muestra el frame `index` — swap instantáneo si ya está listo (texturas ya en GPU). */
  activate(index: number) {
    if (index === this.activeIndex) return
    const prev = this.entries[this.activeIndex]
    if (prev && prev.state === 'ready') prev.layer.setVisible(false)
    this.activeIndex = index
    const next = this.entries[index]
    if (!next) return
    next.layer.setVisible(true)
    next.layer.setOpacity(this.opacity)
  }

  setOpacity(opacity: number) {
    this.opacity = opacity
    const active = this.entries[this.activeIndex]
    active?.layer.setOpacity(opacity)
  }

  /** Capa activa, para el muestreo de valor bajo cursor (getData). */
  getActiveLayer(): WebGLTileLayer | undefined {
    return this.entries[this.activeIndex]?.layer
  }

  isReady(index: number): boolean {
    return this.entries[index]?.state === 'ready'
  }

  /**
   * pan/zoom: el extent cambió — los tiles cacheados de los frames inactivos
   * ya no sirven. El activo se conserva tal cual (sigue siendo válido, sin
   * corte visual); el resto vuelve a 'loading' y se re-prioriza el prefetch.
   */
  invalidateInactive() {
    this.entries.forEach((entry, i) => {
      if (i === this.activeIndex) return
      entry.layer.setVisible(false)
      entry.state = 'loading'
    })
    this.schedulePrefetch()
  }

  private disposeEntries() {
    for (const entry of this.entries) {
      this.map.removeLayer(entry.layer)
      entry.layer.dispose()
    }
    this.entries = []
  }

  dispose() {
    this.map.un('postrender', this.checkReady)
    this.disposeEntries()
  }
}
