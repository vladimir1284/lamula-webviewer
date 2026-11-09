import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DemoRequestForm from '~/components/DemoRequestForm.vue'

vi.stubGlobal('useI18n', () => ({ t: (k: string) => k }))
vi.stubGlobal('useRuntimeConfig', () => ({ public: { turnstileSiteKey: '' } }))

describe('formulario de solicitud de acceso', () => {
  it('no deja enviar sin correo, organización, interés y aceptación; y manda lo rellenado', async () => {
    const post = vi.fn(async () => ({ recibida: true }))
    vi.stubGlobal('$fetch', post)
    const w = mount(DemoRequestForm, { global: { stubs: { TurnstileWidget: { template: '<div />', methods: { reset() {} } } } } })
    const boton = () => w.get('[data-testid="req-submit"]')
    expect(boton().attributes('disabled')).toBeDefined()
    await w.get('[data-testid="req-email"]').setValue('a@b.org')
    await w.get('[data-testid="req-org"]').setValue('Univ')
    await w.get('[data-testid="req-int-huracan"]').setValue(true)
    expect(boton().attributes('disabled')).toBeDefined() // falta aceptar el aviso
    await w.get('[data-testid="req-accept"]').setValue(true)
    expect(boton().attributes('disabled')).toBeUndefined()
    await w.get('[data-testid="req-form"]').trigger('submit')
    await vi.waitFor(() => expect(w.find('[data-testid="req-sent"]').exists()).toBe(true))
    expect(post).toHaveBeenCalledWith('/api/demo/request', expect.objectContaining({
      method: 'POST', body: expect.objectContaining({ email: 'a@b.org', org: 'Univ', interes: ['huracan'], acepta_aviso: true }),
    }))
  })

  it('un error de captcha no marca la solicitud como enviada', async () => {
    vi.stubGlobal('$fetch', vi.fn(async () => { throw { statusCode: 403 } }))
    const w = mount(DemoRequestForm, { global: { stubs: { TurnstileWidget: { template: '<div />', methods: { reset() {} } } } } })
    await w.get('[data-testid="req-email"]').setValue('a@b.org')
    await w.get('[data-testid="req-org"]').setValue('Univ')
    await w.get('[data-testid="req-int-dia"]').setValue(true)
    await w.get('[data-testid="req-accept"]').setValue(true)
    await w.get('[data-testid="req-form"]').trigger('submit')
    await vi.waitFor(() => expect(w.find('[data-testid="req-error"]').exists()).toBe(true))
    expect(w.find('[data-testid="req-sent"]').exists()).toBe(false)
  })
})
