// Plano demo (lamula-jobs): LayersMenu sin viento, rayos ni feedback; el resto del menú igual.
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LayersMenu from '~/components/LayersMenu.vue'

const base = {
  base: 'dark', panelOpen: false, hasPalette: true, opacity: 1, showPalette: true,
  layers: [], availableDays: [], day: '2017-09-10',
} as never

// Menú cerrado: pastillas flotantes. Menú abierto: el panel (las pastillas se esconden).
const cerrado = ['layer-toggle-wind-pill', 'layer-toggle-lightning-pill', 'feedback-pill']
const abierto = ['layer-toggle-wind', 'layer-toggle-lightning', 'menu-feedback-open']

async function ver(demo: boolean, ids: string[], abrir: boolean) {
  const w = mount(LayersMenu, { props: { ...(base as object), demo } as never })
  if (abrir) await w.get('[data-testid=layers-menu-toggle]').trigger('click')
  return Object.fromEntries(ids.map(id => [id, w.find(`[data-testid=${id}]`).exists()]))
}

describe('layersMenu en el plano demo', () => {
  it('sin demo muestra viento, rayos y feedback', async () => {
    expect(await ver(false, cerrado, false)).toEqual({ 'layer-toggle-wind-pill': true, 'layer-toggle-lightning-pill': true, 'feedback-pill': true })
    expect(await ver(false, abierto, true)).toEqual({ 'layer-toggle-wind': true, 'layer-toggle-lightning': true, 'menu-feedback-open': true })
  })

  it('con demo los oculta y conserva el resto', async () => {
    expect(await ver(true, cerrado, false)).toEqual({ 'layer-toggle-wind-pill': false, 'layer-toggle-lightning-pill': false, 'feedback-pill': false })
    expect(await ver(true, abierto, true)).toEqual({ 'layer-toggle-wind': false, 'layer-toggle-lightning': false, 'menu-feedback-open': false })
    expect(await ver(true, ['layer-toggle-cells-pill'], false)).toEqual({ 'layer-toggle-cells-pill': true })
  })
})
