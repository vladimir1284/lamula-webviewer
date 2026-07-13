import { describe, expect, it } from 'vitest'
import { computeGaps, GAP_MIN_MS } from '../../utils/timeline/gaps'

// minutos desde 2026-07-11T00:00:00, tolera desbordes de hora (70 → 01:10)
const t = (m: number) => new Date(Date.parse('2026-07-11T00:00:00Z') + m * 60_000)
  .toISOString().slice(0, 19)

describe('computeGaps', () => {
  it('menos de 3 times: sin señal para mediana → []', () => {
    expect(computeGaps([])).toEqual([])
    expect(computeGaps([t(0)])).toEqual([])
    expect(computeGaps([t(0), t(5)])).toEqual([])
  })

  it('cadencia regular: sin huecos', () => {
    const times = [t(0), t(5), t(10), t(15), t(20)]
    expect(computeGaps(times)).toEqual([])
  })

  it('un intervalo > 2×mediana se marca como hueco', () => {
    // mediana de intervalos regulares (5 min) → umbral 10 min; un salto a
    // los 40 min (25 min de hueco) lo cruza claramente
    const times = [t(0), t(5), t(10), t(15), t(40), t(45)]
    const gaps = computeGaps(times)
    expect(gaps).toEqual([{ after: t(15), before: t(40), ms: 25 * 60_000 }])
  })

  it('piso de 10 min: un hueco de 9 min no se marca aunque la mediana sea chica', () => {
    // mediana de intervalos de 1 min → 2×mediana=2min < GAP_MIN_MS (10 min);
    // el salto de 9 min queda por debajo del piso, no se marca
    const times = ['00:00', '00:01', '00:02', '00:11', '00:12'].map(hm => `2026-07-11T${hm}:00`)
    expect(computeGaps(times)).toEqual([])
  })

  it('piso de 10 min: un hueco de 11 min sí se marca', () => {
    const times = ['00:00', '00:01', '00:02', '00:13', '00:14'].map(hm => `2026-07-11T${hm}:00`)
    const gaps = computeGaps(times)
    expect(gaps).toEqual([{
      after: '2026-07-11T00:02:00',
      before: '2026-07-11T00:13:00',
      ms: 11 * 60_000,
    }])
    expect(gaps[0]!.ms).toBeGreaterThan(GAP_MIN_MS)
  })

  it('varios huecos en la misma serie, todos reportados en orden', () => {
    // intervalos: 5,5,25,5,5,25 (min) → mediana 5min, umbral 10min: los dos
    // saltos de 25min sobresalen del resto de la cadencia
    const times = [t(0), t(5), t(10), t(35), t(40), t(45), t(70)]
    const gaps = computeGaps(times)
    expect(gaps).toHaveLength(2)
    expect(gaps[0]).toEqual({ after: t(10), before: t(35), ms: 25 * 60_000 })
    expect(gaps[1]).toEqual({ after: t(45), before: t(70), ms: 25 * 60_000 })
  })
})
