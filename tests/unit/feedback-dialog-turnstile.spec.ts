import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FeedbackDialog from '~/components/FeedbackDialog.vue'

vi.stubGlobal('useI18n', () => ({
  t: (key: string, args?: Record<string, unknown>) => {
    if (args?.n !== undefined) return `${key}:${args.n}`
    return key
  },
}))

vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    turnstileSiteKey: 'test-site-key-123',
  },
}))

describe('FeedbackDialog con Turnstile', () => {
  it('deshabilita el botón de envío si turnstileSiteKey está presente pero no hay token', () => {
    const wrapper = mount(FeedbackDialog, {
      props: {
        open: true,
        activeTab: 'submit',
        items: [],
        submitting: false,
      },
      global: {
        stubs: {
          TurnstileWidget: {
            template: '<div data-testid="turnstile-stub" />',
          },
        },
      },
    })

    const messageInput = wrapper.find('[data-testid="feedback-message-input"]')
    messageInput.setValue('Mensaje de prueba')

    const submitBtn = wrapper.find('[data-testid="feedback-submit-btn"]')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('habilita el envío e incluye turnstileToken en el submit cuando el token es asignado', async () => {
    const wrapper = mount(FeedbackDialog, {
      props: {
        open: true,
        activeTab: 'submit',
        items: [],
        submitting: false,
      },
      global: {
        stubs: {
          TurnstileWidget: true,
        },
      },
    })

    await wrapper.find('[data-testid="feedback-message-input"]').setValue('Mensaje de prueba')

    // Simulamos emisión de token desde TurnstileWidget
    const widget = wrapper.findComponent({ name: 'TurnstileWidget' })
    await widget.vm.$emit('update:modelValue', 'fake-turnstile-token')

    const submitBtn = wrapper.find('[data-testid="feedback-submit-btn"]')
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(false)

    await submitBtn.trigger('click')

    expect(wrapper.emitted('submit')).toBeTruthy()
    const emittedPayload = wrapper.emitted('submit')![0][0] as { turnstileToken?: string }
    expect(emittedPayload.turnstileToken).toBe('fake-turnstile-token')
  })
})
