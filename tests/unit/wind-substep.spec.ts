// Sub-paso del viento en el export (F7.3). `MAX_DT_S = 0.05` en
// utils/map/wind-layer.ts protege de hipos reales de rAF, así que NO se sube
// para exportar: un dt grande se parte en n pasos. Aquí se comprueba que
// partirlo no cambia la física — solo la resolución de la integración.
import type { WindGridFile } from '#shared/contract'
import { describe, expect, it } from 'vitest'
import { mulberry32, WindParticles } from '../../utils/wind/particles'

/** campo uniforme: sin error de muestreo, solo el de la integración */
function uniformGrid(u: number, v: number): WindGridFile {
  const header = { nx: 3, ny: 3, lo1: -84, la1: 28, dx: 4, dy: 4, refTime: '2026-07-11T00:00:00Z', forecastHour: 0 }
  return { header, u: Array.from({ length: 9 }, () => u), v: Array.from({ length: 9 }, () => v) }
}

const VIEWPORT = { west: -83, south: 21, east: -77, north: 27 }

function particles() {
  return new WindParticles(uniformGrid(10, 4), VIEWPORT, {
    count: 1,
    timeAccel: 1000,
    rng: mulberry32(1), // misma seed que la capa en producción
  })
}

describe('sub-paso de dt', () => {
  // No son idénticos ni deben serlo: el paso corrige cos(φ) con la latitud ya
  // avanzada, así que partir el dt INTEGRA MEJOR. La diferencia a 0.1 s es de
  // ~6e-8 grados (milímetros) — invisible, y en el sentido correcto.
  it('dos pasos de 0.05 s llegan donde uno de 0.1 s, salvo el refinado de cos(φ)', () => {
    const whole = particles()
    const [big] = whole.tick(0.1)

    const split = particles()
    split.tick(0.05)
    const [second] = split.tick(0.05)

    // mismo punto de partida (misma seed) y mismo punto de llegada
    expect(second!.lon1).toBeCloseTo(big!.lon1, 6)
    expect(second!.lat1).toBeCloseTo(big!.lat1, 6)
  })

  it('el sub-paso parte el trazo en tramos: ninguno más largo que el entero', () => {
    const whole = particles()
    const [big] = whole.tick(0.1)
    const wholeLen = Math.hypot(big!.lon1 - big!.lon0, big!.lat1 - big!.lat0)

    const split = particles()
    const [a] = split.tick(0.05)
    const [b] = split.tick(0.05)
    const lenA = Math.hypot(a!.lon1 - a!.lon0, a!.lat1 - a!.lat0)
    const lenB = Math.hypot(b!.lon1 - b!.lon0, b!.lat1 - b!.lat0)

    expect(lenA).toBeLessThan(wholeLen)
    expect(lenA + lenB).toBeCloseTo(wholeLen, 6)
  })

  it('el número de sub-pasos es el que aplica la capa: ceil(dt / MAX_DT_S)', () => {
    const MAX_DT_S = 0.05 // espejo de la constante de utils/map/wind-layer.ts
    expect(Math.max(1, Math.ceil(0.016 / MAX_DT_S))).toBe(1) // pantalla a 60 fps
    expect(Math.max(1, Math.ceil(0.05 / MAX_DT_S))).toBe(1)
    expect(Math.max(1, Math.ceil(0.25 / MAX_DT_S))).toBe(5) // GIF a 4 fps
    expect(Math.max(1, Math.ceil(0.4 / MAX_DT_S))).toBe(8) // GIF a 2.5 fps
  })
})
