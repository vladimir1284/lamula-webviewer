// VwpModal (D35): compone TabModal + los estados error/empty que antes
// vivían en VwpPanel. Split de vwp-panel.spec.ts.
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TabModal from '~/components/TabModal.vue'
import VwpChart from '~/components/VwpChart.vue'
import VwpModal from '~/components/VwpModal.vue'
import VwpTable from '~/components/VwpTable.vue'
import WindBarb from '~/components/WindBarb.vue'
import { vwpVolume } from '../helpers/derive'

const LEVELS = vwpVolume.rows.map(({ created_at: _c, ...row }) => row)
// sin auto-import de Nuxt bajo Vitest: registrar a mano los componentes
// anidados (TabModal → VwpChart → WindBarb, VwpTable), igual que
// vwp-chart.spec.ts hace con WindBarb
const globalComponents = { components: { TabModal, VwpChart, VwpTable, WindBarb } }

function mountOpen(props: Partial<InstanceType<typeof VwpModal>['$props']> = {}) {
  const w = mount(VwpModal, {
    props: {
      profiles: { [vwpVolume.volTime]: LEVELS },
      window: [vwpVolume.volTime],
      joined: vwpVolume.volTime,
      ...props,
    },
    global: globalComponents,
  })
  w.get('dialog').element.setAttribute('open', '')
  return w
}

describe('VwpModal', () => {
  it('estado normal: tab Gráfico muestra el grid, tab Datos la tabla', async () => {
    const w = mountOpen()
    expect(w.find('[data-testid=vwp-grid]').exists()).toBe(true)
    await w.get('[data-testid=vwp-modal-tab-table]').trigger('click')
    expect(w.find('[data-testid=vwp-table]').exists()).toBe(true)
  })

  it('estado error: reemplaza el contenido en ambos tabs', async () => {
    const w = mountOpen({ error: 'boom' })
    expect(w.find('[data-testid=vwp-error]').text()).toContain('boom')
    await w.get('[data-testid=vwp-modal-tab-table]').trigger('click')
    expect(w.find('[data-testid=vwp-error]').text()).toContain('boom')
  })

  it('estado vacío: reemplaza el contenido en ambos tabs', () => {
    const w = mountOpen({ empty: true, window: [], profiles: {}, joined: null })
    expect(w.find('[data-testid=vwp-empty]').exists()).toBe(true)
  })

  it('expone open()/close()', () => {
    const w = mount(VwpModal, {
      props: { profiles: {}, window: [], joined: null },
      global: globalComponents,
    })
    expect(typeof (w.vm as { open?: unknown }).open).toBe('function')
    expect(typeof (w.vm as { close?: unknown }).close).toBe('function')
  })

  it('cerrar el <dialog> nativo emite close', () => {
    const w = mountOpen()
    w.get('dialog').element.dispatchEvent(new Event('close'))
    expect(w.emitted('close')).toHaveLength(1)
  })
})
