// Las grabaciones del adaptador fixture deben (1) validar contra los
// schemas Zod del contrato y (2) insertarse limpias en el schema REAL del
// pipeline (FKs activas) — si una re-grabación trae filas que ya no encajan,
// esto rompe CI antes de que rompa el viewer.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import lightning from '~/server/dal/fixtures/lightning.json'
import phenomena from '~/server/dal/fixtures/phenomena.json'
import products from '~/server/dal/fixtures/products.json'
import radars from '~/server/dal/fixtures/radars.json'
import rasters from '~/server/dal/fixtures/rasters.json'
import vwp from '~/server/dal/fixtures/vwp.json'
import wind from '~/server/dal/fixtures/wind.json'
import {
  zIsoNaive,
  zLightningBucketRow,
  zPhenomenonRow,
  zProductRow,
  zRadarRow,
  zRasterRow,
  zVwpRow,
  zWindGridRow,
} from '~/shared/contract'
import { createSeededDb } from '../helpers/d1-sqlite'

// created_at es NOT NULL en la base: las grabaciones lo traen tal cual
// aunque el DAL no lo sirva.
const withCreatedAt = <S extends z.ZodObject>(schema: S) =>
  schema.extend({ created_at: zIsoNaive })

describe('fixtures grabadas vs schemas Zod del contrato', () => {
  it('radars', () => {
    expect(radars.length).toBeGreaterThanOrEqual(2)
    z.array(zRadarRow).parse(radars)
  })

  it('products: los tres kinds representados', () => {
    z.array(zProductRow).parse(products)
    expect(new Set(products.map(p => p.kind))).toEqual(
      new Set(['raster', 'phenomena', 'vwp']),
    )
  })

  it('rasters: series suficientes para closest/next/prev', () => {
    z.array(withCreatedAt(zRasterRow)).parse(rasters)
    const series = Map.groupBy(rasters, r => `${r.site_id}/${r.product_code}`)
    expect([...series.values()].some(s => s.length >= 3)).toBe(true)
  })

  it('phenomena: attrs con las claves del contrato por kind', () => {
    z.array(withCreatedAt(zPhenomenonRow)).parse(phenomena)
    for (const row of phenomena) {
      const attrs = JSON.parse(row.attrs) as Record<string, unknown>
      if ('azran_nm' in attrs) {
        expect(attrs.azran_nm, `${row.kind} ${row.cell_id}: azran_nm`).toHaveLength(2)
      }
      if (row.kind === 'meso') {
        expect(typeof attrs.radius_km).toBe('number')
      }
    }
  })

  it('vwp', () => {
    z.array(withCreatedAt(zVwpRow)).parse(vwp)
  })

  it('wind: sintético hasta que el pipeline ingiera GFS (misma forma que la tabla propuesta)', () => {
    z.array(withCreatedAt(zWindGridRow)).parse(wind)
  })

  it('lightning: sintético hasta que el pipeline ingiera GLM; cubo vacío ⇔ r2_key NULL', () => {
    z.array(withCreatedAt(zLightningBucketRow)).parse(lightning)
    for (const b of lightning) {
      expect(b.r2_key === null, `${b.site_id} ${b.bucket_start}`).toBe(b.strike_count === 0)
    }
  })
})

describe('fixtures grabadas vs schema SQL real (inserción)', () => {
  it('todas las filas insertan con foreign keys activas', () => {
    const db = createSeededDb() // lanza si algo no encaja en el schema
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
    expect(count('radars')).toBe(radars.length)
    expect(count('products')).toBe(products.length)
    expect(count('rasters')).toBe(rasters.length)
    expect(count('phenomena')).toBe(phenomena.length)
    expect(count('vwp')).toBe(vwp.length)
    expect(count('wind_grids')).toBe(wind.length)
    expect(count('lightning_buckets')).toBe(lightning.length)
  })
})
