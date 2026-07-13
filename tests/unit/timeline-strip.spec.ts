import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TimelineStrip from '../../components/TimelineStrip.vue'

const TIMES = [
  '2026-07-11T03:03:49',
  '2026-07-11T03:06:27',
  '2026-07-11T03:16:49',
]

describe('TimelineStrip', () => {
  it('un tick por vol_time, marca el actual', () => {
    const wrapper = mount(TimelineStrip, {
      props: { times: TIMES, current: TIMES[1], gaps: [], canPrev: true, canNext: true },
    })
    const ticks = wrapper.findAll('[data-testid="timeline-tick"]')
    expect(ticks).toHaveLength(3)
    expect(ticks[1]!.attributes('aria-current')).toBe('true')
    expect(ticks[0]!.attributes('aria-current')).toBe('false')
  })

  it('emite select con el vol_time del tick clicado', async () => {
    const wrapper = mount(TimelineStrip, {
      props: { times: TIMES, current: TIMES[0], gaps: [], canPrev: true, canNext: true },
    })
    await wrapper.findAll('[data-testid="timeline-tick"]')[2]!.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([TIMES[2]])
  })

  it('emite step al hacer click en prev/next', async () => {
    const wrapper = mount(TimelineStrip, {
      props: { times: TIMES, current: TIMES[0], gaps: [], canPrev: true, canNext: true },
    })
    await wrapper.get('[data-testid="timeline-prev"]').trigger('click')
    await wrapper.get('[data-testid="timeline-next"]').trigger('click')
    expect(wrapper.emitted('step')).toEqual([[-1], [1]])
  })

  it('deshabilita prev/next según canPrev/canNext', () => {
    const wrapper = mount(TimelineStrip, {
      props: { times: TIMES, current: TIMES[0], gaps: [], canPrev: false, canNext: false },
    })
    expect(wrapper.get('[data-testid="timeline-prev"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="timeline-next"]').attributes('disabled')).toBeDefined()
  })

  it('renderiza una banda por hueco', () => {
    const wrapper = mount(TimelineStrip, {
      props: {
        times: TIMES,
        current: TIMES[0],
        gaps: [{ after: TIMES[0]!, before: TIMES[1]!, ms: 600_000 }],
        canPrev: true,
        canNext: true,
      },
    })
    expect(wrapper.findAll('[data-testid="timeline-gap"]')).toHaveLength(1)
  })
})
