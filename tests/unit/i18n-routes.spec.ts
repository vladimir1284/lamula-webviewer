// Canario del prefijo de locale (F5). La estrategia es `prefix_except_default`
// con `es` por defecto, así que el inglés vive bajo `/en/...` mientras que la
// ruta del viewer es `/[site]/[product]/[[time]]`. Las dos conviven porque un
// site_id del feed es un ICAO de 3 letras y `en` tiene 2 — si algún día entra
// un sitio de 2 caracteres que coincida con un código de locale, `/en` dejaría
// de ser ambiguo solo por suerte y habría que pasar a `prefix` o a un prefijo
// propio (`/l/en/...`). Este test es el que debe avisar.
import { describe, expect, it } from 'vitest'
import radars from '../../server/dal/fixtures/radars.json'
import domains from '../../server/dal/fixtures/mosaic-domains.json'

const LOCALE_CODES = ['es', 'en']

describe('prefijo de locale vs rutas del viewer', () => {
  it('ningún site_id del feed colisiona con un código de locale', () => {
    for (const r of radars as Array<{ site_id: string }>) {
      expect(LOCALE_CODES).not.toContain(r.site_id.toLowerCase())
    }
  })

  it('ningún domain_id del mosaico colisiona con un código de locale', () => {
    // /mosaic/[domain]/... va bajo el prefijo, pero un dominio llamado "en"
    // haría ilegible /en/mosaic/en/N0B. Mismo canario, otro espacio de nombres.
    for (const d of domains as Array<{ domain_id: string }>) {
      expect(LOCALE_CODES).not.toContain(d.domain_id.toLowerCase())
    }
  })
})
