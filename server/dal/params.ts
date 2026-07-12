// Validación Zod de query params: 400 con detalle en vez de 500 opaco.
import type { H3Event } from 'h3'
import type { z } from 'zod'

export function parseQueryParams<S extends z.ZodType>(event: H3Event, schema: S): z.infer<S> {
  const parsed = schema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Parámetros inválidos',
      data: parsed.error.issues.map(i => ({
        param: i.path.join('.'),
        message: i.message,
      })),
    })
  }
  return parsed.data
}
