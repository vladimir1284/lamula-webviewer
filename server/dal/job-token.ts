// Token de resultado de un job → credenciales de solo lectura (plano demo, lamula-jobs).
//
// El viewer demo no guarda credenciales: las pide a `jobs-api` (`GET /v1/results/<token>`, servidor a servidor,
// con la clave interna) y las cachea unos segundos. El estado del job (queued/ingesting/ready…) viaja en la
// misma respuesta, así que cachear poco mantiene la pantalla de estado al día sin martillear la API.

export interface JobInfo {
  job_id: string
  state: string
  vol_from: string | null
  vol_to: string | null
  expires_at: string | null
  pg_user: string
  pg_password: string
}

export interface JobResolverOptions {
  url: string
  key: string
  ttlMs?: number
  fetchImpl?: typeof fetch
  now?: () => number
}

export const JOB_COOKIE = 'lamula_job'
// Los tokens de resultado son opacos y largos; esto solo descarta basura antes de salir a la red.
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

export class JobNotFound extends Error {}

const cache = new Map<string, { at: number, info: JobInfo | null }>()
const MAX_CACHE = 200

export function validToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

/** `null` si el token no existe o caducó. Lanza si `jobs-api` no responde bien (no se cachea el fallo). */
export async function resolveJob(token: string, opts: JobResolverOptions): Promise<JobInfo | null> {
  const now = opts.now ?? Date.now
  const ttl = opts.ttlMs ?? 5000
  const hit = cache.get(token)
  if (hit && now() - hit.at < ttl) return hit.info

  const res = await (opts.fetchImpl ?? fetch)(`${opts.url.replace(/\/$/, '')}/v1/results/${encodeURIComponent(token)}`, {
    headers: { 'X-Internal-Key': opts.key },
  })
  let info: JobInfo | null
  if (res.status === 404) info = null
  else if (!res.ok) throw new Error(`jobs-api respondió ${res.status}`)
  else info = (await res.json()) as JobInfo

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(token, { at: now(), info })
  return info
}

export function clearJobCache(): void {
  cache.clear()
}

/** Producto de entrada del visor: N0B (153) si ya tiene datos y, si no, el primer raster del catálogo que los tenga.
 *  El primer lote de un job no trae todos los productos a la vez (medido: N0G sin N0B), y abrir uno que aún no existe
 *  deja el visor sin línea de tiempo. `null` mientras no haya ninguno. */
export async function firstProductWithRasters(
  listTimes: (productCode: number, day: string) => Promise<string[]>,
  candidates: number[],
  days: string[],
): Promise<number | null> {
  const orden = [153, ...candidates.filter(c => c !== 153)]
  for (const code of orden) {
    for (const day of days) {
      if ((await listTimes(code, day)).length > 0) return code
    }
  }
  return null
}
