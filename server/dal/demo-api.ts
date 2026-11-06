// Proxy del selector del plano demo hacia `jobs-api` (lamula-jobs, F4).
//
// El token de acceso del cliente vive en una cookie httpOnly: el navegador nunca lo reenvía a mano ni lo ve JS.
// Solo se dejan pasar las rutas del selector; nada de `/v1/jobs/*` ajeno ni `/v1/results`.

export const ACCESS_COOKIE = 'lamula_access'
const TOKEN_RE = /^[A-Za-z0-9_.-]{8,200}$/
const CATALOG_PATHS = [/^sites$/, /^volumes$/]

export function validAccessToken(t: unknown): t is string {
  return typeof t === 'string' && TOKEN_RE.test(t)
}

export function catalogPathAllowed(path: string): boolean {
  return CATALOG_PATHS.some(re => re.test(path))
}

export interface DemoCall {
  url: string
  token: string
  path: string // ya con `/v1/...`
  method?: 'GET' | 'POST'
  query?: Record<string, string>
  body?: unknown
  fetchImpl?: typeof fetch
}

export async function callJobsApi(c: DemoCall): Promise<{ status: number, body: unknown }> {
  const qs = c.query && Object.keys(c.query).length ? `?${new URLSearchParams(c.query)}` : ''
  const res = await (c.fetchImpl ?? fetch)(`${c.url.replace(/\/$/, '')}${c.path}${qs}`, {
    method: c.method ?? 'GET',
    headers: { 'Authorization': `Bearer ${c.token}`, ...(c.body ? { 'Content-Type': 'application/json' } : {}) },
    body: c.body ? JSON.stringify(c.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}
