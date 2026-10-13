import { sendApiTrace } from '../utils/betterstack'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    if (!event) return

    const path = event.path || event.node?.req?.url || ''
    if (!path.startsWith('/api/')) return

    const statusCode = error && typeof error === 'object' && 'statusCode' in error
      ? (error as { statusCode?: number }).statusCode || 500
      : event.node?.res?.statusCode || 500

    const requestId = (event.context?.requestId as string) || undefined

    sendApiTrace(
      {
        method: event.method || 'UNKNOWN',
        path: path.split('?')[0] || path,
        statusCode,
        durationMs: 0,
        requestId,
        error,
      },
      event,
    )
  })
})
