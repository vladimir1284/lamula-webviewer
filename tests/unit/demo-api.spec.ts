import { describe, expect, it, vi } from 'vitest'
import { callJobsApi, catalogPathAllowed, validAccessToken } from '~/server/dal/demo-api'

describe('proxy del selector demo', () => {
  it('solo deja pasar las rutas del catálogo', () => {
    for (const ok of ['sites', 'volumes']) expect(catalogPathAllowed(ok)).toBe(true)
    for (const mal of ['', 'jobs', '../jobs', 'cases', 'cases/irma', 'sites/x', 'results/abc']) expect(catalogPathAllowed(mal)).toBe(false)
  })

  it('valida la forma del token de acceso', () => {
    expect(validAccessToken('abcdef123456')).toBe(true)
    for (const mal of ['', 'corto', 'con espacio 123', 'a'.repeat(300), undefined, 1]) expect(validAccessToken(mal)).toBe(false)
  })

  it('manda el token como Bearer, con query y cuerpo', async () => {
    const f = vi.fn(async () => ({ status: 201, json: async () => ({ ok: 1 }) }) as Response)
    const r = await callJobsApi({ url: 'http://api/', token: 't0k3n1234', path: '/v1/jobs', method: 'POST', query: { a: 'b' }, body: { x: 1 }, fetchImpl: f as unknown as typeof fetch })
    expect(r).toEqual({ status: 201, body: { ok: 1 } })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://api/v1/jobs?a=b')
    expect(init.headers).toMatchObject({ 'Authorization': 'Bearer t0k3n1234', 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"x":1}')
  })
})
