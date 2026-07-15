// PrefsDialog es stateless: renderiza las props y cada control emite el
// patch exacto (setPref). El ciclo showModal/close es del navegador — aquí
// se testea el contenido con el atributo `open` puesto (happy-dom no
// implementa el top-layer real).
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PrefsDialog from '~/components/PrefsDialog.vue'

function mountOpen(props: { coverage: boolean, units: 'imperial' | 'si', clock: 'utc' | 'local' }) {
  const wrapper = mount(PrefsDialog, { props })
  wrapper.get('dialog').element.setAttribute('open', '')
  return wrapper
}

describe('prefsDialog', () => {
  it('renderiza el estado de las props', () => {
    const w = mountOpen({ coverage: false, units: 'si', clock: 'utc' })
    expect((w.get('[data-testid=pref-coverage]').element as HTMLInputElement).checked).toBe(false)
    expect((w.get('[data-testid=pref-units-si]').element as HTMLInputElement).checked).toBe(true)
    expect((w.get('[data-testid=pref-units-imperial]').element as HTMLInputElement).checked).toBe(false)
    expect((w.get('[data-testid=pref-clock-utc]').element as HTMLInputElement).checked).toBe(true)
  })

  it('el checkbox de cobertura emite el patch con el nuevo valor', async () => {
    const w = mountOpen({ coverage: true, units: 'imperial', clock: 'local' })
    await w.get('[data-testid=pref-coverage]').setValue(false)
    expect(w.emitted('setPref')).toEqual([[{ coverage: false }]])
  })

  it('cada radio emite exactamente su patch', async () => {
    const w = mountOpen({ coverage: true, units: 'imperial', clock: 'local' })
    await w.get('[data-testid=pref-units-si]').setValue(true)
    await w.get('[data-testid=pref-clock-utc]').setValue(true)
    expect(w.emitted('setPref')).toEqual([[{ units: 'si' }], [{ clock: 'utc' }]])
  })

  it('expone open() sobre el <dialog> nativo', () => {
    const w = mount(PrefsDialog, { props: { coverage: true, units: 'imperial', clock: 'local' } })
    expect(typeof (w.vm as { open?: unknown }).open).toBe('function')
  })
})
