import { describe, expect, it } from 'vitest'
import {
  buildLevelColorTable,
  colorForValue,
  hexToRgb,
  levelToPhysical,
} from '../../shared/products/palette'
import type { Palette } from '../../shared/products/palette'
import { n0b } from '../../shared/products/defs/n0b'
import { n0g } from '../../shared/products/defs/n0g'

// Calibración real del feed (fixtures grabadas): N0B scale 0.5, offset -33.
const N0B_SCALE = 0.5
const N0B_OFFSET = -33

const rgbaAt = (table: Uint8ClampedArray, level: number) =>
  [...table.slice(level * 4, level * 4 + 4)]

describe('colorForValue', () => {
  const steps: Palette = {
    unit: 'x',
    mode: 'steps',
    stops: [[10, '#ff0000'], [20, '#00ff00'], [30, '#0000ff']],
    ticks: [],
    rangeFoldedColor: null,
  }

  it('debajo del primer stop → null (transparente)', () => {
    expect(colorForValue(steps, 9.99)).toBeNull()
  })

  it('steps: color constante dentro del tramo', () => {
    expect(colorForValue(steps, 10)).toEqual([255, 0, 0])
    expect(colorForValue(steps, 19.9)).toEqual([255, 0, 0])
    expect(colorForValue(steps, 20)).toEqual([0, 255, 0])
  })

  it('steps: por encima del último stop mantiene el último color', () => {
    expect(colorForValue(steps, 999)).toEqual([0, 0, 255])
  })

  const interpolated: Palette = { ...steps, mode: 'interpolated' }

  it('interpolated: lerp lineal entre stops', () => {
    expect(colorForValue(interpolated, 15)).toEqual([128, 128, 0])
    expect(colorForValue(interpolated, 10)).toEqual([255, 0, 0])
    expect(colorForValue(interpolated, 30)).toEqual([0, 0, 255])
  })
})

describe('buildLevelColorTable (contrato: 0 nodata, 1 RF, ≥2 datos)', () => {
  const table = buildLevelColorTable(n0b.palette, N0B_SCALE, N0B_OFFSET, 186)

  it('nivel 0 transparente', () => {
    expect(rgbaAt(table, 0)).toEqual([0, 0, 0, 0])
  })

  it('nivel 1 = color range folded del producto', () => {
    expect(rgbaAt(table, 1)).toEqual([...hexToRgb(n0b.palette.rangeFoldedColor!), 255])
  })

  it('niveles bajo el primer stop (< 5 dBZ) transparentes', () => {
    // nivel 75 → 4.5 dBZ, aún bajo el umbral de 5
    expect(rgbaAt(table, 75)).toEqual([0, 0, 0, 0])
    // nivel 76 → 5.0 dBZ → primer color
    expect(rgbaAt(table, 76)).toEqual([...hexToRgb('#04e9e7'), 255])
  })

  it('escalón correcto en mitad del rango: nivel 156 → 45 dBZ', () => {
    expect(levelToPhysical(156, N0B_SCALE, N0B_OFFSET)).toBe(45)
    expect(rgbaAt(table, 156)).toEqual([...hexToRgb('#fd9500'), 255])
  })

  it('niveles por encima de max_level transparentes', () => {
    expect(rgbaAt(table, 187)).toEqual([0, 0, 0, 0])
    expect(rgbaAt(table, 255)).toEqual([0, 0, 0, 0])
  })

  it('max_level null no recorta', () => {
    const uncapped = buildLevelColorTable(n0b.palette, N0B_SCALE, N0B_OFFSET, null)
    expect(rgbaAt(uncapped, 255)[3]).toBe(255)
  })
})

describe('paleta divergente de velocidad (N0G, scale 0.5, offset -64.5)', () => {
  const table = buildLevelColorTable(n0g.palette, 0.5, -64.5, 255)

  it('nivel 129 → 0 kt → gris del centro', () => {
    expect(levelToPhysical(129, 0.5, -64.5)).toBe(0)
    expect(rgbaAt(table, 129)).toEqual([...hexToRgb('#767676'), 255])
  })

  it('acercándose (negativo) verde, alejándose (positivo) rojo', () => {
    const inbound = rgbaAt(table, 20) // -54.5 kt
    const outbound = rgbaAt(table, 240) // 55.5 kt
    expect(inbound[1]).toBeGreaterThan(inbound[0]!) // G > R
    expect(outbound[0]).toBeGreaterThan(outbound[1]!) // R > G
  })
})
