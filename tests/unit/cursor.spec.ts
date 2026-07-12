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
})
