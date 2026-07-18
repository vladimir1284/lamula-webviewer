// Partículas deterministas: con seed fijo las trayectorias son exactas y
// reproducibles — el canvas no entra aquí (eso es utils/map/wind-layer.ts).
import type { WindGridFile } from '#shared/contract'
import { describe, expect, it } from 'vitest'
import { mulberry32, WindParticles } from '../../utils/wind/particles'

const EARTH_R = 6_371_000
const DEG = 180 / Math.PI

/** campo uniforme sobre un dominio generoso */
function uniformGrid(u: number, v: number): WindGridFile {
  const header = { nx: 3, ny: 3, lo1: -84, la1: 28, dx: 4, dy: 4, refTime: '2026-07-11T00:00:00Z', forecastHour: 0 }
  return { header, u: Array.from({ length: 9 }, () => u), v: Array.from({ length: 9 }, () => v) }
}

const VIEWPORT = { west: -83, south: 21, east: -77, north: 27 }

describe('mulberry32', () => {
  it('misma seed → misma secuencia; en [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 5 }, () => a())
    expect(Array.from({ length: 5 }, () => b())).toEqual(seqA)
    expect(seqA.every(x => x >= 0 && x < 1)).toBe(true)
  })
})

describe('WindParticles', () => {
  it('viento del oeste puro: la partícula avanza al este, dLat = 0, con cos(φ)', () => {
    const p = new WindParticles(uniformGrid(10, 0), VIEWPORT, {
      count: 1,
      timeAccel: 1000,
      rng: mulberry32(7),
    })
    const [seg] = p.tick(0.016)
    expect(seg).toBeDefined()
    const dtReal = 0.016 * 1000
    const expectedDLon = ((10 * dtReal) / (EARTH_R * Math.cos(seg!.lat0 / DEG))) * DEG
    expect(seg!.lon1 - seg!.lon0).toBeCloseTo(expectedDLon, 12)
    expect(seg!.lat1).toBe(seg!.lat0)
    expect(seg!.speed).toBe(10)
  })

  it('mismo seed → trayectorias idénticas tick a tick', () => {
    const mk = () =>
      new WindParticles(uniformGrid(5, -3), VIEWPORT, { count: 20, rng: mulberry32(123) })
    const a = mk()
    const b = mk()
    for (let t = 0; t < 5; t++) {
      expect(a.tick(0.02)).toEqual(b.tick(0.02))
    }
  })

  it('partícula fuera de la grilla se resiembra dentro y ese tick no pinta', () => {
    // viewport pegado al borde este de la grilla y viento fuerte hacia afuera
    const grid = uniformGrid(50, 0)
    const p = new WindParticles(grid, { west: -76.5, south: 21, east: -76, north: 27 }, {
      count: 10,
      timeAccel: 100_000, // cruza el borde (−76) en pocos ticks
      rng: mulberry32(1),
    })
    let respawned = 0
    for (let t = 0; t < 50; t++) {
      respawned += 10 - p.tick(0.016).length
    }
    expect(respawned).toBeGreaterThan(0)
    // tras resembrar todas siguen dentro del dominio
    for (const s of p.tick(0.016)) {
      expect(s.lon0).toBeGreaterThanOrEqual(-76.5)
      expect(s.lon0).toBeLessThanOrEqual(-76)
    }
  })

  it('la edad máxima recicla partículas aunque el viento las mantenga dentro', () => {
    const p = new WindParticles(uniformGrid(0.1, 0), VIEWPORT, {
      count: 5,
      maxAge: 3,
      rng: mulberry32(9),
    })
    let respawns = 0
    for (let t = 0; t < 20; t++) {
      respawns += 5 - p.tick(0.016).length
    }
    // cada partícula debió reciclarse varias veces en 20 ticks con maxAge 3
    expect(respawns).toBeGreaterThanOrEqual(20)
  })

  it('la siembra queda en la intersección viewport ∩ grilla', () => {
    // viewport mucho más grande que la grilla (zoom out)
    const p = new WindParticles(uniformGrid(1, 1), { west: -170, south: -80, east: 170, north: 80 }, {
      count: 50,
      rng: mulberry32(3),
    })
    for (const s of p.tick(0.001)) {
      expect(s.lon0).toBeGreaterThanOrEqual(-84)
      expect(s.lon0).toBeLessThanOrEqual(-76)
      expect(s.lat0).toBeGreaterThanOrEqual(20)
      expect(s.lat0).toBeLessThanOrEqual(28)
    }
  })
})
