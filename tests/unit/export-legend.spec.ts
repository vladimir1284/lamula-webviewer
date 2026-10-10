// Geometría de la leyenda extraída de MapLegend.vue (F7.1). El test ancla los
// números del SVG original a 320 px para que la extracción sea demostrablemente
// no-visual, y comprueba que la escala es proporcional para el chrome del
// export.
import { describe, expect, it } from 'vitest'
import { RASTER_PRODUCTS } from '../../shared/products'
import { n0b } from '../../shared/products/defs/n0b'
import { n0g } from '../../shared/products/defs/n0g'
import { LEGEND_BASE_WIDTH, legendDomain, legendGeometry } from '~/utils/export/legend-geometry'

describe('legendGeometry', () => {
  it('a 320 px reproduce exactamente las constantes del SVG original', () => {
    const g = legendGeometry(n0b.palette)
    expect(LEGEND_BASE_WIDTH).toBe(320)
    expect(g.width).toBe(320)
    expect(g.height).toBe(46)
    expect(g.barX).toBe(8)
    expect(g.barW).toBe(304)
    expect(g.barY).toBe(4)
    expect(g.barH).toBe(14)
    expect(g.tickLineY1).toBe(4)
    expect(g.tickLineY2).toBe(22)
    expect(g.tickLabelY).toBe(35)
    expect(g.tickFontSize).toBe(13)
    expect(g.unitX).toBe(312)
    expect(g.unitY).toBe(44)
    expect(g.unitFontSize).toBe(10)
  })

  it('escala proporcionalmente: al doble de ancho, todo al doble', () => {
    const a = legendGeometry(n0b.palette, 'imperial', 320)
    const b = legendGeometry(n0b.palette, 'imperial', 640)
    expect(b.height).toBe(a.height * 2)
    expect(b.barH).toBe(a.barH * 2)
    expect(b.tickFontSize).toBe(a.tickFontSize * 2)
    expect(b.ticks[0]!.x).toBeCloseTo(a.ticks[0]!.x * 2, 10)
    expect(b.rects[0]!.width).toBeCloseTo(a.rects[0]!.width * 2, 10)
  })

  it('steps: un rect por stop, contiguos y cubriendo la barra entera', () => {
    const g = legendGeometry(n0b.palette)
    expect(g.mode).toBe('steps')
    expect(g.gradient).toHaveLength(0)
    expect(g.rects).toHaveLength(n0b.palette.stops.length)
    expect(g.rects[0]!.x).toBeCloseTo(g.barX, 10)
    const last = g.rects[g.rects.length - 1]!
    expect(last.x + last.width).toBeCloseTo(g.barX + g.barW, 10)
    for (let i = 1; i < g.rects.length; i++) {
      expect(g.rects[i]!.x).toBeCloseTo(g.rects[i - 1]!.x + g.rects[i - 1]!.width, 10)
    }
  })

  it('interpolated: paradas 0–1 monótonas, sin rects', () => {
    const g = legendGeometry(n0g.palette)
    expect(g.mode).toBe('interpolated')
    expect(g.rects).toHaveLength(0)
    expect(g.gradient).toHaveLength(n0g.palette.stops.length)
    expect(g.gradient[0]!.offset).toBeCloseTo(0, 10)
    expect(g.gradient[g.gradient.length - 1]!.offset).toBeCloseTo(1, 10)
    for (let i = 1; i < g.gradient.length; i++) {
      expect(g.gradient[i]!.offset).toBeGreaterThanOrEqual(g.gradient[i - 1]!.offset)
    }
  })

  it('units si: convierte la etiqueta pero NO la posición (D28)', () => {
    const imperial = legendGeometry(n0g.palette, 'imperial')
    const si = legendGeometry(n0g.palette, 'si')
    expect(imperial.unitLabel).toBe('kt')
    expect(si.unitLabel).toBe('km/h')
    for (let i = 0; i < si.ticks.length; i++) {
      expect(si.ticks[i]!.x).toBeCloseTo(imperial.ticks[i]!.x, 10)
    }
    const tick = n0g.palette.ticks[1]!
    expect(si.ticks[1]!.label).toBe((tick * 1.852).toFixed(0))
    // dBZ es adimensional: intacto en SI
    expect(legendGeometry(n0b.palette, 'si').ticks.map(t => t.label))
      .toEqual(n0b.palette.ticks.map(String))
  })

  it('legendDomain: steps extiende el máximo un 7 %, interpolated no', () => {
    const steps = legendDomain(n0b.palette)
    const stops = n0b.palette.stops
    const min = stops[0]![0]
    const last = stops[stops.length - 1]![0]
    expect(steps.min).toBe(min)
    expect(steps.max).toBeCloseTo(last + (last - min) * 0.07, 10)

    const interp = legendDomain(n0g.palette)
    expect(interp.max).toBe(n0g.palette.stops[n0g.palette.stops.length - 1]![0])
  })

  it('oculta la etiqueta de un tick que pisaría a la anterior, pero nunca la marca', () => {
    // DVL tiene 5 y 10 pegados en el extremo bajo de una escala lineal
    const dvl = legendGeometry(RASTER_PRODUCTS[134]!.palette)
    expect(dvl.ticks).toHaveLength(RASTER_PRODUCTS[134]!.palette.ticks.length)
    expect(dvl.ticks.filter(t => !t.showLabel).map(t => t.label)).toEqual(['10'])

    // N0B está bien espaciado: no se oculta ninguna
    expect(legendGeometry(n0b.palette).ticks.every(t => t.showLabel)).toBe(true)
  })

  it('las etiquetas visibles nunca se solapan entre sí', () => {
    for (const product of Object.values(RASTER_PRODUCTS)) {
      for (const width of [320, 460, 640]) {
        const g = legendGeometry(product.palette, 'imperial', width)
        const visible = g.ticks.filter(t => t.showLabel)
        for (let i = 1; i < visible.length; i++) {
          const gap = visible[i]!.x - visible[i - 1]!.x
          const halves = (visible[i]!.label.length + visible[i - 1]!.label.length) / 2
          expect(gap, `${product.mnemonic} @${width}: ${visible[i - 1]!.label}/${visible[i]!.label}`)
            .toBeGreaterThan(halves * g.tickFontSize * 0.6)
        }
      }
    }
  })

  it('rangeFoldedColor viaja tal cual', () => {
    expect(legendGeometry(n0g.palette).rangeFoldedColor).toBe(n0g.palette.rangeFoldedColor)
    expect(legendGeometry({ ...n0b.palette, rangeFoldedColor: null }).rangeFoldedColor).toBeNull()
  })
})
