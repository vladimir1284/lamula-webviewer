import type { Phenomenon } from '#shared/contract'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CellTable from '~/components/CellTable.vue'

function cell(cellId: string, attrs: Record<string, unknown>): Phenomenon {
  return {
    site_id: 'BYX',
    product_code: 58,
    vol_time: '2026-07-11T03:08:18',
    kind: 'storm_cell',
    cell_id: cellId,
    lat: 24.5,
    lon: -81.5,
    azimuth_deg: 90,
    range_km: 50,
    attrs,
  }
}

function meso(mesoId: string, stormId: string, tvs: boolean): Phenomenon {
  return { ...cell(mesoId, { storm_id: stormId, tvs }), kind: 'meso', product_code: 141 }
}

const ROWS: Phenomenon[] = [
  cell('A1', { dbz_max: 45, dbz_max_height_kft: 10, movement_deg: 120, movement_kt: 20 }),
  cell('B2', { dbz_max: 55, new: true }),
  cell('C3', {}), // sin dbz_max (GAB paginado) → al final
  meso('366', 'B2', true),
]

describe('CellTable', () => {
  it('ordena por dBZ máx desc con faltantes al final; "—" para ausentes', () => {
    const w = mount(CellTable, {
      props: { phenomena: ROWS, joined: '2026-07-11T03:08:18', selectedCell: null },
    })
    const ids = w.findAll('tbody tr').map(tr => tr.find('td').text())
    expect(ids).toEqual(['B2', 'A1', 'C3'])
    expect(w.find('[data-testid=cell-row-C3]').text()).toContain('—')
  })

  it('flags: Nueva por attrs.new, MESO/TVS por join con storm_id', () => {
    const w = mount(CellTable, {
      props: { phenomena: ROWS, joined: '2026-07-11T03:08:18', selectedCell: null },
    })
    const b2 = w.find('[data-testid=cell-row-B2]').text()
    expect(b2).toContain('Nueva')
    expect(b2).toContain('MESO')
    expect(b2).toContain('TVS')
    expect(w.find('[data-testid=cell-row-A1]').text()).not.toContain('MESO')
  })

  it('click emite select; click en la seleccionada deselecciona (null)', async () => {
    const w = mount(CellTable, {
      props: { phenomena: ROWS, joined: '2026-07-11T03:08:18', selectedCell: 'A1' },
    })
    await w.find('[data-testid=cell-row-B2]').trigger('click')
    expect(w.emitted('select')![0]).toEqual(['B2'])
    await w.find('[data-testid=cell-row-A1]').trigger('click')
    expect(w.emitted('select')![1]).toEqual([null])
  })

  it('dos estados vacíos distinguibles: sin join vs volumen sin celdas', () => {
    const noJoin = mount(CellTable, { props: { phenomena: null, joined: null, selectedCell: null } })
    expect(noJoin.find('[data-testid=cells-no-join]').exists()).toBe(true)
    const emptyVol = mount(CellTable, {
      props: { phenomena: [], joined: '2026-07-11T03:08:18', selectedCell: null },
    })
    expect(emptyVol.find('[data-testid=cells-empty]').exists()).toBe(true)
  })
})
