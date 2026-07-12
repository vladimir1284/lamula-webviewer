// El catálogo del viewer (decisión 5) debe cubrir TODO producto raster del
// feed real: data-driven desde las fixtures grabadas, igual que el DAL.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ProductRow } from '../../shared/contract'
import { RASTER_PRODUCTS, rasterProductDef } from '../../shared/products'

const products = JSON.parse(
  readFileSync(join(process.cwd(), 'server/dal/fixtures/products.json'), 'utf8'),
) as ProductRow[]

const feedRasters = products.filter(p => p.kind === 'raster')

describe('catálogo de productos raster', () => {
  it.each(feedRasters)('cubre $mnemonic ($code) con mnemonic y unidad coherentes', (row) => {
    const def = rasterProductDef(row.code)
    expect(def, `producto ${row.mnemonic} (${row.code}) sin entrada en el catálogo`).not.toBeNull()
    expect(def!.mnemonic).toBe(row.mnemonic)
    if (row.unit) expect(def!.unit).toBe(row.unit)
  })

  it.each(Object.values(RASTER_PRODUCTS))('$mnemonic: paleta bien formada', (def) => {
    const { palette } = def
    expect(palette.stops.length).toBeGreaterThanOrEqual(2)
    // stops estrictamente ascendentes
    for (let i = 1; i < palette.stops.length; i++) {
      expect(palette.stops[i]![0]).toBeGreaterThan(palette.stops[i - 1]![0])
    }
    // colores hex válidos
    for (const [, color] of palette.stops) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
    // ticks dentro del dominio de la paleta
    const min = palette.stops[0]![0]
    const max = palette.stops[palette.stops.length - 1]![0]
    for (const tick of palette.ticks) {
      expect(tick).toBeGreaterThanOrEqual(min)
      expect(tick).toBeLessThanOrEqual(max)
    }
    expect(palette.unit).toBe(def.unit)
  })

  it('código desconocido → null (producto nuevo no rompe el viewer)', () => {
    expect(rasterProductDef(9999)).toBeNull()
  })
})
