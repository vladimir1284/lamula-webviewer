import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MapLegend from '../../components/MapLegend.vue'
import { n0b } from '../../shared/products/defs/n0b'
import { n0g } from '../../shared/products/defs/n0g'

describe('MapLegend', () => {
  it('steps: un rect por stop + etiquetas de ticks', () => {
    const wrapper = mount(MapLegend, { props: { palette: n0b.palette } })
    expect(wrapper.findAll('rect')).toHaveLength(n0b.palette.stops.length)
    for (const tick of n0b.palette.ticks) {
      expect(wrapper.text()).toContain(String(tick))
    }
    expect(wrapper.text()).toContain('dBZ')
  })

  it('interpolated: gradiente con un stop SVG por parada', () => {
    const wrapper = mount(MapLegend, { props: { palette: n0g.palette } })
    expect(wrapper.find('linearGradient').exists()).toBe(true)
    expect(wrapper.findAll('linearGradient stop')).toHaveLength(n0g.palette.stops.length)
  })

  it('chip RF solo si el producto tiene range folded', () => {
    expect(mount(MapLegend, { props: { palette: n0g.palette } }).text()).toContain('RF')
    // DVL no tiene RF
    const dvlLike = { ...n0b.palette, rangeFoldedColor: null }
    expect(mount(MapLegend, { props: { palette: dvlLike } }).text()).not.toContain('RF')
  })
})
