// Factory del DAL: switch por env (decisión 3).
//
//   NUXT_DAL_ADAPTER=fixture → adaptador fixture (grabaciones commiteadas)
//   (sin definir / otro)     → adaptador live sobre el binding D1 "DB"
//
// En workerd la variable llega como binding (event.context.cloudflare.env);
// en `nuxt dev` / node, por process.env o runtimeConfig.
import type { H3Event } from 'h3'
import { FixtureDal } from './fixture'
import { LiveDal } from './live'
import type { D1Like, Dal } from './types'

interface CfEnv {
  DB?: D1Like
  NUXT_DAL_ADAPTER?: string
  NUXT_PUBLIC_R2_BASE_URL?: string
}

let fixtureSingleton: FixtureDal | undefined

export function useDal(event: H3Event): Dal {
  const cfEnv = (event.context.cloudflare?.env ?? {}) as CfEnv
  const config = useRuntimeConfig(event)

  const mode
    = cfEnv.NUXT_DAL_ADAPTER
      ?? process.env.NUXT_DAL_ADAPTER
      ?? config.dalAdapter

  const r2BaseUrl
    = cfEnv.NUXT_PUBLIC_R2_BASE_URL
      ?? config.public.r2BaseUrl
      ?? null

  if (mode === 'fixture') {
    fixtureSingleton ??= new FixtureDal(r2BaseUrl || null)
    return fixtureSingleton
  }

  const db = cfEnv.DB
  if (!db) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'Binding D1 "DB" no configurado en este entorno '
        + '(para desarrollo offline: NUXT_DAL_ADAPTER=fixture)',
    })
  }
  return new LiveDal(db, r2BaseUrl || null)
}

export type { Dal } from './types'
