import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TimelineStrip from '../../components/TimelineStrip.vue'

const TIMES = [
  '2026-07-11T03:03:49',
  '2026-07-11T03:06:27',
  '2026-07-11T03:16:49',
]

const BASE_PROPS = {
  times: TIMES,
  current: TIMES[0],
  gaps: [],
  canPrev: true,
  canNext: true,
  playing: false,
  bufferReady: 0,
  bufferTotal: 0,
}

describe('TimelineStrip', () => {
  it('un tick (invisible) por vol_time, marca el actual', () => {
    const wrapper = mount(TimelineStrip, { props: { ...BASE_PROPS, current: TIMES[1] } })
    const ticks = wrapper.findAll('[data-testid="timeline-tick"]')
    expect(ticks).toHaveLength(3)
    expect(ticks[1]!.attributes('aria-current')).toBe('true')
    expect(ticks[0]!.attributes('aria-current')).toBe('false')
  })

  it('emite select con el vol_time del tick clicado', async () => {
    const wrapper = mount(TimelineStrip, { props: BASE_PROPS })
    await wrapper.findAll('[data-testid="timeline-tick"]')[2]!.trigger('click')
    expect(wrapper.emitted('select')?.at(-1)).toEqual([TIMES[2]])
  })

  it('emite step al hacer click en prev/next', async () => {
    const wrapper = mount(TimelineStrip, { props: BASE_PROPS })
    await wrapper.get('[data-testid="timeline-prev"]').trigger('click')
    await wrapper.get('[data-testid="timeline-next"]').trigger('click')
    expect(wrapper.emitted('step')).toEqual([[-1], [1]])
  })

  it('deshabilita prev/next según canPrev/canNext', () => {
    const wrapper = mount(TimelineStrip, { props: { ...BASE_PROPS, canPrev: false, canNext: false } })
    expect(wrapper.get('[data-testid="timeline-prev"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="timeline-next"]').attributes('disabled')).toBeDefined()
  })

  it('renderiza una banda por hueco', () => {
    const wrapper = mount(TimelineStrip, {
      props: { ...BASE_PROPS, gaps: [{ after: TIMES[0]!, before: TIMES[1]!, ms: 600_000 }] },
    })
    expect(wrapper.findAll('[data-testid="timeline-gap"]')).toHaveLength(1)
  })

  it('el slider expone el frame actual vía aria-valuetext/valuenow', () => {
    const wrapper = mount(TimelineStrip, { props: { ...BASE_PROPS, current: TIMES[1] } })
    const slider = wrapper.get('[data-testid="timeline-slider"]')
    expect(slider.attributes('aria-valuenow')).toBe('1')
    expect(slider.attributes('aria-valuetext')).toBeTruthy()
  })

  it('muestra el ícono de play/pausa según playing y emite toggle', async () => {
    const wrapper = mount(TimelineStrip, { props: BASE_PROPS })
    expect(wrapper.get('[data-testid="anim-play"]').text()).toBe('▶')
    await wrapper.get('[data-testid="anim-play"]').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)

    await wrapper.setProps({ playing: true })
    expect(wrapper.get('[data-testid="anim-play"]').text()).toBe('⏸')
  })

  it('emite refresh y menu al clickear sus botones', async () => {
    const wrapper = mount(TimelineStrip, { props: BASE_PROPS })
    await wrapper.get('[data-testid="timeline-refresh"]').trigger('click')
    await wrapper.get('[data-testid="timeline-menu"]').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('menu')).toHaveLength(1)
  })

  it('el selector de velocidad solo aparece con buffer activo (animación enganchada) y emite el valor clicado', async () => {
    const idle = mount(TimelineStrip, { props: BASE_PROPS })
    expect(idle.find('[data-testid="anim-speed-2"]').exists()).toBe(false)

    const wrapper = mount(TimelineStrip, { props: { ...BASE_PROPS, bufferTotal: 3, bufferReady: 3, speed: 1 } })
    const btn2x = wrapper.get('[data-testid="anim-speed-2"]')
    expect(btn2x.attributes('aria-pressed')).toBe('false')
    await btn2x.trigger('click')
    expect(wrapper.emitted('speed')?.[0]).toEqual([2])
  })

  it('muestra el indicador de buffer mientras no está completo', () => {
    const wrapper = mount(TimelineStrip, { props: { ...BASE_PROPS, bufferTotal: 6, bufferReady: 2 } })
    expect(wrapper.get('[data-testid="anim-buffer"]').text()).toBe('buffer 2/6')
  })

  it('oculta el indicador de buffer cuando ya cargó todo', () => {
    const wrapper = mount(TimelineStrip, { props: { ...BASE_PROPS, bufferTotal: 6, bufferReady: 6 } })
    expect(wrapper.find('[data-testid="anim-buffer"]').exists()).toBe(false)
  })
})
