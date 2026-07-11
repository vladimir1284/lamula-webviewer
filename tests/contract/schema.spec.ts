// Contract tests del schema (consumer-driven): asertan SOLO las formas de
// las que el viewer depende, sobre el snapshot versionado del SQL real del
// pipeline (tests/contract/schema/0001_init.sql, verificado contra el repo
// del pipeline por scripts/check-contract-drift.sh en CI).
//
// Simular un cambio de schema (renombrar/eliminar una columna del snapshot)
// hace fallar esta suite — es la señal de drift de la puerta M1. Columnas
// NUEVAS no la rompen: el pipeline puede extender sin coordinación.
import { describe, expect, it } from 'vitest'
import { createContractDb, insertRows } from '../helpers/d1-sqlite'

interface ColumnSpec {
  name: string
  type: 'TEXT' | 'REAL' | 'INTEGER'
  notnull: boolean
}

// Espejo de shared/contract/types.ts — la vista del consumidor.
const DEPENDED_COLUMNS: Record<string, ColumnSpec[]> = {
  radars: [
    { name: 'site_id', type: 'TEXT', notnull: false }, // PK: notnull implícito
    { name: 'icao', type: 'TEXT', notnull: false },
    { name: 'lat', type: 'REAL', notnull: true },
    { name: 'lon', type: 'REAL', notnull: true },
    { name: 'height_m', type: 'REAL', notnull: true },
    { name: 'proj4', type: 'TEXT', notnull: true },
    { name: 'last_seen_at', type: 'TEXT', notnull: true },
  ],
  products: [
    { name: 'code', type: 'INTEGER', notnull: false }, // PK
    { name: 'mnemonic', type: 'TEXT', notnull: true },
    { name: 'unit', type: 'TEXT', notnull: false },
    { name: 'kind', type: 'TEXT', notnull: true },
  ],
  rasters: [
    { name: 'site_id', type: 'TEXT', notnull: true },
    { name: 'product_code', type: 'INTEGER', notnull: true },
    { name: 'vol_time', type: 'TEXT', notnull: true },
    { name: 'r2_key', type: 'TEXT', notnull: true },
    { name: 'el_angle', type: 'REAL', notnull: false },
    { name: 'vcp', type: 'INTEGER', notnull: false },
    { name: 'value_scale', type: 'REAL', notnull: true },
    { name: 'value_offset', type: 'REAL', notnull: true },
    { name: 'max_level', type: 'INTEGER', notnull: false },
    { name: 'width', type: 'INTEGER', notnull: true },
    { name: 'height', type: 'INTEGER', notnull: true },
    { name: 'cell_m', type: 'REAL', notnull: true },
  ],
  phenomena: [
    { name: 'site_id', type: 'TEXT', notnull: true },
    { name: 'product_code', type: 'INTEGER', notnull: true },
    { name: 'vol_time', type: 'TEXT', notnull: true },
    { name: 'kind', type: 'TEXT', notnull: true },
    { name: 'cell_id', type: 'TEXT', notnull: false },
    { name: 'lat', type: 'REAL', notnull: true },
    { name: 'lon', type: 'REAL', notnull: true },
    { name: 'azimuth_deg', type: 'REAL', notnull: false },
    { name: 'range_km', type: 'REAL', notnull: false },
    { name: 'attrs', type: 'TEXT', notnull: true },
  ],
  vwp: [
    { name: 'site_id', type: 'TEXT', notnull: true },
    { name: 'vol_time', type: 'TEXT', notnull: true },
    { name: 'height_ft', type: 'INTEGER', notnull: true },
    { name: 'wind_dir_deg', type: 'REAL', notnull: true },
    { name: 'wind_speed_kt', type: 'REAL', notnull: true },
    { name: 'rms_kt', type: 'REAL', notnull: false },
  ],
}

interface PragmaColumn {
  name: string
  type: string
  notnull: 0 | 1
}

