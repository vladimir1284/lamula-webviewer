// DataModal (D37): panel de datos acoplado a la derecha (Celdas/Tendencia/
// VWP), reemplaza el <dialog> centrado (D36) — ver comentario en
// DataModal.vue. El contenido VWP (chart/table) viene tal cual de
// vwp-modal.spec.ts (borrado); CellTable/TrendChart ya tienen su propia
// cobertura (cell-table.spec.ts, trend-chart.spec.ts) — acá solo se
// verifica el cableado del panel (visibilidad, tabs, close, update:panel).
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CellTable from '~/components/CellTable.vue'
import DataModal from '~/components/DataModal.vue'
import TrendChart from '~/components/TrendChart.vue'
import VwpChart from '~/components/VwpChart.vue'
import VwpTable from '~/components/VwpTable.vue'
import WindBarb from '~/components/WindBarb.vue'
import { vwpVolume } from '../helpers/derive'

const LEVELS = vwpVolume.rows.map(({ created_at: _c, ...row }) => row)
// sin auto-import de Nuxt bajo Vitest: registrar a mano los componentes
// anidados, igual que vwp-chart.spec.ts hace con WindBarb
const globalComponents = { components: { CellTable, TrendChart, VwpChart, VwpTable, WindBarb } }

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
  return mount(DataModal, {
    props: { ...BASE_PROPS, ...props },
    global: globalComponents,
  })
}

describe('DataModal', () => {
  it('panel=null: no renderiza nada', () => {
    const w = mountOpen({ panel: null })
    expect(w.find('[data-testid=data-modal]').exists()).toBe(false)
  })

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

  it('cambiar de tab top-level (con el panel ya abierto) emite update:panel, no resetea a Celdas', async () => {
    const w = mountOpen({ panel: 'cells' })
    await w.get('[data-testid=data-modal-tab-vwp]').trigger('click')
    expect(w.emitted('update:panel')?.at(-1)).toEqual(['vwp'])
    expect(w.find('[data-testid=vwp-grid]').exists()).toBe(true)
  })

  it('botón cerrar emite close', async () => {
    const w = mountOpen()
    await w.get('[data-testid=data-modal-close]').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })
})
