// Núcleo del compositor de export (F7.1): las tres formas de canvas que
// conviven en `.ol-layers`. La rama 3 es la que rescata viento y rayos, que la
// receta oficial de OL descarta en silencio (ver cabecera de transform.ts).
import { describe, expect, it } from 'vitest'
import type { CanvasGeometry } from '~/utils/export/types'
import { layerDrawTransform, parseCssMatrix } from '~/utils/export/transform'

const VIEWPORT = [800, 600] as const

function geom(partial: Partial<CanvasGeometry>): CanvasGeometry {
  return {
    styleTransform: '',
    styleWidth: '',
    styleHeight: '',
    intrinsicWidth: 800,
    intrinsicHeight: 600,
    ...partial,
  }
}

describe('parseCssMatrix', () => {
  it('parsea matrix() de 6 componentes', () => {
    expect(parseCssMatrix('matrix(1, 0, 0, 1, 12, -4)')).toEqual([1, 0, 0, 1, 12, -4])
  })

  it('parsea matrix3d() quedándose con a,b,c,d,e,f', () => {
    const m3d = 'matrix3d(2,0,0,0, 0,3,0,0, 0,0,1,0, 10,20,0,1)'
    expect(parseCssMatrix(m3d)).toEqual([2, 0, 0, 3, 10, 20])
  })

  it('devuelve null para vacío, none y basura', () => {
    expect(parseCssMatrix('')).toBeNull()
    expect(parseCssMatrix('   ')).toBeNull()
    expect(parseCssMatrix('none')).toBeNull()
    expect(parseCssMatrix('translate(10px, 4px)')).toBeNull()
    expect(parseCssMatrix('matrix(1, 0, 0, 1, 12)')).toBeNull()
    expect(parseCssMatrix('matrix(1, 0, 0, 1, nope, 0)')).toBeNull()
  })
})

describe('layerDrawTransform', () => {
  it('rama 1 — Canvas2D con transform inline: escala la matriz por el DPR destino', () => {
    const g = geom({ styleTransform: 'matrix(1, 0, 0, 1, 7, -3)', intrinsicWidth: 800, intrinsicHeight: 600 })
    expect(layerDrawTransform(g, VIEWPORT, 1)).toEqual([1, 0, 0, 1, 7, -3])
    expect(layerDrawTransform(g, VIEWPORT, 2)).toEqual([2, 0, 0, 2, 14, -6])
  })

  it('rama 1 — un transform con escala propia (pan/zoom pendiente) se compone, no se pisa', () => {
    const g = geom({ styleTransform: 'matrix(1.5, 0, 0, 1.5, 100, 50)' })
    expect(layerDrawTransform(g, VIEWPORT, 2)).toEqual([3, 0, 0, 3, 200, 100])
  })

  it('rama 2 — WebGL: búfer a size×DPR con style.width en px CSS', () => {
    // pantalla DPR 2: búfer 1600×1200, CSS 800×600
    const g = geom({
      styleWidth: '800px',
      styleHeight: '600px',
      intrinsicWidth: 1600,
      intrinsicHeight: 1200,
    })
    // export a 1×: hay que encoger a la mitad
    expect(layerDrawTransform(g, VIEWPORT, 1)).toEqual([0.5, 0, 0, 0.5, 0, 0])
    // export a 2×: el búfer ya está a la resolución destino
    expect(layerDrawTransform(g, VIEWPORT, 2)).toEqual([1, 0, 0, 1, 0, 0])
  })

  it('rama 3 — viento/rayos: sin transform ni width, el búfer está en px CSS', () => {
    const g = geom({ intrinsicWidth: 800, intrinsicHeight: 600 })
    expect(layerDrawTransform(g, VIEWPORT, 1)).toEqual([1, 0, 0, 1, 0, 0])
    expect(layerDrawTransform(g, VIEWPORT, 2)).toEqual([2, 0, 0, 2, 0, 0])
  })

  it('rama 3 — un búfer desincronizado del viewport se estira al viewport', () => {
    const g = geom({ intrinsicWidth: 400, intrinsicHeight: 300 })
    expect(layerDrawTransform(g, VIEWPORT, 1)).toEqual([2, 0, 0, 2, 0, 0])
  })

  it('rama 2 gana a la 3, y la 1 gana a ambas', () => {
    const both = geom({
      styleTransform: 'matrix(1, 0, 0, 1, 5, 5)',
      styleWidth: '400px',
      styleHeight: '300px',
      intrinsicWidth: 800,
      intrinsicHeight: 600,
    })
    expect(layerDrawTransform(both, VIEWPORT, 1)).toEqual([1, 0, 0, 1, 5, 5])

    const widthOnly = geom({ styleWidth: '400px', styleHeight: '300px', intrinsicWidth: 800, intrinsicHeight: 600 })
    expect(layerDrawTransform(widthOnly, VIEWPORT, 1)).toEqual([0.5, 0, 0, 0.5, 0, 0])
  })

  it('búfer vacío ⇒ null (mismo criterio que el canvas.width > 0 de OL)', () => {
    expect(layerDrawTransform(geom({ intrinsicWidth: 0 }), VIEWPORT, 1)).toBeNull()
    expect(layerDrawTransform(geom({ intrinsicHeight: 0 }), VIEWPORT, 1)).toBeNull()
  })

  it('style.width sin unidades útiles cae a la rama 3 en vez de dar NaN', () => {
    const g = geom({ styleWidth: 'auto', styleHeight: 'auto', intrinsicWidth: 800, intrinsicHeight: 600 })
    expect(layerDrawTransform(g, VIEWPORT, 2)).toEqual([2, 0, 0, 2, 0, 0])
  })

  it('viewport degenerado ⇒ identidad al DPR destino, nunca NaN', () => {
    const g = geom({ intrinsicWidth: 10, intrinsicHeight: 10 })
    expect(layerDrawTransform(g, [0, 0], 2)).toEqual([2, 0, 0, 2, 0, 0])
  })
})
