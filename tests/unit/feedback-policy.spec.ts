import { describe, expect, it } from 'vitest'
import {
  PROCESS_IP_LIMIT,
  PROCESS_IP_WINDOW_MS,
  requiresCaptcha,
  resolveClientIp,
} from '~/server/utils/feedback-policy'
import { checkRateLimit } from '~/server/utils/rate-limit'

describe('Política de captcha por producto (decisión 51)', () => {
  it('exige captcha al webviewer público', () => {
    expect(requiresCaptcha('webviewer')).toBe(true)
  })

  it('exime del captcha a lamula-process', () => {
    expect(requiresCaptcha('process')).toBe(false)
  })
})

describe('Resolución de la IP del cliente', () => {
  it('prefiere cf-connecting-ip, que Cloudflare sobrescribe', () => {
    const ip = resolveClientIp(
      { cfConnectingIp: '203.0.113.7', forwardedFor: '198.51.100.1, 203.0.113.7' },
      '10.0.0.5',
    )
    expect(ip).toBe('203.0.113.7')
  })

  it('toma el ÚLTIMO elemento de x-forwarded-for, no el primero', () => {
    // El primero lo controla quien llama: si lo usáramos, variarlo daría cubo
    // de rate-limit nuevo en cada envío.
    const ip = resolveClientIp(
      { cfConnectingIp: null, forwardedFor: 'basura-falseada, 198.51.100.1, 203.0.113.7' },
      '10.0.0.5',
    )
    expect(ip).toBe('203.0.113.7')
  })

  it('cae al socket y luego a unknown', () => {
    expect(resolveClientIp({ cfConnectingIp: '', forwardedFor: '  ,  ' }, '10.0.0.5')).toBe('10.0.0.5')
    expect(resolveClientIp({}, null)).toBe('unknown')
  })
})

describe('Cubo por IP de los envíos sin captcha', () => {
  it(`deja pasar ${PROCESS_IP_LIMIT} envíos por IP y corta el siguiente`, () => {
    const key = `noCaptcha:test-${Math.random()}`
    for (let i = 0; i < PROCESS_IP_LIMIT; i++) {
      expect(checkRateLimit(key, PROCESS_IP_LIMIT, PROCESS_IP_WINDOW_MS)).toBe(true)
    }
    expect(checkRateLimit(key, PROCESS_IP_LIMIT, PROCESS_IP_WINDOW_MS)).toBe(false)
  })

  it('cuenta por IP, así que tokens distintos de la misma IP comparten cubo', () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250)}-${Math.random()}`
    expect(checkRateLimit(`noCaptcha:${ip}`, 2, PROCESS_IP_WINDOW_MS)).toBe(true)
    expect(checkRateLimit(`noCaptcha:${ip}`, 2, PROCESS_IP_WINDOW_MS)).toBe(true)
    expect(checkRateLimit(`noCaptcha:${ip}`, 2, PROCESS_IP_WINDOW_MS)).toBe(false)
  })
})
