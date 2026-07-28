// TabModal (D35/D36): modal genérico con tabs, reusado por DataModal (tabs
// Celdas/Tendencia/VWP). Mismo patrón de test que prefs-dialog.spec.ts —
// happy-dom no implementa el top-layer real, así que el contenido se
// testea con el atributo `open` puesto a mano.
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TabModal from '~/components/TabModal.vue'

const TABS = [
  { id: 'a', label: 'Tab A' },
  { id: 'b', label: 'Tab B' },
]

function mountOpen() {
  const w = mount(TabModal, {
    props: { title: 'Título', tabs: TABS, testidPrefix: 'test-modal' },
    slots: { a: '<p data-testid=content-a>contenido A</p>', b: '<p data-testid=content-b>contenido B</p>' },
  })
  w.get('dialog').element.setAttribute('open', '')
  return w
}

describe('TabModal', () => {
  it('arranca en el primer tab', () => {
    const w = mountOpen()
    expect(w.find('[data-testid=content-a]').exists()).toBe(true)
    expect(w.find('[data-testid=content-b]').exists()).toBe(false)
  })

  it('click en un tab cambia el contenido mostrado', async () => {
    const w = mountOpen()
    await w.get('[data-testid=test-modal-tab-b]').trigger('click')
    expect(w.find('[data-testid=content-a]').exists()).toBe(false)
    expect(w.find('[data-testid=content-b]').exists()).toBe(true)
  })

  it('expone open()/close() sobre el <dialog> nativo', () => {
    const w = mount(TabModal, { props: { title: 'Título', tabs: TABS, testidPrefix: 'test-modal' } })
    expect(typeof (w.vm as { open?: unknown }).open).toBe('function')
    expect(typeof (w.vm as { close?: unknown }).close).toBe('function')
  })

  it('el botón cerrar dispara close() sobre el dialog', async () => {
    const w = mountOpen()
    const closeSpy = vi.spyOn(w.get('dialog').element as HTMLDialogElement, 'close')
    await w.get('[data-testid=test-modal-close]').trigger('click')
    expect(closeSpy).toHaveBeenCalled()
  })

  it('active controlado (D36): open() respeta el valor bindeado, no resetea a tabs[0]', () => {
    const w = mount(TabModal, {
      props: { title: 'Título', tabs: TABS, testidPrefix: 'test-modal', active: 'b' },
      slots: { a: '<p data-testid=content-a>contenido A</p>', b: '<p data-testid=content-b>contenido B</p>' },
    })
    ;(w.vm as { open: () => void }).open()
    expect(w.find('[data-testid=content-a]').exists()).toBe(false)
    expect(w.find('[data-testid=content-b]').exists()).toBe(true)
  })

  it('active controlado: click en un tab emite update:active en vez de cambiar solo internamente', async () => {
    const w = mount(TabModal, {
      props: { title: 'Título', tabs: TABS, testidPrefix: 'test-modal', active: 'a' },
      slots: { a: '<p data-testid=content-a>contenido A</p>', b: '<p data-testid=content-b>contenido B</p>' },
    })
    await w.get('[data-testid=test-modal-tab-b]').trigger('click')
    expect(w.emitted('update:active')?.at(-1)).toEqual(['b'])
  })
})
