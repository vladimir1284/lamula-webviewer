// Adaptador Postgres de producción: envuelve postgres.js con la
// interfaz mínima PgLike que usa LiveDal — soporta múltiples conexiones/roles
// mediante un cache indexado por credenciales.
import postgres from 'postgres'
import type { PgLike } from './types'

export interface PgConnectionConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
}

const connections = new Map<string, postgres.Sql>()

export function getPgClient(config: PgConnectionConfig): PgLike {
  const key = `${config.host}:${config.port}/${config.database}@${config.username}`
  let sql = connections.get(key)

  if (!sql) {
    sql = postgres({
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password,
      max: 5,
    })
    connections.set(key, sql)
  }

  const client = sql
  return {
    query: <T>(text: string, params: unknown[] = []) =>
      client.unsafe(text, params as never[]) as unknown as Promise<T[]>,
  }
}
