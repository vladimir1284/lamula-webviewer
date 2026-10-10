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
 * Capacidad de captura que expone `RadarMap.vue`. Deliberadamente no filtra la
 * instancia `ol/Map`: el seam existe para que `utils/export/` siga agnóstico al
 * renderer. F7.3 añadirá aquí `activateFrame`, `frameReady`, `setExportClock` y
 * `setExportPixelRatio`.
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
