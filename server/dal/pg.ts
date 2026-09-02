// Adaptador Postgres de producción: envuelve postgres.js con la
// interfaz mínima PgLike que usa LiveDal — mismo rol que D1Like antes
// del binding D1, ahora contra un Postgres self-hosted en el Swarm
// (mismo Swarm donde corre esta app — sin frontera de red que cruzar,
// ver plan de migración).
import postgres from 'postgres'
import type { PgLike } from './types'

export interface PgConnectionConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
}

let sql: postgres.Sql | undefined

export function getPgClient(config: PgConnectionConfig): PgLike {
  sql ??= postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.username,
    password: config.password,
    max: 5,
  })
  const client = sql
  return {
    query: <T>(text: string, params: unknown[] = []) =>
      client.unsafe(text, params as never[]) as unknown as Promise<T[]>,
  }
}
