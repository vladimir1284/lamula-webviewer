// Postgres de test: better-sqlite3 con el schema REAL del pipeline y viewer,
// traducido sobre la marcha a sintaxis SQLite donde hace falta.
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

const SCHEMA_DIR = join(process.cwd(), 'tests/contract/schema')
const PROPOSED_DIR = join(process.cwd(), 'tests/contract/proposed')
const VIEWER_MIGRATIONS_DIR = join(process.cwd(), 'db/viewer_migrations')

function sqliteCompatible(sql: string): string {
  return sql
    .replaceAll(/CREATE SCHEMA IF NOT EXISTS [a-zA-Z0-9_]+;/gi, '')
    .replaceAll('viewer.', '')
    .replaceAll('BIGSERIAL PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replaceAll('TIMESTAMPTZ', 'TEXT')
    .replaceAll('JSONB', 'TEXT')
    .replaceAll('now()', 'CURRENT_TIMESTAMP')
    .replaceAll(/::[a-zA-Z0-9_]+(\[\])?/g, '')
}

export function createContractDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')

  for (const dir of [SCHEMA_DIR, PROPOSED_DIR, VIEWER_MIGRATIONS_DIR]) {
    let names: string[]
    try {
      names = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
    }
    catch {
      continue
    }
    for (const name of names) {
      const code = sqliteCompatible(readFileSync(join(dir, name), 'utf8'))
      if (code.trim()) {
        db.exec(code)
      }
    }
  }
  return db
}

export function insertRows(db: Database.Database, table: string, rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const cols = Object.keys(row)
    const stmt = db.prepare(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => `@${c}`).join(', ')})`,
    )
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

/** Envuelve better-sqlite3 con la superficie PgLike que usa el adaptador live */
export function asPg(db: Database.Database): PgLike {
  return {
    query: async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      let text = sqliteCompatible(sql)

      // Handle = ANY($1)
      if (text.includes('= ANY(')) {
        const paramIndexMatch = text.match(/=\s*ANY\(\$(\d+)\)/)
        if (paramIndexMatch) {
          const idx = Number(paramIndexMatch[1]) - 1
          const arr = params[idx] as unknown[]
          params = [...params]
          if (Array.isArray(arr) && arr.length > 0) {
            const numArr = arr.map(x => (typeof x === 'string' && !isNaN(Number(x)) ? Number(x) : x))
            const placeholders = numArr.map(() => '?').join(', ')
            text = text.replace(/=\s*ANY\(\$\d+\)/, `IN (${placeholders})`)
            params.splice(idx, 1, ...numArr)
          }
          else {
            text = text.replace(/=\s*ANY\(\$\d+\)/, 'IN (NULL)')
            params.splice(idx, 1)
          }
        }
      }

      text = text.replace(/\$\d+/g, '?')

      const isSelectOrReturning = text.trim().toUpperCase().startsWith('SELECT') || text.includes('RETURNING')
      const stmt = db.prepare(text)

      if (isSelectOrReturning) {
        const rows = stmt.all(...params) as Record<string, unknown>[]
        return rows.map((r) => {
          if (r && typeof r === 'object' && 'id' in r && typeof r.id === 'number') {
            return { ...r, id: String(r.id) } as T
          }
          return r as T
        })
      }
      else {
        stmt.run(...params)
        return []
      }
    },
  }
}
