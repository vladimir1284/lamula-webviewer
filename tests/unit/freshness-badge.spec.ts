import { mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import FreshnessBadge from '~/components/FreshnessBadge.vue'

describe('FreshnessBadge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra los minutos desde el último scan', () => {
    const wrapper = mount(FreshnessBadge, {
      props: { lastSeenAt: '2026-07-10T11:50:00' },
    })
    expect(wrapper.text()).toContain('hace 10 min')
    expect(wrapper.classes()).toContain('bg-emerald-900')
  })

  it('marca como stale pasados 30 minutos', () => {
    const wrapper = mount(FreshnessBadge, {
      props: { lastSeenAt: '2026-07-10T11:00:00' },
    })
    expect(wrapper.text()).toContain('hace 60 min')
    expect(wrapper.classes()).toContain('bg-red-900')
  })
})
