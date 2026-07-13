import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AnimationControls from '../../components/AnimationControls.vue'

describe('AnimationControls', () => {
  it('no renderiza nada si la timeline no está lista (idle)', () => {
    const wrapper = mount(AnimationControls, {
      props: { playing: false, ready: false, currentVolTime: null, bufferReady: 0, bufferTotal: 0 },
    })
    expect(wrapper.find('[data-testid="anim-play"]').exists()).toBe(false)
  })

  it('muestra el ícono según playing y el vol_time actual', () => {
    const wrapper = mount(AnimationControls, {
      props: {
        playing: false,
        ready: true,
        currentVolTime: '2026-07-11T03:03:49',
        bufferReady: 6,
        bufferTotal: 6,
      },
    })
    expect(wrapper.get('[data-testid="anim-play"]').text()).toBe('▶')
    expect(wrapper.get('[data-testid="anim-frame-label"]').text()).toBe('2026-07-11T03:03:49Z')
  })

  it('cambia a ícono de pausa mientras reproduce, sin buffer bar si ya cargó todo', () => {
    const wrapper = mount(AnimationControls, {
      props: { playing: true, ready: true, currentVolTime: '2026-07-11T03:03:49', bufferReady: 6, bufferTotal: 6 },
    })
    expect(wrapper.get('[data-testid="anim-play"]').text()).toBe('⏸')
    expect(wrapper.find('[data-testid="anim-buffer"]').exists()).toBe(false)
  })

  it('muestra el progreso de buffer mientras no está completo', () => {
    const wrapper = mount(AnimationControls, {
      props: { playing: false, ready: true, currentVolTime: null, bufferReady: 2, bufferTotal: 6 },
    })
    expect(wrapper.get('[data-testid="anim-buffer"]').text()).toBe('buffer 2/6')
  })

  it('emite toggle al clickear', async () => {
    const wrapper = mount(AnimationControls, {
      props: { playing: false, ready: true, currentVolTime: null, bufferReady: 0, bufferTotal: 6 },
    })
    await wrapper.get('[data-testid="anim-play"]').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })
})
