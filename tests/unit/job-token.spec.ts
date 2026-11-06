import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearJobCache, firstProductWithRasters, resolveJob, validToken } from '~/server/dal/job-token'

const JOB = { job_id: 'j1', state: 'ingesting', vol_from: null, vol_to: null, expires_at: null, pg_user: 'job_j1_ro', pg_password: 'pw' }
const TOKEN = 'a'.repeat(32)
const resp = (status: number, body?: unknown) => ({ status, ok: status < 300, json: async () => body }) as Response

describe('token de job', () => {
  beforeEach(clearJobCache)

  it('solo acepta tokens con forma de token', () => {
    expect(validToken(TOKEN)).toBe(true)
    for (const mal of ['', 'corto', '../etc/passwd'.padEnd(20, 'x'), 'a'.repeat(200), undefined, 42]) expect(validToken(mal)).toBe(false)
  })

  it('pide las credenciales con la clave interna y las cachea ttl ms', async () => {
    const f = vi.fn(async () => resp(200, JOB))
    let t = 0
    const o = { url: 'http://api/', key: 'k', ttlMs: 1000, fetchImpl: f as unknown as typeof fetch, now: () => t }
    expect(await resolveJob(TOKEN, o)).toEqual(JOB)
    expect(f).toHaveBeenCalledWith(`http://api/v1/results/${TOKEN}`, { headers: { 'X-Internal-Key': 'k' } })
    t = 999
    await resolveJob(TOKEN, o)
    expect(f).toHaveBeenCalledTimes(1)
    t = 1000
    await resolveJob(TOKEN, o)
    expect(f).toHaveBeenCalledTimes(2) // pasado el ttl vuelve a preguntar: el estado del job cambia
  })

  it('404 es null; otro error lanza y no se cachea', async () => {
    const f = vi.fn().mockResolvedValueOnce(resp(404)).mockResolvedValueOnce(resp(500)).mockResolvedValueOnce(resp(200, JOB))
    const o = { url: 'http://api', key: 'k', ttlMs: 0, fetchImpl: f as unknown as typeof fetch }
    expect(await resolveJob(TOKEN, o)).toBeNull()
    await expect(resolveJob(TOKEN, o)).rejects.toThrow('500')
    expect(await resolveJob(TOKEN, o)).toEqual(JOB)
  })
})

describe('producto de entrada del visor', () => {
  const con = (datos: Record<string, string[]>) => async (code: number, day: string) => datos[`${code}@${day}`] ?? []

  it('prefiere N0B cuando ya tiene datos', async () => {
    const t = con({ '153@2017-09-10': ['x'], '154@2017-09-10': ['x'] })
    expect(await firstProductWithRasters(t, [154, 153], ['2017-09-10'])).toBe(153)
  })

  it('con el primer lote sin N0B abre el producto que sí existe', async () => {
    expect(await firstProductWithRasters(con({ '154@2017-09-10': ['x'] }), [153, 154, 155], ['2017-09-10'])).toBe(154)
  })

  it('null mientras no hay ningún raster, y mira todos los días de la ventana', async () => {
    expect(await firstProductWithRasters(con({}), [153, 154], ['2017-09-10'])).toBeNull()
    expect(await firstProductWithRasters(con({ '153@2017-09-11': ['x'] }), [153], ['2017-09-10', '2017-09-11'])).toBe(153)
  })
})
