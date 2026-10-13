import { randomUUID } from 'crypto'
import type { H3Event } from 'h3'
import { sendApiTrace } from '../utils/betterstack'

function eventHandler<T extends (event: H3Event) => unknown>(handler: T): T {
  if (typeof defineEventHandler === 'function') {
    return defineEventHandler(handler) as unknown as T
  }
  return handler
}

export default eventHandler((event: H3Event) => {
  const path = event.path || event.node?.req?.url || '/'

  // Solo rastrear peticiones a endpoints de API
  if (!path.startsWith('/api/')) {
    return
  }

  const startTime = performance.now()

  const reqHeaders = (event as unknown as { headers?: Headers; node?: { req?: { headers?: Record<string, string> } } }).headers || event.node?.req?.headers || {}
  const getHeaderVal = (name: string): string | undefined => {
    if (reqHeaders && typeof (reqHeaders as Headers).get === 'function') {
      return (reqHeaders as Headers).get(name) || undefined
    }
    if (reqHeaders && typeof reqHeaders === 'object') {
      const rec = reqHeaders as Record<string, string>
      return rec[name] || rec[name.toLowerCase()]
    }
    return undefined
  }

  // Extraer o generar Request ID para trazabilidad correlacionada
  const existingRequestId = typeof getHeader === 'function'
    ? getHeader(event, 'x-request-id')
    : getHeaderVal('x-request-id')

  const requestId = typeof existingRequestId === 'string' && existingRequestId
    ? existingRequestId
    : randomUUID()

  if (typeof setResponseHeader === 'function') {
    setResponseHeader(event, 'x-request-id', requestId)
  }
  else if (event.node?.res?.setHeader) {
    event.node.res.setHeader('x-request-id', requestId)
  }

  // Guardar request_id en la respuesta/evento para otros middlewares/plugins
  event.context.requestId = requestId

  const res = event.node?.res
  if (!res) {
    return
  }

  // Capturar métricas y enviar la traza al finalizar la respuesta HTTP
  res.on('finish', () => {
    const durationMs = performance.now() - startTime
    const statusCode = res.statusCode || 200
    const query = typeof getQuery === 'function' ? (getQuery(event) as Record<string, unknown>) : {}
    const userAgent = typeof getHeader === 'function' ? getHeader(event, 'user-agent') : getHeaderVal('user-agent')
    const referer = typeof getHeader === 'function' ? getHeader(event, 'referer') : getHeaderVal('referer')
    const ip = typeof getRequestIP === 'function'
      ? getRequestIP(event, { xForwardedFor: true })
      : event.node?.req?.socket?.remoteAddress

    sendApiTrace(
      {
        method: event.method || 'GET',
        path: path.split('?')[0] || path,
        query,
        statusCode,
        durationMs,
        userAgent,
        ip,
        referer,
        requestId,
      },
      event,
    )
  })
})
