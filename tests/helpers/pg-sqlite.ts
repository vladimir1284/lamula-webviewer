// Postgres de test: better-sqlite3 con el schema REAL del pipeline
// (snapshot versionado en tests/contract/schema/0001_init.sql),
// traducido sobre la marcha a sintaxis SQLite donde hace falta — mismo
// schema, misma sintaxis de columnas/constraints/CHECK/UNIQUE que en
// producción, así que el adaptador live se ejercita contra el mismo
// contrato salvo el único cambio mecánico real (BIGSERIAL, que SQLite
// no entiende). El contrato se prueba por construcción.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { PgLike } from '~/server/dal/types'

import lightning from '~/server/dal/fixtures/lightning.json'
import phenomena from '~/server/dal/fixtures/phenomena.json'
import products from '~/server/dal/fixtures/products.json'
import radars from '~/server/dal/fixtures/radars.json'
import rasters from '~/server/dal/fixtures/rasters.json'
import vwp from '~/server/dal/fixtures/vwp.json'
import wind from '~/server/dal/fixtures/wind.json'

// vitest corre con cwd = raíz del repo. `schema/` es el snapshot
// byte-exacto de db/pg_migrations/ del pipeline (drift-checkeado en
// CI); `proposed/` contiene DDL acordado pero aún sin mergear en el
// pipeline (fuera del drift check) — se aplica después, en orden de nombre.
const SCHEMA_DIR = join(process.cwd(), 'tests/contract/schema')
const PROPOSED_DIR = join(process.cwd(), 'tests/contract/proposed')

function sqliteCompatible(sql: string): string {
  return sql.replaceAll('BIGSERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT')
}

export function createContractDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  for (const dir of [SCHEMA_DIR, PROPOSED_DIR]) {
    let names: string[]
    try {
      names = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    }
    catch {
      continue // proposed/ puede no existir (todo mergeado)
    }
    for (const name of names) db.exec(sqliteCompatible(readFileSync(join(dir, name), 'utf8')))
  }
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

/** Postgres (de test) con el schema real sembrado con las MISMAS fixtures del adaptador fixture. */
export function createSeededDb(): Database.Database {
  const db = createContractDb()
  insertRows(db, 'radars', radars)
  insertRows(db, 'products', products)
  insertRows(db, 'rasters', rasters)
  insertRows(db, 'phenomena', phenomena)
  insertRows(db, 'vwp', vwp)
  insertRows(db, 'wind_grids', wind)
  insertRows(db, 'lightning_buckets', lightning)
  return db
}

/** Envuelve better-sqlite3 con la superficie PgLike que usa el adaptador
 * live — traduce placeholders numerados ($1, $2, …) a `?` de SQLite,
 * en el mismo orden en que aparecen (todas las queries del DAL los
 * usan una sola vez cada uno, así que la traducción posicional alcanza). */
export function asPg(db: Database.Database): PgLike {
  return {
    query: async <T>(sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\$\d+/g, '?')
      return db.prepare(text).all(...params) as T[]
    },
  }
}
