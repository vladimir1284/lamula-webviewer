// VwpPanel contra el perfil real grabado (proxy de la validación NVW de la
// puerta M4): la tabla reproduce las filas de la fixture con u/v derivados
// — verificados a mano para casos cardinales en wind.spec.ts, aquí contra
// los valores del feed.
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VwpPanel from '~/components/VwpPanel.vue'
import WindBarb from '~/components/WindBarb.vue'
import { uvFromDirSpeed } from '~/utils/wind/uv'
import { vwpVolume } from '../helpers/derive'

const LEVELS = vwpVolume.rows.map(({ created_at: _c, ...row }) => row)

function mountPanel(props: Partial<InstanceType<typeof VwpPanel>['$props']> = {}) {
  return mount(VwpPanel, {
    props: {
      profiles: { [vwpVolume.volTime]: LEVELS },
      window: [vwpVolume.volTime],
      joined: vwpVolume.volTime,
      ...props,
    },
    global: { components: { WindBarb } },
  })
}

describe('VwpPanel', () => {
  it('grid: una barba por nivel y columna del volumen casado resaltada', () => {
    const w = mountPanel()
    expect(w.findAll('[data-testid=wind-barb]')).toHaveLength(LEVELS.length)
    expect(w.find('[data-testid=vwp-current-column]').exists()).toBe(true)
  })

  it('la tabla reproduce el perfil grabado con u/v derivados', () => {
    const w = mountPanel()
    const rows = w.find('[data-testid=vwp-table]').findAll('tbody tr')
    expect(rows).toHaveLength(LEVELS.length)
    // filas descendentes por altura; validar 3 contra la fixture
    const sorted = [...LEVELS].sort((a, b) => b.height_ft - a.height_ft)
    for (const i of [0, Math.floor(LEVELS.length / 2), LEVELS.length - 1]) {
      const cells = rows[i]!.findAll('td').map(td => td.text())
      const level = sorted[i]!
      const { u, v } = uvFromDirSpeed(level.wind_dir_deg, level.wind_speed_kt)
      expect(cells[0]).toBe(String(level.height_ft))
      expect(cells[1]).toBe(`${level.wind_dir_deg}°`)
      expect(cells[2]).toBe(String(level.wind_speed_kt))
      expect(cells[3]).toBe(String(level.rms_kt ?? '—'))
      expect(cells[4]).toBe(u.toFixed(1))
      expect(cells[5]).toBe(v.toFixed(1))
    }
  })

  it('units si: tabla en m/km/h, pero la barba SIGUE recibiendo kt crudo (invariante WMO, D28)', () => {
    const w = mountPanel({ units: 'si' })
    const head = w.find('[data-testid=vwp-table] thead').text()
    expect(head).toContain('Alt (m)')
    expect(head).toContain('Vel (km/h)')
    const sorted = [...LEVELS].sort((a, b) => b.height_ft - a.height_ft)
    const cells = w.find('[data-testid=vwp-table]').findAll('tbody tr')[0]!.findAll('td').map(td => td.text())
    expect(cells[0]).toBe(String(Math.round(sorted[0]!.height_ft * 0.3048)))
    expect(cells[2]).toBe((sorted[0]!.wind_speed_kt * 1.852).toFixed(0))
    // el componente WindBarb recibe la velocidad cruda en kt, sin convertir
    const barb = w.findComponent({ name: 'WindBarb' })
    expect(barb.props('speedKt')).toBe(LEVELS[0]!.wind_speed_kt)
  })

  it('clock local: las horas del grid se formatean en la tz dada', () => {
    // el componente usa la tz del navegador; aquí solo se verifica que en
    // utc el label es el slice histórico (byte-idéntico)
    const w = mountPanel({ clock: 'utc' })
    expect(w.text()).toContain(vwpVolume.volTime.slice(11, 16))
  })

  it('frame sin perfil casado: grid sigue, tabla da paso al aviso', () => {
    const w = mountPanel({ joined: null })
    expect(w.find('[data-testid=vwp-grid]').exists()).toBe(true)
    expect(w.find('[data-testid=vwp-no-join]').exists()).toBe(true)
    expect(w.find('[data-testid=vwp-table]').exists()).toBe(false)
  })

  it('estados vacío y error', () => {
    const empty = mountPanel({ empty: true, window: [], profiles: {}, joined: null })
    expect(empty.find('[data-testid=vwp-empty]').exists()).toBe(true)
    const error = mountPanel({ error: 'boom' })
    expect(error.find('[data-testid=vwp-error]').text()).toContain('boom')
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
