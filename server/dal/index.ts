// Factory del DAL: switch por env (decisión 3).
//
//   NUXT_DAL_ADAPTER=fixture → adaptador fixture (grabaciones commiteadas)
//   (sin definir / otro)     → adaptador live sobre Postgres directo
//     (NUXT_PG_HOST/NUXT_PG_PORT/NUXT_PG_DATABASE/NUXT_PG_USER/NUXT_PG_PASSWORD)
import type { H3Event } from 'h3'
import { FixtureDal } from './fixture'
import { LiveDal } from './live'
import { getPgClient } from './pg'
import type { Dal } from './types'

let fixtureSingleton: FixtureDal | undefined

export function useDal(event: H3Event): Dal {
  const config = useRuntimeConfig(event)

  if (config.dalAdapter === 'fixture') {
    fixtureSingleton ??= new FixtureDal(config.public.r2BaseUrl || null)
    return fixtureSingleton
  }

  if (!config.pgHost || !config.pgDatabase || !config.pgUser) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'Config de Postgres incompleta (NUXT_PG_HOST/NUXT_PG_DATABASE/NUXT_PG_USER) '
        + '(para desarrollo offline: NUXT_DAL_ADAPTER=fixture)',
    })
  }

  const db = getPgClient({
    host: config.pgHost,
    port: Number(config.pgPort) || 5432,
    database: config.pgDatabase,
    username: config.pgUser,
    password: config.pgPassword,
  })
  return new LiveDal(db, config.public.r2BaseUrl || null)
}

export type { Dal } from './types'
