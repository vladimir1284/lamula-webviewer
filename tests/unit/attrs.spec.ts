// Parsers tolerantes de phenomena.attrs: contra TODAS las filas grabadas
// (re-grabar no rompe) y contra corrupción sintética campo a campo.
import { describe, expect, it } from 'vitest'
import { mesoAttrs, stormCellAttrs } from '../../shared/contract/attrs'
import { phenomena } from '../helpers/derive'

const parsed = (attrs: string) => JSON.parse(attrs) as Record<string, unknown>

describe('stormCellAttrs / mesoAttrs sobre las fixtures grabadas', () => {
  it('ninguna fila grabada lanza y las claves presentes tipan', () => {
    for (const row of phenomena) {
      const raw = parsed(row.attrs)
      if (row.kind === 'storm_cell') {
        const a = stormCellAttrs(raw)
        // toda clave presente en el JSON crudo sobrevive tipada o se descarta — nunca cambia de valor
        if (a.dbz_max !== undefined) expect(a.dbz_max).toBe(raw.dbz_max)
        if (a.past !== undefined) {
          expect(a.past).toEqual(raw.past)
          for (const p of a.past) expect(p).toHaveLength(2)
        }
      }
      else if (row.kind === 'meso') {
        const a = mesoAttrs(raw)
        expect(typeof (a.storm_id ?? '')).toBe('string')
        if (a.tvs !== undefined) expect(a.tvs).toBe(raw.tvs)
      }
    }
  })

  it('las fixtures ejercitan las claves nucleares del contrato', () => {
    const cells = phenomena.filter(p => p.kind === 'storm_cell').map(p => stormCellAttrs(parsed(p.attrs)))
    const mesos = phenomena.filter(p => p.kind === 'meso').map(p => mesoAttrs(parsed(p.attrs)))
    expect(cells.some(a => a.dbz_max !== undefined)).toBe(true)
    expect(cells.some(a => a.past && a.past.length > 0)).toBe(true)
    expect(cells.some(a => a.forecast && a.forecast.length > 0)).toBe(true)
    expect(mesos.some(a => a.storm_id !== undefined)).toBe(true)
    expect(mesos.some(a => a.tvs !== undefined)).toBe(true)
  })
})

describe('tolerancia campo a campo', () => {
  it('attrs vacío → todo undefined, sin lanzar', () => {
    expect(stormCellAttrs({})).toEqual({})
    expect(mesoAttrs({})).toEqual({})
  })

  it('un campo corrupto se descarta sin tumbar el resto', () => {
    const a = stormCellAttrs({ dbz_max: 'cincuenta', movement_kt: 23, past: [[1, 2]] })
    expect(a.dbz_max).toBeUndefined()
    expect(a.movement_kt).toBe(23)
    expect(a.past).toEqual([[1, 2]])
  })

  it('track malformado se descarta entero', () => {
    const a = stormCellAttrs({ past: [[1, 2], [3]], forecast: [[1, 'x']], dbz_max: 49 })
    expect(a.past).toBeUndefined()
    expect(a.forecast).toBeUndefined()
    expect(a.dbz_max).toBe(49)
  })

  it('claves desconocidas (extensiones futuras) pasan intactas', () => {
    const a = stormCellAttrs({ vil_kg_m2: 35, dbz_max: 50 }) as Record<string, unknown>
    expect(a.vil_kg_m2).toBe(35)
  })

  it('meso: tipos malos no contaminan al resto', () => {
    const a = mesoAttrs({ storm_id: 7, strength_rank: 5, tvs: 'yes' })
    expect(a.storm_id).toBeUndefined()
    expect(a.strength_rank).toBe(5)
    expect(a.tvs).toBeUndefined()
  })
})
