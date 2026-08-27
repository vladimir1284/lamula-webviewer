// TimelineMenu (D28/F3, sin cobertura propia hasta D36): único lugar donde
// vive la selección de velocidad tras eliminar el popup flotante duplicado
// de TimelineStrip.vue (ver timeline-strip.spec.ts).
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TimelineMenu from '../../components/TimelineMenu.vue'

describe('TimelineMenu', () => {
  it('marca la velocidad activa y emite speed al elegir otra', async () => {
    const wrapper = mount(TimelineMenu, { props: { animationFrames: 12, speed: 1 } })
    wrapper.get('dialog').element.setAttribute('open', '')
    const speed1 = wrapper.get('[data-testid="timeline-menu-speed-1"]')
    expect((speed1.element as HTMLInputElement).checked).toBe(true)

    await wrapper.get('[data-testid="timeline-menu-speed-2"]').setValue(true)
    expect(wrapper.emitted('speed')?.at(-1)).toEqual([2])
  })

  it('emite setPref con animationFrames al cambiar el select', async () => {
    const wrapper = mount(TimelineMenu, { props: { animationFrames: 12, speed: 1 } })
    wrapper.get('dialog').element.setAttribute('open', '')
    await wrapper.get('[data-testid="pref-animation-frames"]').setValue('24')
    expect(wrapper.emitted('setPref')?.at(-1)).toEqual([{ animationFrames: 24 }])
  })

  it('expone open()', () => {
    const wrapper = mount(TimelineMenu, { props: { animationFrames: 12, speed: 1 } })
    expect(typeof (wrapper.vm as { open?: unknown }).open).toBe('function')
  })
})
