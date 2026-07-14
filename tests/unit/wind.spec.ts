// Matemática de viento reimplementada desde cero (decisión 25): u/v desde
// dir/speed meteorológicos y descomposición de barbas WMO.
import { describe, expect, it } from 'vitest'
import { barbSegments, barbSpec } from '~/utils/wind/barb'
import { uvFromDirSpeed } from '~/utils/wind/uv'

describe('uvFromDirSpeed (dir = "desde", 0° = norte)', () => {
  it.each([
    ['viento del norte empuja al sur', 0, 20, 0, -20],
    ['viento del este empuja al oeste', 90, 20, -20, 0],
    ['viento del sur empuja al norte', 180, 20, 0, 20],
    ['viento del oeste empuja al este', 270, 20, 20, 0],
  ])('%s', (_name, dir, speed, u, v) => {
    const uv = uvFromDirSpeed(dir, speed)
    expect(uv.u).toBeCloseTo(u, 10)
    expect(uv.v).toBeCloseTo(v, 10)
  })

  it('45° reparte por igual y speed 0 anula', () => {
    const { u, v } = uvFromDirSpeed(45, 10)
    expect(u).toBeCloseTo(-10 * Math.SQRT1_2, 10)
    expect(v).toBeCloseTo(-10 * Math.SQRT1_2, 10)
    const calma = uvFromDirSpeed(123, 0)
    expect(calma.u).toBeCloseTo(0, 12)
    expect(calma.v).toBeCloseTo(0, 12)
  })
})

describe('barbSpec (redondeo a 5 kt; banderín 50, barba 10, media 5)', () => {
  it.each([
    [0, { pennants: 0, fulls: 0, half: false, calm: true }],
    [2.4, { pennants: 0, fulls: 0, half: false, calm: true }],
    [2.5, { pennants: 0, fulls: 0, half: true, calm: false }],
    [5, { pennants: 0, fulls: 0, half: true, calm: false }],
    [7.5, { pennants: 0, fulls: 1, half: false, calm: false }],
    [10, { pennants: 0, fulls: 1, half: false, calm: false }],
    [15, { pennants: 0, fulls: 1, half: true, calm: false }],
    [47.5, { pennants: 1, fulls: 0, half: false, calm: false }],
    [50, { pennants: 1, fulls: 0, half: false, calm: false }],
    [65, { pennants: 1, fulls: 1, half: true, calm: false }],
    [135, { pennants: 2, fulls: 3, half: true, calm: false }],
  ])('%d kt', (speed, expected) => {
    const spec = barbSpec(speed)
    expect(spec.pennants).toBe(expected.pennants)
    expect(spec.fulls).toBe(expected.fulls)
    expect(spec.half).toBe(expected.half)
    expect(spec.calm).toBe(expected.calm)
  })

  it('la descomposición reconstruye la velocidad redondeada', () => {
    for (let kt = 0; kt <= 150; kt += 1) {
      const s = barbSpec(kt)
      if (s.calm) continue
      expect(s.pennants * 50 + s.fulls * 10 + (s.half ? 5 : 0)).toBe(s.roundedKt)
    }
  })
})

describe('barbSegments (coords locales, y = norte)', () => {
  it('calma → sin geometría', () => {
    expect(barbSegments(barbSpec(0), 90, 30)).toEqual({ lines: [], triangles: [], calm: true })
  })

  it('el asta apunta hacia la dirección "desde"', () => {
    const { lines } = barbSegments(barbSpec(10), 0, 30)
    // viento del norte: asta hacia +y
    expect(lines[0]).toEqual([0, 0, 0, 30])
    const este = barbSegments(barbSpec(10), 90, 30).lines[0]!
    expect(este[2]).toBeCloseTo(30, 10)
    expect(este[3]).toBeCloseTo(0, 10)
  })

  it('cuenta de elementos: 65 kt → 1 triángulo + asta + barba + media', () => {
    const segs = barbSegments(barbSpec(65), 200, 30)
    expect(segs.triangles).toHaveLength(1)
    expect(segs.lines).toHaveLength(3) // asta + 1 full + 1 half
  })

  it('la media barba es la mitad de larga que la completa', () => {
    const segs = barbSegments(barbSpec(15), 0, 30)
    const len = (l: [number, number, number, number]) => Math.hypot(l[2] - l[0], l[3] - l[1])
    const [full, half] = [segs.lines[1]!, segs.lines[2]!]
    expect(len(half)).toBeCloseTo(len(full) / 2, 10)
  })

  it('media barba sola (5 kt) no se pinta en la punta del asta', () => {
    const { lines } = barbSegments(barbSpec(5), 0, 30)
    const [, half] = lines
    expect(Math.hypot(half![0], half![1])).toBeLessThan(30)
  })
})
