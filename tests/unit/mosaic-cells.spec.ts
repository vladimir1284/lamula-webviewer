// mosaicCellId/siteColor (P5/D45): puro, sin OL — identidad y color de
// celdas multi-radar, sin deduplicar entre sitios.
import { describe, expect, it } from 'vitest'
import { mosaicCellId, siteColor } from '../../utils/overlay/mosaic-cells'

describe('mosaicCellId', () => {
  it('compone site:cellId', () => {
    expect(mosaicCellId('AMX', 'A0')).toBe('AMX:A0')
  })

  it('dos sitios con el mismo cell_id del RPG producen ids distintos', () => {
    expect(mosaicCellId('AMX', 'A0')).not.toBe(mosaicCellId('BYX', 'A0'))
  })
})

describe('siteColor', () => {
  const ORDER = ['AMX', 'BYX', 'HDC']

  it('es estable para el mismo sitio y orden', () => {
    expect(siteColor('BYX', ORDER)).toBe(siteColor('BYX', ORDER))
  })

  it('sitios distintos del mismo dominio reciben colores distintos', () => {
    const colors = new Set(ORDER.map(s => siteColor(s, ORDER)))
    expect(colors.size).toBe(ORDER.length)
  })

  it('sitio ausente del orden no lanza (cae al primer color)', () => {
    expect(() => siteColor('ZZZ', ORDER)).not.toThrow()
  })
})
