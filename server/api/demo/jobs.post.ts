// POST /api/demo/jobs {icao, source_keys[]} — lanza un job con volúmenes de la fuente pública (D18).
// Devuelve solo lo que la página necesita: el token del enlace de resultado y el estado.
export default defineEventHandler(async (event) => {
  const { icao, source_keys } = await readBody<{ icao?: string, source_keys?: unknown }>(event)
  if (typeof icao !== 'string' || !Array.isArray(source_keys) || !source_keys.length || source_keys.some(k => typeof k !== 'string')) {
    throw createError({ statusCode: 422, statusMessage: 'icao y source_keys son obligatorios' })
  }
  const j = await demoCall(event, '/v1/jobs', {
    method: 'POST',
    body: { icao, inputs: (source_keys as string[]).map(k => ({ source_key: k })) },
  }) as { id: string, state: string, result_token: string, n_volumes: number }
  return { id: j.id, state: j.state, result_token: j.result_token, n_volumes: j.n_volumes }
})
