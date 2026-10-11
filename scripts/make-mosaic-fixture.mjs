#!/usr/bin/env node
// Genera los fixtures SINTÉTICOS del mosaico:
//   server/dal/fixtures/mosaic-domains.json
//   server/dal/fixtures/mosaic-domain-sites.json
//   server/dal/fixtures/mosaic-rasters.json
//
// Sintéticos por la misma razón que wind.json y lightning.json: re-grabar
// hoy destruiría el caso e2e BYX 03:08:18 (meso + raster + VWP, con COGs
// irreproducibles tras la purga de retención de 72 h). En la próxima
// re-grabación completa salen reales y este generador se retira; los tests
// no se rompen porque sus expectativas se derivan del fixture
// (tests/helpers/derive.ts), no se hardcodean.
//
// Data-driven sobre las grabaciones existentes (radar-agnóstico):
//  - dominio = todos los sitios con rasters del producto elegido;
//  - geometría calculada igual que ingest/mosaic/geometry.py: AEQD en el
//    punto medio del bbox, semiejes simétricos (max|x| + radio), malla par;
//  - un slot de 300 s por cada rejilla que contenga al menos un vol_time
//    grabado, con `contributing` real derivado de esos vol_times;
//  - al menos un slot con un solo radar aportando, para que el overlay de
//    cobertura tenga el caso "mosaico parcial" en modo fixture.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import proj4 from 'proj4'

const root = process.cwd()
const fixturesDir = join(root, 'server/dal/fixtures')

const radars = JSON.parse(readFileSync(join(fixturesDir, 'radars.json'), 'utf8'))
const rasters = JSON.parse(readFileSync(join(fixturesDir, 'rasters.json'), 'utf8'))

const DOMAIN_ID = 'GULF'
const PRODUCT = 153
const SLOT_S = 300
const TOLERANCE_S = 150
const CELL_M = 1000
// Calibración canónica de N0B (ingest/mosaic/calibration.py): nivel 2 = −32 dBZ.
const VALUE_SCALE = 0.5
const VALUE_OFFSET = -33
const METHOD = 'weighted'

const source = rasters.filter(r => r.product_code === PRODUCT)
if (!source.length) {
  console.error(`fixtures insuficientes: no hay rasters grabados del producto ${PRODUCT}`)
  process.exit(1)
}

const conRasters = [...new Set(source.map(r => r.site_id))].sort()
const radiusM = Math.max(...source.map(r => (r.width * r.cell_m) / 2))

// Un dominio solo tiene sentido entre radares cuyas coberturas se tocan: el
// criterio es físico, no una lista de nombres. Se toma el grupo más grande
// de sitios a menos de 2·radio entre sí — eso deja fuera a los aislados
// (hoy JUA, a ~1400 km del resto) igual que en producción.
const km = (a, b) => {
  const R = 6371
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const filaDe = id => radars.find(r => r.site_id === id)
const grupos = conRasters.map(id => conRasters.filter(
  otro => km(filaDe(id), filaDe(otro)) <= (2 * radiusM) / 1000,
))
const siteIds = grupos.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))[0]
const sites = siteIds.map(filaDe)
const aislados = conRasters.filter(id => !siteIds.includes(id))

// --- geometría del dominio (espejo de ingest/mosaic/geometry.py) ---
const lats = sites.map(s => s.lat)
const lons = sites.map(s => s.lon)
const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2
const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2
const proj = `+proj=aeqd +lat_0=${lat0} +lon_0=${lon0} +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`
const xy = sites.map(s => proj4('EPSG:4326', proj, [s.lon, s.lat]))
const evenCeil = (v) => {
  const n = Math.ceil(v)
  return n + (n % 2)
}
const halfX = Math.max(...xy.map(([x]) => Math.abs(x))) + radiusM
const halfY = Math.max(...xy.map(([, y]) => Math.abs(y))) + radiusM
const width = evenCeil((2 * halfX) / CELL_M)
const height = evenCeil((2 * halfY) / CELL_M)
if (Math.max(width, height) > 4096) {
  console.error(`malla ${width}x${height} supera el cap de textura 4096`)
  process.exit(1)
}

