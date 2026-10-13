import { describe, expect, it } from 'vitest'
import { MAX_TICK_LABELS, TICK_LABEL_PITCH_PX, pickTickLabels } from '../../utils/timeline/labels'

/** n posiciones repartidas parejo en 0..100 */
function even(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i * 100) / (n - 1))
}

function minGapPx(pcts: number[], picked: number[], widthPx: number): number {
  let min = Infinity
  for (let i = 1; i < picked.length; i++) {
    const gap = ((pcts[picked[i]!]! - pcts[picked[i - 1]!]!) / 100) * widthPx
    min = Math.min(min, gap)
  }
  return min
}

describe('pickTickLabels', () => {
  it('sin medir (SSR/jsdom) devuelve los 6 equiespaciados de siempre', () => {
    // El HTML del servidor tiene que coincidir con el del cliente antes de
    // medir, o la hidratación parpadea con etiquetas apareciendo y yéndose.
    expect(pickTickLabels(even(12), 0)).toEqual([0, 2, 4, 7, 9, 11])
    expect(pickTickLabels(even(12), -1)).toHaveLength(MAX_TICK_LABELS)
  })

  it('lista vacía no da etiquetas', () => {
    expect(pickTickLabels([], 500)).toEqual([])
  })

  it('nunca pasa del tope de 6 por ancho que haya', () => {
    expect(pickTickLabels(even(300), 4000)).toHaveLength(MAX_TICK_LABELS)
  })

  it('en un track ancho respeta el paso mínimo entre etiquetas', () => {
    const pcts = even(20)
    const picked = pickTickLabels(pcts, 1004) // desktop 1280 px, medido
    expect(picked).toHaveLength(MAX_TICK_LABELS)
    expect(minGapPx(pcts, picked, 1004)).toBeGreaterThanOrEqual(TICK_LABEL_PITCH_PX)
  })

  it('en un track de móvil recorta hasta que dejan de pisarse', () => {
    const pcts = even(6)
    const picked = pickTickLabels(pcts, 328) // viewport 360 px, medido
    expect(picked.length).toBeLessThan(MAX_TICK_LABELS)
    expect(minGapPx(pcts, picked, 328)).toBeGreaterThanOrEqual(TICK_LABEL_PITCH_PX)
  })

  it('siempre conserva el primer y el último vol_time', () => {
    for (const width of [200, 328, 398, 492, 1004]) {
      const pcts = even(9)
      const picked = pickTickLabels(pcts, width)
      expect(picked.at(0)).toBe(0)
      expect(picked.at(-1)).toBe(8)
    }
  })

  it('posiciones apelotonadas: descarta por píxeles, no por índice', () => {
    // Caso real: un hueco de ingesta deja 5 volúmenes pegados al principio del
    // día y uno solo al final. Equiespaciar en la LISTA elegiría etiquetas que
    // en el TRACK caen casi encima.
    const pcts = [0, 1, 2, 3, 4, 100]
    const picked = pickTickLabels(pcts, 400)
    expect(picked).toEqual([0, 5])
    expect(minGapPx(pcts, picked, 400)).toBeGreaterThanOrEqual(TICK_LABEL_PITCH_PX)
  })

  it('un solo vol_time da una sola etiqueta', () => {
    expect(pickTickLabels([0], 400)).toEqual([0])
  })
})
