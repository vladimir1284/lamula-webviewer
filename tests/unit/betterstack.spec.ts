import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import {
  formatApiTracePayload,
  getBetterStackLogger,
  noopLogger,
  resetLoggerCache,
  sendApiTrace,
} from '~/server/utils/betterstack'
import betterstackMiddleware from '~/server/middleware/betterstack'

describe('Better Stack API Traces Utility', () => {
  beforeEach(() => {
    resetLoggerCache()
  })

  afterEach(() => {
    resetLoggerCache()
    vi.restoreAllMocks()
  })

  describe('getBetterStackLogger', () => {
    it('devuelve noopLogger si no se provee token', () => {
      const logger = getBetterStackLogger()
      expect(logger).toBe(noopLogger)

      const loggerEmpty = getBetterStackLogger('')
      expect(loggerEmpty).toBe(noopLogger)
    })

    it('no lanza errores al invocar métodos en noopLogger', async () => {
      expect(() => {
        noopLogger.info('test info')
        noopLogger.warn('test warn')
        noopLogger.error('test error')
        noopLogger.debug('test debug')
      }).not.toThrow()

      await expect(noopLogger.flush()).resolves.toBeUndefined()
    })

    it('instancia y cachea un Logtail si se pasa un token', () => {
      const logger1 = getBetterStackLogger('my-source-token')
      expect(logger1).not.toBe(noopLogger)

      const logger2 = getBetterStackLogger('my-source-token')
      expect(logger2).toBe(logger1)

      const logger3 = getBetterStackLogger('different-token')
      expect(logger3).not.toBe(logger1)
    })

    it('limpia el cache con resetLoggerCache', () => {
      const logger1 = getBetterStackLogger('my-source-token')
      resetLoggerCache()
      const logger2 = getBetterStackLogger('my-source-token')

      expect(logger1).not.toBe(logger2)
    })
  })

  describe('formatApiTracePayload', () => {
    it('formatea correctamente peticiones exitosas (2xx) con nivel info', () => {
      const payload = formatApiTracePayload({
        method: 'get',
        path: '/api/radars',
        statusCode: 200,
        durationMs: 12.3456,
        userAgent: 'Mozilla/5.0',
        ip: '127.0.0.1',
        requestId: 'req-123',
      }, 'sha-test')

      expect(payload.message).toBe('[API] GET /api/radars 200 - 12.35ms')
      expect(payload.level).toBe('info')
      expect(payload.metadata).toEqual({
        http: {
          method: 'GET',
          path: '/api/radars',
          status_code: 200,
          duration_ms: 12.35,
          user_agent: 'Mozilla/5.0',
          ip: '127.0.0.1',
        },
        service: 'lamula-webviewer',
        environment: expect.any(String),
        build_id: 'sha-test',
        request_id: 'req-123',
      })
    })

    it('asigna nivel warn para códigos HTTP 4xx', () => {
      const payload = formatApiTracePayload({
        method: 'post',
        path: '/api/admin/login',
        statusCode: 401,
        durationMs: 5.1,
      })

      expect(payload.message).toBe('[API] POST /api/admin/login 401 - 5.1ms')
      expect(payload.level).toBe('warn')
      expect(payload.metadata.http).toMatchObject({
        method: 'POST',
        path: '/api/admin/login',
        status_code: 401,
      })
    })

    it('asigna nivel error para códigos HTTP 5xx o presencia de error', () => {
      const err = new Error('Database connection failed')
      const payload = formatApiTracePayload({
        method: 'get',
        path: '/api/products',
        statusCode: 500,
        durationMs: 150.22,
        error: err,
      })

      expect(payload.message).toBe('[API] GET /api/products 500 - 150.22ms')
      expect(payload.level).toBe('error')
      expect(payload.metadata.error).toEqual({
        name: 'Error',
        message: 'Database connection failed',
        stack: expect.any(String),
      })
    })

    it('incluye query string y context si existen', () => {
      const payload = formatApiTracePayload({
        method: 'get',
        path: '/api/rasters/closest',
        query: { site: '153', product: 'N0B' },
        statusCode: 200,
        durationMs: 8.4,
        context: { cacheHit: true },
      })

      expect(payload.metadata.http).toMatchObject({
        query: { site: '153', product: 'N0B' },
      })
      expect(payload.metadata.cacheHit).toBe(true)
    })
  })

  describe('sendApiTrace', () => {
    it('envía trazas sin token llamando noopLogger sin fallar', () => {
      const spyInfo = vi.spyOn(noopLogger, 'info')

      sendApiTrace({
        method: 'get',
        path: '/api/health',
        statusCode: 200,
        durationMs: 1.2,
      })

      expect(spyInfo).toHaveBeenCalledWith(
        '[API] GET /api/health 200 - 1.2ms',
        expect.objectContaining({
          service: 'lamula-webviewer',
        }),
      )
    })
  })

  describe('Better Stack Server Middleware', () => {
    function createMockEvent(path: string, method = 'GET', headers: Record<string, string> = {}) {
      class MockRes extends EventEmitter {
        statusCode = 200
        headers: Record<string, string> = {}
        setHeader(name: string, value: string) {
          this.headers[name] = value
        }
      }

      const res = new MockRes()
      const reqHeaders = new Headers(headers)

      const reqObj = {
        url: path,
        method,
        headers: reqHeaders,
      }

      return {
        path,
        method,
        headers: reqHeaders,
        req: reqObj,
        node: {
          req: {
            url: path,
            headers,
            socket: { remoteAddress: '127.0.0.1' },
          },
          res,
        },
        context: {} as Record<string, unknown>,
      }
    }

    it('ignora peticiones que no son de API (/api/)', async () => {
      const event = createMockEvent('/some-page')

      await betterstackMiddleware(event as unknown as Parameters<typeof betterstackMiddleware>[0])
      expect(event.context.requestId).toBeUndefined()
    })

    it('intercepta peticiones /api/, asigna x-request-id y registra traza al finalizar', async () => {
      const event = createMockEvent('/api/radars', 'GET', { 'user-agent': 'TestAgent' })

      const spySendApiTrace = vi.spyOn(noopLogger, 'info')

      await betterstackMiddleware(event as unknown as Parameters<typeof betterstackMiddleware>[0])

      expect(event.context.requestId).toBeDefined()
      expect(typeof event.context.requestId).toBe('string')

      // Simular finalización de la respuesta
      event.node.res.emit('finish')

      expect(spySendApiTrace).toHaveBeenCalledWith(
        expect.stringMatching(/^\[API\] GET \/api\/radars 200 - \d+(\.\d+)?ms$/),
        expect.objectContaining({
          http: expect.objectContaining({
            method: 'GET',
            path: '/api/radars',
            status_code: 200,
          }),
          request_id: event.context.requestId,
        }),
      )
    })
  })
})