// --- slots ---
const epochS = iso => Date.parse(`${iso}Z`) / 1000
const isoOf = s => new Date(s * 1000).toISOString().slice(0, 19)
const slotStart = s => s - (s % SLOT_S)

const slots = [...new Set(source.map(r => slotStart(epochS(r.vol_time))))].sort((a, b) => a - b)

const pad = n => String(n).padStart(2, '0')
const r2KeyFor = (slot) => {
  const d = new Date(slot * 1000)
  const [y, m, day] = [d.getUTCFullYear(), pad(d.getUTCMonth() + 1), pad(d.getUTCDate())]
  const stamp = `${y}${m}${day}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  return `mosaic/${DOMAIN_ID}/N0B/${y}/${m}/${day}/${DOMAIN_ID}_N0B_${stamp}.tif`
}

// Las grabaciones son demasiado regulares: los cuatro slots que cubren tienen
// a los dos radares dentro de tolerancia, así que no hay ningún mosaico
// parcial. Se omite deliberadamente el último sitio en el segundo slot para
// que el overlay de cobertura tenga su caso "falta un radar" en modo fixture
// — mismo criterio que los cubos de 0 strikes de make-lightning-fixture.mjs.
const SLOT_PARCIAL = 1

const rows = []
let soloUno = false
for (const [indice, slot] of slots.entries()) {
  const center = slot + SLOT_S / 2
  const contributing = []
  for (const site of siteIds) {
    const candidatos = source
      .filter(r => r.site_id === site)
      .map(r => ({ vol_time: r.vol_time, lag: epochS(r.vol_time) - center }))
      .filter(c => Math.abs(c.lag) <= TOLERANCE_S)
      .sort((a, b) => Math.abs(a.lag) - Math.abs(b.lag) || b.vol_time.localeCompare(a.vol_time))
    if (candidatos[0]) {
      contributing.push({
        site,
        vol_time: candidatos[0].vol_time,
        lag_s: Math.round(candidatos[0].lag),
      })
    }
  }
  if (indice === SLOT_PARCIAL && contributing.length > 1) contributing.pop()
  if (!contributing.length) continue
  if (contributing.length < siteIds.length) soloUno = true
  rows.push({
    domain_id: DOMAIN_ID,
    product_code: PRODUCT,
    slot_time: isoOf(slot),
    slot_s: SLOT_S,
    r2_key: r2KeyFor(slot),
    size_bytes: 180_000 + contributing.length * 1000,
    value_scale: VALUE_SCALE,
    value_offset: VALUE_OFFSET,
    max_level: 184,
    proj4: proj,
    width,
    height,
    cell_m: CELL_M,
    method: METHOD,
    contributing: JSON.stringify(contributing),
    created_at: isoOf(slot + SLOT_S + 120),
  })
}

if (!soloUno) {
  console.error('fixture sin ningún slot parcial: el overlay de cobertura se quedaría sin caso')
  process.exit(1)
}

const domains = [{
  domain_id: DOMAIN_ID,
  name: DOMAIN_ID,
  proj4: proj,
  width,
  height,
  cell_m: CELL_M,
  radius_m: radiusM,
  created_at: rows[0].created_at,
  updated_at: rows.at(-1).created_at,
}]
const domainSites = siteIds.map(site_id => ({ domain_id: DOMAIN_ID, site_id }))

const write = (name, data) =>
  writeFileSync(join(fixturesDir, name), `${JSON.stringify(data, null, 2)}\n`)
write('mosaic-domains.json', domains)
write('mosaic-domain-sites.json', domainSites)
write('mosaic-rasters.json', rows)

const parciales = rows.filter(r => JSON.parse(r.contributing).length < siteIds.length).length
console.log(
  `mosaico: dominio ${DOMAIN_ID} ${width}x${height} @ ${CELL_M} m, `
  + `${siteIds.length} sitios (${siteIds.join(',')}), ${rows.length} slots `
  + `(${parciales} parciales)`
  + (aislados.length ? `; fuera por aislamiento: ${aislados.join(',')}` : ''),
)
