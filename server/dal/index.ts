// Factory del DAL: switch por env (decisión 3).
//
//   NUXT_DAL_ADAPTER=fixture → adaptador fixture (grabaciones commiteadas)
//   (sin definir / otro)     → adaptador live sobre Postgres directo
//     (NUXT_PG_HOST/NUXT_PG_PORT/NUXT_PG_DATABASE/NUXT_PG_USER/NUXT_PG_PASSWORD)
import type { H3Event } from 'h3'
import { FixtureDal } from './fixture'
import { LiveDal } from './live'
import { JOB_COOKIE, JobNotFound, resolveJob, validToken } from './job-token'
import { getPgClient } from './pg'
import type { Dal, PgLike } from './types'

let fixtureSingleton: FixtureDal | undefined

/** `jobToken`: para el endpoint que acaba de recibirlo y aún no tiene la cookie en la petición. */
export function useDal(event: H3Event, jobToken?: string): Dal {
  const config = useRuntimeConfig(event)

  if (config.dalAdapter === 'fixture') {
    fixtureSingleton ??= new FixtureDal(config.public.r2BaseUrl || null)
    return fixtureSingleton
  }

  // Plano demo (lamula-jobs): credenciales por petición, sacadas del token del job que viaja en la cookie.
  if (config.jobsApiUrl) {
    const token = jobToken ?? getCookie(event, JOB_COOKIE)
    const lazy: PgLike = {
      query: async <T>(text: string, params: unknown[] = []) => {
        if (!validToken(token)) throw createError({ statusCode: 401, statusMessage: 'Falta el enlace del job' })
        const job = await resolveJob(token, { url: config.jobsApiUrl, key: config.jobsInternalKey })
          .catch((e) => { throw createError({ statusCode: 502, statusMessage: String(e.message ?? e) }) })
        if (!job) throw createError({ statusCode: 404, statusMessage: 'El job no existe o caducó' })
        return getPgClient({
          host: config.pgHost,
          port: Number(config.pgPort) || 5432,
          database: config.pgDatabase,
          username: job.pg_user,
          password: job.pg_password,
        }, { max: 2 }).query<T>(text, params)
      },
    }
    return new LiveDal(lazy, config.public.r2BaseUrl || null)
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

export { JobNotFound }
export type { Dal } from './types'
