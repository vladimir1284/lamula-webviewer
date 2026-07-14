import type { Phenomenon } from '#shared/contract'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TrendChart from '~/components/TrendChart.vue'

function point(volTime: string, attrs: Record<string, unknown>): Phenomenon {
  return {
    site_id: 'BYX',
    product_code: 58,
    vol_time: volTime,
    kind: 'storm_cell',
    cell_id: 'D4',
    lat: 24.5,
    lon: -81.5,
    azimuth_deg: 90,
    range_km: 50,
    attrs,
  }
}

const SERIE: Phenomenon[] = [
  point('2026-07-11T02:50:38', { dbz_max: 45, dbz_max_height_kft: 8 }),
  point('2026-07-11T02:55:54', {}), // hueco (GAB paginado)
  point('2026-07-11T03:01:02', { dbz_max: 52, dbz_max_height_kft: 12 }),
  point('2026-07-11T03:06:27', { dbz_max: 49, dbz_max_height_kft: 10 }),
]

describe('TrendChart', () => {
  it('dos mini-charts con un punto por valor presente (huecos sin interpolar)', () => {
    const w = mount(TrendChart, { props: { series: SERIE, cellId: 'D4' } })
    const charts = w.findAll('[data-testid=trend-chart]')
    expect(charts).toHaveLength(2)
    // 3 de 4 volúmenes traen dbz_max → 3 puntos por chart
    expect(charts[0]!.findAll('[data-testid=trend-point]')).toHaveLength(3)
    // el hueco corta la línea: los 3 puntos no forman una sola polyline continua
    // (el segmento anterior al hueco tiene <2 puntos y no se pinta)
    expect(charts[0]!.findAll('polyline')).toHaveLength(1)
    expect(charts[0]!.find('polyline').attributes('points')!.split(' ')).toHaveLength(2)
  })

  it('sin celda seleccionada → mensaje de invitación', () => {
    const w = mount(TrendChart, { props: { series: null, cellId: null } })
    expect(w.find('[data-testid=trend-no-cell]').exists()).toBe(true)
  })

  it('serie sin claves de dBZ → estado vacío explicado', () => {
    const w = mount(TrendChart, {
      props: { series: [point('2026-07-11T02:50:38', {})], cellId: 'D4' },
    })
    expect(w.find('[data-testid=trend-empty]').exists()).toBe(true)
  })

  it('error de la serie visible', () => {
    const w = mount(TrendChart, { props: { series: null, cellId: 'D4', error: 'boom' } })
    expect(w.find('[data-testid=trend-error]').text()).toContain('boom')
  })
})
