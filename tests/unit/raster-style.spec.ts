import { describe, expect, it } from 'vitest'
import { n0b } from '../../shared/products/defs/n0b'
import { rasterStyle, tableToOlColors } from '../../utils/map/raster-style'
import { buildLevelColorTable } from '../../shared/products'

describe('rasterStyle', () => {
  it('expresión palette sobre la banda 1 con 256 colores', () => {
    const style = rasterStyle(n0b.palette, 0.5, -33, 186)
    const [op, band, colors] = style.color as [string, unknown, number[][]]
    expect(op).toBe('palette')
    expect(band).toEqual(['band', 1])
    expect(colors).toHaveLength(256)
  })

  it('tableToOlColors: RGBA 0-255 → [r,g,b,a(0-1)]', () => {
    const table = buildLevelColorTable(n0b.palette, 0.5, -33, 186)
    const colors = tableToOlColors(table)
    expect(colors[0]).toEqual([0, 0, 0, 0]) // nodata
    const level45dbz = colors[156]!
    expect(level45dbz.slice(0, 3)).toEqual([0xFD, 0x95, 0x00])
    expect(level45dbz[3]).toBe(1)
  })
})
