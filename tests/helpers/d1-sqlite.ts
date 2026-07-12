// D1 de test: better-sqlite3 con el schema REAL del pipeline (snapshot
// versionado en tests/contract/schema/). D1 es SQLite, así que el adaptador
// live se ejercita contra la misma sintaxis y las mismas constraints que
// en producción — el contrato se prueba por construcción.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { D1Like } from '~/server/dal/types'

import phenomena from '~/server/dal/fixtures/phenomena.json'
import products from '~/server/dal/fixtures/products.json'
import radars from '~/server/dal/fixtures/radars.json'
import rasters from '~/server/dal/fixtures/rasters.json'
import vwp from '~/server/dal/fixtures/vwp.json'

// vitest corre con cwd = raíz del repo
const SCHEMA_PATH = join(process.cwd(), 'tests/contract/schema/0001_init.sql')

export function createContractDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'))
  return db
}

export function insertRows(db: Database.Database, table: string, rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const cols = Object.keys(row)
    const stmt = db.prepare(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => `@${c}`).join(', ')})`,
    )
    // better-sqlite3 no acepta booleanos: normaliza a 0/1 (no aparece en
    // el contrato actual, pero las grabaciones futuras no deben romper esto)
    stmt.run(Object.fromEntries(
      cols.map(c => [c, typeof row[c] === 'boolean' ? Number(row[c]) : row[c]]),
    ))
  }
}

/** D1 con el schema real sembrada con las MISMAS fixtures del adaptador fixture. */
export function createSeededDb(): Database.Database {
  const db = createContractDb()
  insertRows(db, 'radars', radars)
  insertRows(db, 'products', products)
  insertRows(db, 'rasters', rasters)
  insertRows(db, 'phenomena', phenomena)
  insertRows(db, 'vwp', vwp)
  return db
}

/** Envuelve better-sqlite3 con la superficie D1 que usa el adaptador live. */
export function asD1(db: Database.Database): D1Like {
  const wrap = (sql: string, params: unknown[]) => ({
    bind: (...values: unknown[]) => wrap(sql, values),
    all: async <T>() => ({ results: db.prepare(sql).all(...params) as T[] }),
    first: async <T>() => (db.prepare(sql).get(...params) as T | undefined) ?? null,
  })
  return { prepare: (sql: string) => wrap(sql, []) }
}
