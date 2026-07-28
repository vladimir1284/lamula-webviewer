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
  liveRefresh: true,
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
    expect(wrapper.get('[data-testid="anim-play"]').attributes('aria-label')).toBe('Reproducir')
    await wrapper.get('[data-testid="anim-play"]').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)

    await wrapper.setProps({ playing: true })
    expect(wrapper.get('[data-testid="anim-play"]').attributes('aria-label')).toBe('Pausar')
  })

  it('emite menu al clickear su botón', async () => {
    const wrapper = mount(TimelineStrip, { props: BASE_PROPS })
    await wrapper.get('[data-testid="timeline-menu"]').trigger('click')
    expect(wrapper.emitted('menu')).toHaveLength(1)
  })

  it('el checkbox "en vivo" refleja la prop y emite set-live-refresh al des/marcar', async () => {
    const wrapper = mount(TimelineStrip, { props: { ...BASE_PROPS, liveRefresh: true } })
    const checkbox = wrapper.get('[data-testid="live-refresh-toggle"] input')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    await checkbox.setValue(false)
    expect(wrapper.emitted('set-live-refresh')?.at(-1)).toEqual([false])

    await wrapper.setProps({ liveRefresh: false })
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
  })

  // El popup flotante de velocidad se eliminó (D36): quedaba redundante con
  // el fieldset "Velocidad" de TimelineMenu — esa selección se cubre ahora
  // en tests/unit/timeline-menu.spec.ts. "en vivo" ahora es una pastilla
  // sobre el track en vez de un botón más del grupo izquierdo — cubierto
  // arriba.
})
