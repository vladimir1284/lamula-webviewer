import { Logtail } from '@logtail/node'
import type { H3Event } from 'h3'

export interface ApiTraceData {
  method: string
  path: string
  query?: Record<string, unknown>
  statusCode: number
  durationMs: number
  userAgent?: string
  ip?: string
  referer?: string
  requestId?: string
  error?: unknown
  context?: Record<string, unknown>
}

let cachedLogger: Logtail | null = null
let cachedToken: string | null = null

export interface LoggerClient {
  info(message: string, context?: Record<string, unknown>): unknown
  warn(message: string, context?: Record<string, unknown>): unknown
  error(message: string, context?: Record<string, unknown>): unknown
  debug(message: string, context?: Record<string, unknown>): unknown
  flush(): Promise<unknown>
}

class NoopLogger implements LoggerClient {
  info(_message: string, _context?: Record<string, unknown>): void {}
  warn(_message: string, _context?: Record<string, unknown>): void {}
  error(_message: string, _context?: Record<string, unknown>): void {}
  debug(_message: string, _context?: Record<string, unknown>): void {}
  async flush(): Promise<void> {}
}

export const noopLogger = new NoopLogger()

export function getBetterStackLogger(token?: string, endpoint?: string): LoggerClient {
  const sourceToken = token || ''

  if (!sourceToken) {
    return noopLogger
  }

  if (cachedLogger && cachedToken === sourceToken) {
    return cachedLogger
  }

  const options = endpoint ? { endpoint } : undefined
  cachedLogger = new Logtail(sourceToken, options)
  cachedToken = sourceToken

  return cachedLogger
}

export function resetLoggerCache(): void {
  cachedLogger = null
  cachedToken = null
}

function formatError(err: unknown) {
  if (!err) return undefined
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    }
  }
  if (typeof err === 'object') {
    return err
  }
  return { message: String(err) }
}

export function formatApiTracePayload(
  traceData: ApiTraceData,
  buildId = 'dev',
): {
  message: string
  level: 'info' | 'warn' | 'error'
  metadata: Record<string, unknown>
} {
  const {
    method,
    path,
    query,
    statusCode,
    durationMs,
    userAgent,
    ip,
    referer,
    requestId,
    error,
    context,
  } = traceData

  const level: 'info' | 'warn' | 'error' =
    statusCode >= 500 || error
      ? 'error'
      : statusCode >= 400
        ? 'warn'
        : 'info'

  const roundedDuration = Math.round(durationMs * 100) / 100
  const message = `[API] ${method.toUpperCase()} ${path} ${statusCode} - ${roundedDuration}ms`

  const metadata: Record<string, unknown> = {
    http: {
      method: method.toUpperCase(),
      path,
      ...(query && Object.keys(query).length > 0 ? { query } : {}),
      status_code: statusCode,
      duration_ms: roundedDuration,
      ...(userAgent ? { user_agent: userAgent } : {}),
      ...(ip ? { ip } : {}),
      ...(referer ? { referer } : {}),
    },
    service: 'lamula-webviewer',
    environment: process.env.NODE_ENV || 'development',
    build_id: buildId,
    ...(requestId ? { request_id: requestId } : {}),
    ...(error ? { error: formatError(error) } : {}),
    ...context,
  }

  return { message, level, metadata }
}

export function sendApiTrace(
  traceData: ApiTraceData,
  event?: H3Event,
): void {
  let token = ''
  let endpoint = ''
  let buildId = 'dev'

  if (event) {
    try {
      const config = useRuntimeConfig(event)
      token = (config.betterstackToken as string) || ''
      endpoint = (config.betterstackEndpoint as string) || ''
      buildId = (config.public?.buildId as string) || 'dev'
    }
    catch {
      // Si no hay contexto de Nuxt en runtime
    }
  }

  if (!token && typeof process !== 'undefined' && process.env) {
    token = process.env.BETTERSTACK_TOKEN || process.env.NUXT_BETTERSTACK_TOKEN || process.env.BETTERSTACK_SOURCE_TOKEN || ''
    endpoint = process.env.BETTERSTACK_ENDPOINT || process.env.NUXT_BETTERSTACK_ENDPOINT || ''
  }

  const logger = getBetterStackLogger(token, endpoint)
  const { message, level, metadata } = formatApiTracePayload(traceData, buildId)

  logger[level](message, metadata)
}
