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
//
// Fetch único por frame: los COGs (<2MB, single-site/product) se traen
// enteros con fetch() propio y se pasan como `blob` a GeoTIFF en vez de
// `url` — evita las ~50 range requests que geotiff.js emite por tile/overview
// bajo `url`. Con el blob ya en memoria, pan/zoom no dispara red de nuevo.
import type Map from 'ol/Map'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import type { Style as WebGLStyle } from 'ol/layer/WebGLTile'
import GeoTIFF from 'ol/source/GeoTIFF'
import type { RasterMeta } from '#shared/contract'
import { getCogBlob } from './cog-cache'

const PREFETCH_CONCURRENCY = 3
/** tope de seguridad (memoria); 20 frames típicos caben sin evicción */
const MAX_POOL = 24

interface PoolEntry {
  frame: RasterMeta
  layer?: WebGLTileLayer
  state: 'pending' | 'fetching' | 'loading' | 'ready' | 'error'
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
    private style: WebGLStyle,
    private readonly callbacks: FramePoolCallbacks,
    opacity = 1,
  ) {
    this.opacity = opacity
    this.map.on('postrender', this.checkReady)
  }

  /** Cambio de producto (misma pool reciclada): repinta capas ya cargadas con la nueva paleta/escala. */
  setStyle(style: WebGLStyle) {
    this.style = style
    for (const entry of this.entries) {
      entry.layer?.setStyle(style)
    }
  }

  /** Reemplaza toda la serie (cambio de site/product/día): dispone lo anterior. */
  setFrames(frames: RasterMeta[]) {
    this.disposeEntries()
    this.activeIndex = -1
    this.entries = frames.slice(0, MAX_POOL).map(frame => ({ frame, state: 'pending' as const }))
    this.schedulePrefetch()
  }

  private async fetchEntry(index: number) {
    const entry = this.entries[index]
    if (!entry || entry.state !== 'pending') return
    entry.state = 'fetching'

    let blob: Blob
    try {
      // cacheado por r2_key (utils/map/cog-cache.ts): un frame ya visto en
      // una ventana anterior no vuelve a bajar por red, solo reconstruye la
      // capa GL a partir del blob ya en memoria.
      blob = await getCogBlob(entry.frame.r2_key, entry.frame.cog_url!)
    }
    catch {
      if (this.entries[index] !== entry) return // serie reemplazada por setFrames: descartar
      entry.state = 'error'
      this.callbacks.onFrameError(index, `No se pudo cargar el COG (${entry.frame.r2_key})`)
      this.schedulePrefetch()
      return
    }
    if (this.entries[index] !== entry) return // stale

    const source = new GeoTIFF({
      sources: [{ blob }],
      normalize: false,
      interpolate: false,
      projection: this.projCode,
      transition: 0,
    })
    source.on('change', () => {
      if (source.getState() !== 'error') return
      if (entry.state === 'error') return
      entry.state = 'error'
      this.callbacks.onFrameError(index, `No se pudo cargar el COG (${entry.frame.r2_key})`)
      this.schedulePrefetch()
    })
    const layer = new WebGLTileLayer({
      source,
      style: this.style,
      opacity: index === this.activeIndex ? this.opacity : 0,
      visible: true,
      zIndex: 5,
    })
    this.map.addLayer(layer)
    entry.layer = layer
    entry.state = 'loading'
  }

  private schedulePrefetch() {
    let active = this.entries.filter(e => e.state === 'fetching' || e.state === 'loading').length

    // Prioridad 1: el frame activo (se dispara de inmediato, salta el límite)
    let fetchedActive = false
    if (this.activeIndex >= 0 && this.activeIndex < this.entries.length) {
      if (this.entries[this.activeIndex]!.state === 'pending') {
        this.fetchEntry(this.activeIndex)
        active++
        fetchedActive = true
      }
    }

    if (active >= PREFETCH_CONCURRENCY) return

    // Prioridad 2: el resto de la serie (diferido para no ahogar el thread principal al inicio)
    const fetchRest = () => {
      // Recalcular 'active' porque pudo haber cambiado mientras esperábamos el idle
      let currentActive = this.entries.filter(e => e.state === 'fetching' || e.state === 'loading').length
      for (let i = 0; i < this.entries.length; i++) {
        if (currentActive >= PREFETCH_CONCURRENCY) break
        const index = (this.activeIndex + 1 + i) % this.entries.length
        if (this.entries[index]?.state === 'pending') {
          this.fetchEntry(index)
          currentActive++
        }
      }
    }

    if (fetchedActive) {
      setTimeout(fetchRest, 50)
    } else {
      fetchRest()
    }
  }

  private checkReady = () => {
    let advanced = false
    this.entries.forEach((entry, i) => {
      if (entry.state !== 'loading' || !entry.layer) return
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
    if (prev?.state === 'ready') prev.layer?.setVisible(false)
    this.activeIndex = index
    this.schedulePrefetch()
    
    const next = this.entries[index]
    if (!next?.layer) return
    next.layer.setVisible(true)
    next.layer.setOpacity(this.opacity)
  }

  setOpacity(opacity: number) {
    this.opacity = opacity
    const active = this.entries[this.activeIndex]
    active?.layer?.setOpacity(opacity)
  }

  /** Capa activa, para el muestreo de valor bajo cursor (getData). */
  getActiveLayer(): WebGLTileLayer | undefined {
    return this.entries[this.activeIndex]?.layer
  }

  isReady(index: number): boolean {
    return this.entries[index]?.state === 'ready'
  }

  /**
   * pan/zoom: el blob de cada frame ya está completo en memoria (no hay
   * tiles parciales que revalidar), así que no hace falta volver a 'loading'
   * ni re-fetch — solo ocultar lo inactivo para no pagar su costo de render.
   */
  invalidateInactive() {
    this.entries.forEach((entry, i) => {
      if (i === this.activeIndex) return
      entry.layer?.setVisible(false)
    })
  }

  private disposeEntries() {
    // el fetch del blob (cog-cache) sigue en curso si estaba pendiente: no
    // se aborta, así completa y queda cacheado para la próxima ventana que
    // lo necesite en vez de perderse con la entry.
    for (const entry of this.entries) {
      if (entry.layer) {
        this.map.removeLayer(entry.layer)
        entry.layer.dispose()
      }
    }
    this.entries = []
  }

  dispose() {
    this.map.un('postrender', this.checkReady)
    this.disposeEntries()
  }
}
