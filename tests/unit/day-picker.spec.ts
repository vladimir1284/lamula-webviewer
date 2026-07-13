import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DayPicker from '../../components/DayPicker.vue'

const DAYS = ['2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11']

describe('DayPicker', () => {
  it('un botón por día, con sufijo UTC', () => {
    const wrapper = mount(DayPicker, { props: { days: DAYS, modelValue: DAYS[3] } })
    for (const day of DAYS) {
      expect(wrapper.get(`[data-testid="day-option-${day}"]`).text()).toBe(`${day} UTC`)
    }
  })

  it('marca aria-pressed en el día seleccionado', () => {
    const wrapper = mount(DayPicker, { props: { days: DAYS, modelValue: DAYS[1] } })
    expect(wrapper.get(`[data-testid="day-option-${DAYS[1]}"]`).attributes('aria-pressed')).toBe('true')
    expect(wrapper.get(`[data-testid="day-option-${DAYS[0]}"]`).attributes('aria-pressed')).toBe('false')
  })

  it('click emite update:modelValue con el día clicado', async () => {
    const wrapper = mount(DayPicker, { props: { days: DAYS, modelValue: DAYS[0] } })
    await wrapper.get(`[data-testid="day-option-${DAYS[2]}"]`).trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([DAYS[2]])
  })
})
