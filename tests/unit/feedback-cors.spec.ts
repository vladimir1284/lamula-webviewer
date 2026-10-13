import { describe, expect, it } from 'vitest'
import { corsHeaders, isCorsPath, parseAllowedOrigins } from '~/server/utils/cors'

const PROCESS = 'https://process.ladetec.com'
const ALLOWED = [PROCESS]

describe('Política de CORS del feedback (decisión 50)', () => {
  it('cubre /api/feedback y sus subrutas, con o sin query string', () => {
    expect(isCorsPath('/api/feedback')).toBe(true)
    expect(isCorsPath('/api/feedback/mine')).toBe(true)
    expect(isCorsPath('/api/feedback/mine/read')).toBe(true)
    expect(isCorsPath('/api/feedback?x=1')).toBe(true)
  })

  it('NO cubre el admin ni el resto de la API', () => {
    expect(isCorsPath('/api/admin/feedback')).toBe(false)
    expect(isCorsPath('/api/admin/feedback/1/reply')).toBe(false)
    expect(isCorsPath('/api/rasters/times')).toBe(false)
    // Prefijo parecido pero otra ruta: no debe colarse.
    expect(isCorsPath('/api/feedbackx')).toBe(false)
  })

  it('parsea la lista de orígenes y aguanta espacios y vacíos', () => {
    expect(parseAllowedOrigins(` ${PROCESS} , https://otro.dev ,`)).toEqual([
      PROCESS,
      'https://otro.dev',
    ])
    expect(parseAllowedOrigins('')).toEqual([])
    expect(parseAllowedOrigins(undefined)).toEqual([])
  })

  it('devuelve cabeceras solo para un origen de la allowlist', () => {
    const headers = corsHeaders(PROCESS, ALLOWED)
    expect(headers).not.toBeNull()
    expect(headers!['access-control-allow-origin']).toBe(PROCESS)
    expect(headers!['access-control-allow-headers']).toContain('x-feedback-token')
    expect(headers!['access-control-allow-methods']).toContain('POST')
    // Reflejamos el origen, así que Vary es obligatorio.
    expect(headers!.vary).toBe('Origin')
  })

  it('no autoriza un origen desconocido ni con la allowlist vacía', () => {
    expect(corsHeaders('https://sitio-cualquiera.com', ALLOWED)).toBeNull()
    expect(corsHeaders(PROCESS, [])).toBeNull()
    expect(corsHeaders('', ALLOWED)).toBeNull()
  })

  it('nunca emite el comodín ni permite credenciales', () => {
    const headers = corsHeaders(PROCESS, ALLOWED)!
    expect(headers['access-control-allow-origin']).not.toBe('*')
    expect(headers['access-control-allow-credentials']).toBeUndefined()
  })
})
