// Núcleo puro del compositor de export: de la geometría de un canvas de capa a
// la matriz con la que hay que dibujarlo en el canvas destino.
//
// Replica el bucle de composición de OL (`ol/renderer/Composite.js:161-193`,
// la rama que corre cuando el `target` del mapa es un canvas) con UNA
// diferencia deliberada: OL cae a `parseFloat(canvas.style.width)/canvas.width`
// cuando no hay `style.transform`, y nuestras capas custom de viento y rayos no
// fijan NINGUNO de los dos (`utils/map/wind-layer.ts`, `lightning-layer.ts`:
// canvas creado a mano, `position:absolute`, DPR 1). Con la receta de OL eso da
// `NaN` y `drawImage` no pinta nada — es decir, la receta canónica descarta en
// silencio exactamente esas dos capas. La rama 3 de aquí las rescata.
//
// Tres formas de canvas conviven en `.ol-layers`:
//   1. Canvas2D (base, labels, cobertura, fenómenos): `style.transform` puesto.
//   2. WebGL (raster): `style.width/height` en px CSS, búfer a `size × DPR`.
//   3. viento / rayos: ni transform ni width; el búfer YA está en px CSS.
import type { CanvasGeometry, Mat2D } from './types'

/**
 * Parsea un `transform` inline de CSS. Devuelve null para `''`, `'none'` o
 * cualquier cosa que no sea una matriz con 6 componentes finitos.
 *
 * No se reutiliza `fromString` de `ol/transform` por dos razones: mantiene este
 * módulo libre de `ol` (requisito del seam), y aquella hace
 * `substring(7)` + `map(parseFloat)` a ciegas — devuelve `[NaN,…]` ante
 * `none` o `matrix3d` en vez de avisar.
 */
export function parseCssMatrix(css: string): Mat2D | null {
  const s = css.trim()
  if (s === '' || s === 'none') return null

  const open = s.indexOf('(')
  if (open < 0 || !s.endsWith(')')) return null
  const fn = s.slice(0, open)
  const nums = s.slice(open + 1, -1).split(',').map(v => Number.parseFloat(v))
  if (nums.some(n => !Number.isFinite(n))) return null

  // matrix3d: a,b,c,d,e,f son m11,m12,m21,m22,m41,m42
  if (fn === 'matrix3d' && nums.length === 16) {
    return [nums[0]!, nums[1]!, nums[4]!, nums[5]!, nums[12]!, nums[13]!]
  }
  if (fn === 'matrix' && nums.length === 6) {
    return [nums[0]!, nums[1]!, nums[2]!, nums[3]!, nums[4]!, nums[5]!]
  }
  return null
}

/** Escala la matriz por `r` POR LA IZQUIERDA: primero M (canvas → px CSS), luego scale(r). */
function preScale(m: Mat2D, r: number): Mat2D {
  return [m[0] * r, m[1] * r, m[2] * r, m[3] * r, m[4] * r, m[5] * r]
}

/**
 * Matriz con la que dibujar el canvas de una capa en el canvas destino, que
 * está en `viewportCss × targetPixelRatio` píxeles.
 *
 * @returns null si la capa no se debe dibujar (búfer vacío — mismo criterio
 * que el `canvas.width > 0` de OL).
 */
export function layerDrawTransform(
  g: CanvasGeometry,
  viewportCss: readonly [number, number],
  targetPixelRatio: number,
): Mat2D | null {
  if (!(g.intrinsicWidth > 0) || !(g.intrinsicHeight > 0)) return null
  const r = targetPixelRatio

  // 1. transform inline de OL: ya mapea píxeles del búfer a px CSS del viewport
  const m = parseCssMatrix(g.styleTransform)
  if (m) return preScale(m, r)

  // 2. tamaño CSS declarado (WebGL): sw/iw es 1/DPR
  const sw = Number.parseFloat(g.styleWidth)
  const sh = Number.parseFloat(g.styleHeight)
  if (Number.isFinite(sw) && Number.isFinite(sh) && sw > 0 && sh > 0) {
    return [(sw / g.intrinsicWidth) * r, 0, 0, (sh / g.intrinsicHeight) * r, 0, 0]
  }

  // 3. viento / rayos: el búfer está en px CSS, se estira al viewport
  const [vw, vh] = viewportCss
  if (vw > 0 && vh > 0) {
    return [(vw / g.intrinsicWidth) * r, 0, 0, (vh / g.intrinsicHeight) * r, 0, 0]
  }

  // sin viewport útil no hay nada que escalar: identidad al DPR destino
  return [r, 0, 0, r, 0, 0]
}

/** Lee la geometría de un canvas vivo. Separado de la matemática para poder testear esta sin DOM. */
export function canvasGeometry(canvas: HTMLCanvasElement): CanvasGeometry {
  return {
    styleTransform: canvas.style.transform,
    styleWidth: canvas.style.width,
    styleHeight: canvas.style.height,
    intrinsicWidth: canvas.width,
    intrinsicHeight: canvas.height,
  }
}
