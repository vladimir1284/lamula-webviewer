// DataModal (D36): un solo modal con tabs Celdas/Tendencia/VWP, reemplaza
// SidePanel.vue (rail) + VwpModal.vue (modal aparte) — los 3 ya compartían
// el mismo PanelId en overlayMachine. El contenido VWP (chart/table) viene
// tal cual de vwp-modal.spec.ts (borrado); CellTable/TrendChart ya tienen
// su propia cobertura (cell-table.spec.ts, trend-chart.spec.ts) — acá solo
// se verifica el cableado del modal (tabs, open/close, update:panel).
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CellTable from '~/components/CellTable.vue'
import DataModal from '~/components/DataModal.vue'
import TabModal from '~/components/TabModal.vue'
import TrendChart from '~/components/TrendChart.vue'
import VwpChart from '~/components/VwpChart.vue'
import VwpTable from '~/components/VwpTable.vue'
import WindBarb from '~/components/WindBarb.vue'
import { vwpVolume } from '../helpers/derive'

const LEVELS = vwpVolume.rows.map(({ created_at: _c, ...row }) => row)
// sin auto-import de Nuxt bajo Vitest: registrar a mano los componentes
// anidados, igual que vwp-chart.spec.ts hace con WindBarb
const globalComponents = { components: { TabModal, CellTable, TrendChart, VwpChart, VwpTable, WindBarb } }

const BASE_PROPS = {
  panel: 'vwp' as const,
  phenomena: null,
  joined: null,
  selectedCell: null,
  pastCellIds: [],
  futureCellIds: [],
  series: null,
  vwpProfiles: { [vwpVolume.volTime]: LEVELS },
  vwpWindow: [vwpVolume.volTime],
  vwpJoined: vwpVolume.volTime,
}

function mountOpen(props: Partial<InstanceType<typeof DataModal>['$props']> = {}) {
  const w = mount(DataModal, {
    props: { ...BASE_PROPS, ...props },
    global: globalComponents,
  })
  w.get('dialog').element.setAttribute('open', '')
  return w
}

describe('DataModal', () => {
  it('panel=vwp: abre en la tab VWP, sub-tab Gráfico muestra el grid, Datos la tabla', async () => {
    const w = mountOpen()
    expect(w.find('[data-testid=vwp-grid]').exists()).toBe(true)
    await w.get('[data-testid=vwp-modal-tab-table]').trigger('click')
    expect(w.find('[data-testid=vwp-table]').exists()).toBe(true)
  })

  it('estado error VWP: reemplaza el contenido en ambos sub-tabs', async () => {
    const w = mountOpen({ vwpError: 'boom' })
    expect(w.find('[data-testid=vwp-error]').text()).toContain('boom')
    await w.get('[data-testid=vwp-modal-tab-table]').trigger('click')
    expect(w.find('[data-testid=vwp-error]').text()).toContain('boom')
  })

  it('estado vacío VWP: reemplaza el contenido', () => {
    const w = mountOpen({ vwpEmpty: true, vwpWindow: [], vwpProfiles: {}, vwpJoined: null })
    expect(w.find('[data-testid=vwp-empty]').exists()).toBe(true)
  })

  it('cambiar de tab top-level (con el modal ya abierto) emite update:panel, no resetea a Celdas', async () => {
    const w = mountOpen({ panel: 'cells' })
    await w.get('[data-testid=data-modal-tab-vwp]').trigger('click')
    expect(w.emitted('update:panel')?.at(-1)).toEqual(['vwp'])
    expect(w.find('[data-testid=vwp-grid]').exists()).toBe(true)
  })

  it('expone open()/close()', () => {
    const w = mount(DataModal, { props: BASE_PROPS, global: globalComponents })
    expect(typeof (w.vm as { open?: unknown }).open).toBe('function')
    expect(typeof (w.vm as { close?: unknown }).close).toBe('function')
  })

  it('cerrar el <dialog> nativo emite close', () => {
    const w = mountOpen()
    w.get('dialog').element.dispatchEvent(new Event('close'))
    expect(w.emitted('close')).toHaveLength(1)
  })
})
