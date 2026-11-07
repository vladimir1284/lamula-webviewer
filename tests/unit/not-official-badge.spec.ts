import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NotOfficialBadge from '~/components/NotOfficialBadge.vue'

describe('etiqueta «no oficial» del plano demo', () => {
  it('dice que no son productos oficiales del NWS, sin botón para cerrarla', () => {
    const w = mount(NotOfficialBadge)
    const el = w.get('[data-testid="not-official"]')
    expect(el.attributes('role')).toBe('note')
    expect(el.text()).toMatch(/no son productos oficiales del NWS/i)
    expect(w.find('button').exists()).toBe(false)
  })

  it('no estorba al ratón: los controles de debajo siguen clicables', () => {
    expect(mount(NotOfficialBadge).get('div').classes()).toContain('pointer-events-none')
  })
})