describe('contrato: columnas de las que depende el viewer', () => {
  const db = createContractDb()

  it.each(Object.entries(DEPENDED_COLUMNS))('%s', (table, expected) => {
    const actual = db.pragma(`table_info(${table})`) as PragmaColumn[]
    expect(actual.length, `tabla ${table} inexistente`).toBeGreaterThan(0)
    const byName = new Map(actual.map(c => [c.name, c]))

    for (const col of expected) {
      const found = byName.get(col.name)
      expect(found, `columna ${table}.${col.name} desapareció del contrato`).toBeDefined()
      expect(found!.type, `${table}.${col.name}: tipo`).toBe(col.type)
      expect(Boolean(found!.notnull), `${table}.${col.name}: notnull`).toBe(col.notnull)
    }
  })
})

describe('contrato: índices y constraints que asume el viewer', () => {
  it('idx_rasters_lookup cubre (site_id, product_code, vol_time)', () => {
    const db = createContractDb()
    const indexes = db.pragma('index_list(rasters)') as { name: string }[]
    expect(indexes.map(i => i.name)).toContain('idx_rasters_lookup')
    const cols = db.pragma('index_info(idx_rasters_lookup)') as { name: string }[]
    expect(cols.map(c => c.name)).toEqual(['site_id', 'product_code', 'vol_time'])
  })

  it('products.kind y phenomena.kind rechazan valores fuera del contrato', () => {
    const db = createContractDb()
    expect(() =>
      insertRows(db, 'products', [{ code: 999, mnemonic: 'XXX', unit: null, kind: 'bogus' }]),
    ).toThrow(/CHECK/)

    insertRows(db, 'radars', [{
      site_id: 'TST', icao: null, lat: 0, lon: 0, height_m: 0,
      proj4: '+proj=aeqd', first_seen_at: '2026-01-01T00:00:00', last_seen_at: '2026-01-01T00:00:00',
    }])
    insertRows(db, 'products', [{ code: 58, mnemonic: 'NST', unit: null, kind: 'phenomena' }])
    expect(() =>
      insertRows(db, 'phenomena', [{
        site_id: 'TST', product_code: 58, vol_time: '2026-01-01T00:00:00',
        kind: 'bogus', cell_id: null, lat: 0, lon: 0, azimuth_deg: null, range_km: null,
        attrs: '{}', created_at: '2026-01-01T00:00:00',
      }]),
    ).toThrow(/CHECK/)
  })

  it('rasters: UNIQUE (site_id, product_code, vol_time) — clave del timeline', () => {
    const db = createContractDb()
    insertRows(db, 'radars', [{
      site_id: 'TST', icao: null, lat: 0, lon: 0, height_m: 0,
      proj4: '+proj=aeqd', first_seen_at: '2026-01-01T00:00:00', last_seen_at: '2026-01-01T00:00:00',
    }])
    insertRows(db, 'products', [{ code: 153, mnemonic: 'N0B', unit: 'dBZ', kind: 'raster' }])
    const row = {
      site_id: 'TST', product_code: 153, vol_time: '2026-01-01T00:00:00',
      r2_key: 'TST/N0B/a.tif', size_bytes: 1, el_angle: null, vcp: null,
      value_scale: 1, value_offset: 0, max_level: null, width: 1, height: 1,
      cell_m: 250, created_at: '2026-01-01T00:01:00',
    }
    insertRows(db, 'rasters', [row])
    expect(() =>
      insertRows(db, 'rasters', [{ ...row, r2_key: 'TST/N0B/b.tif' }]),
    ).toThrow(/UNIQUE/)
  })

  it('vwp: UNIQUE (site_id, vol_time, height_ft) — un nivel por altura', () => {
    const db = createContractDb()
    insertRows(db, 'radars', [{
      site_id: 'TST', icao: null, lat: 0, lon: 0, height_m: 0,
      proj4: '+proj=aeqd', first_seen_at: '2026-01-01T00:00:00', last_seen_at: '2026-01-01T00:00:00',
    }])
    const level = {
      site_id: 'TST', vol_time: '2026-01-01T00:00:00', height_ft: 1000,
      wind_dir_deg: 90, wind_speed_kt: 10, rms_kt: null, created_at: '2026-01-01T00:01:00',
    }
    insertRows(db, 'vwp', [level])
    expect(() => insertRows(db, 'vwp', [level])).toThrow(/UNIQUE/)
  })
})
