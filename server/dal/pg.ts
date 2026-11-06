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

// Con un rol por job (viewer demo) cada token abierto deja un pool vivo; sin tope se comen el
// `max_connections` del Postgres compartido. Al pasar de MAX_POOLS se cierra el menos recientemente usado.
export const MAX_POOLS = 20

export function poolCount(): number {
  return connections.size
}

export function getPgClient(config: PgConnectionConfig, opts: { max?: number } = {}): PgLike {
  const key = `${config.host}:${config.port}/${config.database}@${config.username}`
  let sql = connections.get(key)

  if (sql) {
    connections.delete(key) // reinsertar: el Map recuerda el orden de uso
    connections.set(key, sql)
  }
  else {
    while (connections.size >= MAX_POOLS) {
      const [viejaKey, vieja] = connections.entries().next().value as [string, postgres.Sql]
      connections.delete(viejaKey)
      void vieja.end({ timeout: 5 }).catch(() => {})
    }
    sql = postgres({
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password,
      max: opts.max ?? 5,
    })
    connections.set(key, sql)
  }

  const client = sql
  return {
    query: <T>(text: string, params: unknown[] = []) =>
      client.unsafe(text, params as never[]) as unknown as Promise<T[]>,
  }
}
