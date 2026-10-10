// Tipos compartidos de la cápsula de exportación (F7). Este directorio NO
// importa `ol`: el núcleo tiene que ser testeable en Vitest sin navegador y
// invocable desde `page.evaluate` en e2e. El mapa entra por un handle que
// `RadarMap.vue` expone con `defineExpose`.

/** Matriz afín 2D en el orden de SVGMatrix / CanvasRenderingContext2D.transform */
export type Mat2D = [number, number, number, number, number, number]

/** Lo que el compositor necesita saber de un canvas, sin tocar el DOM. */
export interface CanvasGeometry {
  /** `canvas.style.transform` — inline, tal cual lo escribe OL */
  styleTransform: string
  styleWidth: string
  styleHeight: string
  /** `canvas.width` / `canvas.height` (píxeles del búfer) */
  intrinsicWidth: number
  intrinsicHeight: number
}

/**
 * Reloj inyectado a las capas animadas durante un export (F7.3). Sin esto no
 * hay determinismo: `renderSync()` estampa `frameState.time = Date.now()`.
 */
export interface ExportClock {
  /** fase 0–1 del bucle de rayos */
  lightningPhase: number
  /** segundos de avance lógico del viento en este frame */
  windDtS: number
}

/**
 * Capacidad de captura que expone `RadarMap.vue`. Deliberadamente no filtra la
 * instancia `ol/Map`: el seam existe para que `utils/export/` siga agnóstico al
 * renderer.
 */
export interface MapCaptureHandle {
  /** contenedor del mapa (el `target` de OL), o null si aún no montó */
  viewportEl: () => HTMLElement | null
  /** tamaño del mapa en píxeles CSS */
  size: () => readonly [number, number] | null
  /**
   * Fuerza un render síncrono y espera a que el mapa quede en reposo.
   * Resuelve `false` si venció el timeout (p. ej. `rendercomplete` ya había
   * disparado antes de engancharse: no vuelve a dispararse).
   */
  settle: (timeoutMs?: number) => Promise<boolean>

  // ── F7.3: secuencia animada ────────────────────────────────────────────
  /** frames en el pool de animación; 0 si el mapa sigue en modo estático */
  frameCount: () => number
  /** índice del frame mostrado ahora (para restaurarlo al acabar) */
  activeFrame: () => number
  /** muestra el frame `i` del pool, sin pasar por el estado de la página */
  activateFrame: (i: number) => void
  /**
   * ¿El frame `i` ya no va a cambiar? Listo, o fallado sin remedio (su COG no
   * existe: fuera de la retención de 72 h del pipeline es lo normal). Esperar
   * solo a 'listo' colgaría la captura hasta el timeout en vez de exportar el
   * mismo blanco que se ve en pantalla.
   */
  frameSettled: (i: number) => boolean
  /** null devuelve a las capas animadas su reloj real */
  setExportClock: (clock: ExportClock | null) => void
  /** sube el búfer de viento y rayos a `r` px por px CSS; null vuelve a 1 */
  setExportPixelRatio: (r: number | null) => void
}

/**
 * Imagen de marca ya decodificada (F7.2). Las dimensiones viajan aparte
 * porque `CanvasImageSource` no las expone de forma uniforme (un SVG sin
 * `width`/`height` no tiene tamaño intrínseco) y el dibujo tiene que ser
 * síncrono: en F7.3 corre una vez por frame.
 */
export interface BrandImage {
  image: CanvasImageSource
  width: number
  height: number
}

export interface ComposeOptions {
  /** píxeles de salida por píxel CSS; 1 o 2 en la práctica */
  pixelRatio: number
  /** color de fondo bajo todas las capas (p. ej. con `?base=off`) */
  background?: string
  /** qué hacer con una capa que contamina el canvas. Default: 'skip' */
  onTaint?: 'skip' | 'throw'
}

export interface ComposeResult {
  canvas: HTMLCanvasElement
  /** índices de los hijos de `.ol-layers` omitidos por tainting, en orden de dibujo */
  skipped: number[]
}
