// GET /api/mosaic/domains — dominios del mosaico con sus radares miembros.
// La lista completa de miembros es lo que permite al overlay de cobertura
// pintar los radares AUSENTES de un slot (miembros menos `contributing`).
import { useDal } from '../../dal'

export default defineEventHandler(async (event) => {
  const domains = await useDal(event).listMosaicDomains()
  setResponseHeader(event, 'Cache-Control', 'public, max-age=300')
  return domains
})
