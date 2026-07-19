// gaussianBlurRgba (OffscreenCanvas) no se prueba aquí: happy-dom (entorno
// de vitest.config.ts) no expone OffscreenCanvas — límite del entorno, no
// del código (mismo tipo de gap que tests/unit/phenomena-layer.spec.ts con
// canvas 2D). Cubre solo la parte pura: construcción de LUT→RGBA,
// premultiplicación y el lookup de nivel crudo para el readout de cursor.
import { describe, expect, it } from 'vitest'
import { buildStraightRgba, premultiply, sampleRawLevel } from '../../utils/map/raster-rgba'
import type { LevelColorTable } from '../../shared/products/palette'

function tableWith(entries: Record<number, [number, number, number, number]>): LevelColorTable {
  const table = new Uint8ClampedArray(256 * 4)
  for (const [level, rgba] of Object.entries(entries)) {
    table.set(rgba, Number(level) * 4)
  }
  return table
}

describe('buildStraightRgba', () => {
  it('mapea cada nivel a su color de la tabla, alpha recto (no premultiplicado)', () => {
    const table = tableWith({ 0: [0, 0, 0, 0], 5: [10, 20, 30, 128] })
    const levels = new Uint8Array([0, 5])
    const rgba = buildStraightRgba(levels, table)
    expect([...rgba]).toEqual([0, 0, 0, 0, 10, 20, 30, 128])
  })
})

describe('premultiply', () => {
  it('alpha 255 → rgb sin cambios', () => {
    const straight = new Uint8ClampedArray([200, 100, 50, 255])
    expect([...premultiply(straight)]).toEqual([200, 100, 50, 255])
  })

  it('alpha 0 (nodata) → rgb a 0, sin halo de color falso', () => {
    const straight = new Uint8ClampedArray([200, 100, 50, 0])
    expect([...premultiply(straight)]).toEqual([0, 0, 0, 0])
  })

  it('alpha parcial escala rgb proporcionalmente', () => {
    const straight = new Uint8ClampedArray([255, 0, 0, 128])
    const [r, g, b, a] = premultiply(straight)
    expect(r).toBe(Math.floor((255 * 128) / 255))
    expect(g).toBe(0)
    expect(b).toBe(0)
    expect(a).toBe(128)
  })
})

describe('sampleRawLevel', () => {
  // grid 2x2, extent [0,0,2,2] → 1 unidad por píxel
  const decoded = {
    data: new Uint8Array([1, 2, 3, 4]), // row-major: fila0=[1,2] fila1=[3,4]
    width: 2,
    height: 2,
    extent: [0, 0, 2, 2] as [number, number, number, number],
  }

  it('esquina superior izquierda del extent → primer pixel de la fila 0', () => {
    expect(sampleRawLevel(decoded, 0.1, 1.9)).toBe(1)
  })

  it('esquina superior derecha → segundo pixel de la fila 0', () => {
    expect(sampleRawLevel(decoded, 1.9, 1.9)).toBe(2)
  })

  it('esquina inferior izquierda → primer pixel de la fila 1', () => {
    expect(sampleRawLevel(decoded, 0.1, 0.1)).toBe(3)
  })

  it('fuera del extent → null', () => {
    expect(sampleRawLevel(decoded, -1, 0.5)).toBeNull()
    expect(sampleRawLevel(decoded, 0.5, 5)).toBeNull()
  })
})
