// Conversión de unidades para display (D28): solo texto, factores exactos,
// passthrough para unidades no convertibles (dBZ, mm, kg/m², desconocidas).
import { describe, expect, it } from 'vitest'
import {
  convertHeightFt,
  convertHeightKft,
  convertRasterValue,
  convertSpeedKt,
  formatHeightKft,
  formatSpeedKt,
  heightUnit,
  rasterUnitLabel,
  speedUnit,
} from '../../utils/units'

describe('utils/units — conversión numérica', () => {
  it('imperial es identidad', () => {
    expect(convertHeightKft(45, 'imperial')).toBe(45)
    expect(convertHeightFt(3000, 'imperial')).toBe(3000)
    expect(convertSpeedKt(20, 'imperial')).toBe(20)
  })

  it('factores exactos a SI', () => {
    expect(convertHeightKft(10, 'si')).toBeCloseTo(3.048, 10)
    expect(convertHeightFt(1000, 'si')).toBeCloseTo(304.8, 10)
    expect(convertSpeedKt(10, 'si')).toBeCloseTo(18.52, 10)
  })
})

describe('utils/units — etiquetas', () => {
  it('alturas: kft→km, ft→m', () => {
    expect(heightUnit('imperial', 'kft')).toBe('kft')
    expect(heightUnit('imperial', 'ft')).toBe('ft')
    expect(heightUnit('si', 'kft')).toBe('km')
    expect(heightUnit('si', 'ft')).toBe('m')
  })

  it('velocidad: kt→km/h', () => {
    expect(speedUnit('imperial')).toBe('kt')
    expect(speedUnit('si')).toBe('km/h')
  })
})

describe('utils/units — formateo texto', () => {
  it('null → em dash', () => {
    expect(formatHeightKft(null, 'si')).toBe('—')
    expect(formatSpeedKt(null, 'imperial')).toBe('—')
  })

  it('dígitos por defecto: alturas 1, velocidades 0', () => {
    expect(formatHeightKft(45, 'imperial')).toBe('45.0')
    expect(formatHeightKft(45, 'si')).toBe('13.7')
    expect(formatSpeedKt(20, 'imperial')).toBe('20')
    expect(formatSpeedKt(20, 'si')).toBe('37')
  })
})

describe('utils/units — raster (leyenda/cursor)', () => {
  it('kt y kft se convierten en SI', () => {
    expect(convertRasterValue(20, 'kt', 'si')).toEqual({ value: 37.04, unit: 'km/h' })
    const kft = convertRasterValue(10, 'kft', 'si')
    expect(kft.unit).toBe('km')
    expect(kft.value).toBeCloseTo(3.048, 10)
  })

  it('imperial es passthrough total', () => {
    expect(convertRasterValue(20, 'kt', 'imperial')).toEqual({ value: 20, unit: 'kt' })
  })

  it('unidades no convertibles pasan intactas también en SI', () => {
    for (const unit of ['dBZ', 'mm', 'kg/m2', 'lo-que-sea']) {
      expect(convertRasterValue(42, unit, 'si')).toEqual({ value: 42, unit })
    }
  })

  it('rasterUnitLabel', () => {
    expect(rasterUnitLabel('kt', 'si')).toBe('km/h')
    expect(rasterUnitLabel('kt', 'imperial')).toBe('kt')
    expect(rasterUnitLabel('dBZ', 'si')).toBe('dBZ')
  })
})
