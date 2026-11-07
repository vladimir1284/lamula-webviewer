import { describe, expect, it, vi } from 'vitest'

const ended: string[] = []
vi.mock('postgres', () => ({
  default: (o: { username: string }) => Object.assign(() => [], { unsafe: async () => [], end: async () => { ended.push(o.username) } }),
}))

describe('caché de pools de Postgres', () => {
  it('desaloja el menos reciente al pasar de MAX_POOLS y cierra su pool', async () => {
    const { getPgClient, MAX_POOLS, poolCount } = await import('~/server/dal/pg')
    const cfg = (u: string) => ({ host: 'h', port: 5432, database: 'd', username: u, password: 'p' })
    for (let i = 0; i < MAX_POOLS; i++) getPgClient(cfg(`u${i}`))
    getPgClient(cfg('u0')) // u0 vuelve a ser el más reciente
    expect(poolCount()).toBe(MAX_POOLS)
    getPgClient(cfg('nuevo'))
    expect(poolCount()).toBe(MAX_POOLS)
    expect(ended).toEqual(['u1']) // no u0
  })
})
