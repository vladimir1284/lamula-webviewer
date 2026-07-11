// GET /api/radars — catálogo dinámico (contrato: docs/contrato.md).
import { useDal } from '../dal'

export default defineEventHandler(async (event) => {
  const radars = await useDal(event).listRadars()
  setResponseHeader(event, 'Cache-Control', 'public, max-age=60')
  return radars
})
