// VwpChart contra el perfil real grabado (proxy de la validación NVW de la
// puerta M4): grid de barbas + columna resaltada. Split de vwp-panel.spec.ts
// (D35 — VwpChart/VwpTable ahora viven en tabs separados de VwpModal).
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VwpChart from '~/components/VwpChart.vue'
import WindBarb from '~/components/WindBarb.vue'
import { vwpVolume } from '../helpers/derive'

const LEVELS = vwpVolume.rows.map(({ created_at: _c, ...row }) => row)

function mountChart(props: Partial<InstanceType<typeof VwpChart>['$props']> = {}) {
  return mount(VwpChart, {
    props: {
      profiles: { [vwpVolume.volTime]: LEVELS },
      window: [vwpVolume.volTime],
      joined: vwpVolume.volTime,
      ...props,
    },
    global: { components: { WindBarb } },
  })
}

describe('VwpChart', () => {
  it('grid: una barba por nivel y columna del volumen casado resaltada', () => {
    const w = mountChart()
    expect(w.findAll('[data-testid=wind-barb]')).toHaveLength(LEVELS.length)
    expect(w.find('[data-testid=vwp-current-column]').exists()).toBe(true)
  })

  it('units si: la barba SIGUE recibiendo kt crudo (invariante WMO, D28)', () => {
    const w = mountChart({ units: 'si' })
    const barb = w.findComponent({ name: 'WindBarb' })
    expect(barb.props('speedKt')).toBe(LEVELS[0]!.wind_speed_kt)
  })

  it('clock local: las horas del grid se formatean en la tz dada', () => {
    // el componente usa la tz del navegador; aquí solo se verifica que en
    // utc el label es el slice histórico (byte-idéntico)
    const w = mountChart({ clock: 'utc' })
    expect(w.text()).toContain(vwpVolume.volTime.slice(11, 16))
  })

  it('frame sin perfil casado: el grid sigue mostrando el resto del día', () => {
    const w = mountChart({ joined: null })
    expect(w.find('[data-testid=vwp-grid]').exists()).toBe(true)
    expect(w.find('[data-testid=vwp-current-column]').exists()).toBe(false)
  })
})

describe('WindBarb', () => {
  const svgMount = (props: { dirDeg: number, speedKt: number }) =>
    mount({
      components: { WindBarb },
      template: `<svg><WindBarb v-bind="$attrs" /></svg>`,
      inheritAttrs: false,
    }, { attrs: props })

  it('calma → círculo, sin líneas', () => {
    const w = svgMount({ dirDeg: 0, speedKt: 1 })
    expect(w.find('[data-testid=barb-calm]').exists()).toBe(true)
    expect(w.findAll('[data-testid=barb-line]')).toHaveLength(0)
  })

  it('65 kt → banderín + asta + barba + media', () => {
    const w = svgMount({ dirDeg: 240, speedKt: 65 })
    expect(w.findAll('[data-testid=barb-pennant]')).toHaveLength(1)
    expect(w.findAll('[data-testid=barb-line]')).toHaveLength(3)
  })

  it('el eje y va invertido a pantalla (viento del norte → asta hacia arriba)', () => {
    const w = svgMount({ dirDeg: 0, speedKt: 10 })
    const asta = w.findAll('[data-testid=barb-line]')[0]!
    expect(Number(asta.attributes('y2'))).toBeLessThan(0)
  })
})
