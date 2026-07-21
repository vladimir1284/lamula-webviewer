import { describe, expect, it } from 'vitest'
import { sampleFromLevel } from '../../utils/map/cursor'

describe('sampleFromLevel (contrato: 0 nodata, 1 RF, ≥2 físico)', () => {
  it('nivel 0 / NaN → null', () => {
    expect(sampleFromLevel(0, 0.5, -33)).toBeNull()
    expect(sampleFromLevel(Number.NaN, 0.5, -33)).toBeNull()
  })

  it('nivel 1 → range folded sin valor', () => {
    expect(sampleFromLevel(1, 0.5, -33)).toEqual({ level: 1, value: null, rangeFolded: true })
  })

  it('nivel ≥ 2 → físico = nivel·scale+offset', () => {
    expect(sampleFromLevel(156, 0.5, -33)).toEqual({ level: 156, value: 45, rangeFolded: false })
  })

  // Con 'smooth' (D32/D33) el nivel bajo el cursor llega fraccional —
  // bilineal de GPU entre categorías enteras (real/nodata/range folded).
  it('nivel fraccional (borde interpolado con smooth) redondea a la categoría más cercana', () => {
    expect(sampleFromLevel(0.3, 0.5, -33)).toBeNull() // redondea a 0 (nodata) — no un dBZ negativo falso
    expect(sampleFromLevel(0.6, 0.5, -33)).toEqual({ level: 1, value: null, rangeFolded: true })
    expect(sampleFromLevel(1.4, 0.5, -33)).toEqual({ level: 1, value: null, rangeFolded: true })
    expect(sampleFromLevel(1.6, 0.5, -33)).toEqual({ level: 2, value: -32, rangeFolded: false }) // sin clamp: ground truth
  })

  // Halo de suavizado (D33, hallazgo del usuario en producción): el degradé
  // completo nodata↔real (no solo el borde 0↔1) da niveles bajos "reales"
  // pero espurios en dBZ — clampNonPositive los trata como nodata.
  describe('clampNonPositive (halo de dBZ con smooth activo)', () => {
    it('nivel bajo con valor físico ≤ 0 → null en vez de dBZ negativo (o cero)', () => {
      expect(sampleFromLevel(2, 0.5, -33, true)).toBeNull() // level 2 → -32 dBZ, parte del halo
      expect(sampleFromLevel(65, 0.5, -33, true)).toBeNull() // level 65 → -0.5 dBZ, todavía ≤ 0
      expect(sampleFromLevel(66, 0.5, -33, true)).toBeNull() // level 66 → exactamente 0 dBZ, "mayor que 0" lo excluye
    })

    it('nivel con valor físico > 0 no se toca', () => {
      expect(sampleFromLevel(67, 0.5, -33, true)).toEqual({ level: 67, value: 0.5, rangeFolded: false })
      expect(sampleFromLevel(156, 0.5, -33, true)).toEqual({ level: 156, value: 45, rangeFolded: false })
    })

    it('sin el flag (default false), el mismo nivel bajo sigue dando el valor real (ground truth, smooth off)', () => {
      expect(sampleFromLevel(2, 0.5, -33)).toEqual({ level: 2, value: -32, rangeFolded: false })
    })

    it('nodata y range folded no cambian con el flag', () => {
      expect(sampleFromLevel(0, 0.5, -33, true)).toBeNull()
      expect(sampleFromLevel(1, 0.5, -33, true)).toEqual({ level: 1, value: null, rangeFolded: true })
    })
  })
})
