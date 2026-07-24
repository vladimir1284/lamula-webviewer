// VwpTable contra el perfil real grabado (proxy de la validación NVW de la
// puerta M4): la tabla reproduce las filas de la fixture con u/v derivados
// — verificados a mano para casos cardinales en wind.spec.ts. Split de
// vwp-panel.spec.ts (D35).
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VwpTable from '~/components/VwpTable.vue'
import { uvFromDirSpeed } from '~/utils/wind/uv'
import { vwpVolume } from '../helpers/derive'

const LEVELS = vwpVolume.rows.map(({ created_at: _c, ...row }) => row)

function mountTable(props: Partial<InstanceType<typeof VwpTable>['$props']> = {}) {
  return mount(VwpTable, {
    props: {
      profiles: { [vwpVolume.volTime]: LEVELS },
      joined: vwpVolume.volTime,
      ...props,
    },
  })
}

describe('VwpTable', () => {
  it('reproduce el perfil grabado con u/v derivados', () => {
    const w = mountTable()
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

  it('units si: tabla en m/km/h', () => {
    const w = mountTable({ units: 'si' })
    const head = w.find('[data-testid=vwp-table] thead').text()
    expect(head).toContain('Alt (m)')
    expect(head).toContain('Vel (km/h)')
    const sorted = [...LEVELS].sort((a, b) => b.height_ft - a.height_ft)
    const cells = w.find('[data-testid=vwp-table]').findAll('tbody tr')[0]!.findAll('td').map(td => td.text())
    expect(cells[0]).toBe(String(Math.round(sorted[0]!.height_ft * 0.3048)))
    expect(cells[2]).toBe((sorted[0]!.wind_speed_kt * 1.852).toFixed(0))
  })

  it('sin volumen casado: da paso al aviso, sin tabla', () => {
    const w = mountTable({ joined: null })
    expect(w.find('[data-testid=vwp-no-join]').exists()).toBe(true)
    expect(w.find('[data-testid=vwp-table]').exists()).toBe(false)
  })
})
