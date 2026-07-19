#!/usr/bin/env node
// Genera el fixture SINTÉTICO de rayos (server/dal/fixtures/lightning.json)
// y sus ficheros de strikes golden en tests/fixtures/cogs/r2/<r2_key> — el
// pipeline aún no ingiere GLM; cuando lo haga, esto se reemplaza por
// grabaciones reales (scripts/record-fixtures.sh) y los tests siguen
// pasando porque las expectativas se derivan del fixture
// (tests/helpers/derive.ts).
//
// Diseño data-driven sobre las grabaciones existentes (radar-agnóstico):
//  - sitio "joined": el que tiene meso + raster (caso e2e BYX hoy) — cubos
//    de 300 s continuos cubriendo sus vol_times, con un vecino en el día
//    anterior a <900 s de medianoche (ejercita el padding del índice) y
//    cubos de 0 strikes intercalados (fila con r2_key NULL), nunca sobre
//    la ventana de un volumen con meso (el caso e2e necesita strikes).
//  - siguiente sitio con rasters: cubos solo a +3 h del último vol_time →
//    índice no vacío pero ninguna ventana de observación los toca.
//  - resto: sin filas → índice vacío.
//
// Strikes deterministas (mulberry32): clúster alrededor de las celdas
// grabadas del sitio (fallback: el radar), offsets ascendentes en [0, 300).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()
const fixturesDir = join(root, 'server/dal/fixtures')
const r2Dir = join(root, 'tests/fixtures/cogs/r2')

const radars = JSON.parse(readFileSync(join(fixturesDir, 'radars.json'), 'utf8'))
const rasters = JSON.parse(readFileSync(join(fixturesDir, 'rasters.json'), 'utf8'))
const phenomena = JSON.parse(readFileSync(join(fixturesDir, 'phenomena.json'), 'utf8'))

const sitesWithRasters = [...new Set(rasters.map(r => r.site_id))].sort()
const sitesWithMeso = new Set(phenomena.filter(p => p.kind === 'meso').map(p => p.site_id))
const joinedSite = sitesWithRasters.find(s => sitesWithMeso.has(s)) ?? sitesWithRasters[0]
const staleSite = sitesWithRasters.find(s => s !== joinedSite) ?? null
if (!joinedSite) {
  console.error('fixtures insuficientes: no hay rasters grabados')
  process.exit(1)
}

const BUCKET_S = 300
const WINDOW_FALLBACK_S = 600

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const epoch = iso => Date.parse(`${iso}Z`)
const toIso = ms => new Date(ms).toISOString().slice(0, 19)
const floorBucket = ms => Math.floor(ms / (BUCKET_S * 1000)) * BUCKET_S * 1000
const round = (v, dec) => Math.round(v * 10 ** dec) / 10 ** dec

function r2Key(site, bucketStart) {
  const d = bucketStart.slice(0, 10).replaceAll('-', '')
  const hms = bucketStart.slice(11).replaceAll(':', '')
  const [y, m, day] = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)]
  return `${site}/LIGHTNING/${y}/${m}/${day}/${site}_LTG_${d}_${hms}.json`
}

/** Cubos objetivo por sitio según el rol (ver cabecera). */
function bucketStartsFor(site) {
  const vols = rasters.filter(r => r.site_id === site).map(r => r.vol_time).sort()
  if (site === joinedSite) {
    const from = floorBucket(epoch(vols[0]) - WINDOW_FALLBACK_S * 1000)
    const to = floorBucket(epoch(vols.at(-1)))
    const starts = []
    for (let t = from; t <= to; t += BUCKET_S * 1000) starts.push(toIso(t))
    // vecino en el día anterior, a <900 s de medianoche — ejercita el padding
    const dayStart = `${vols[0].slice(0, 10)}T00:00:00`
    const neighbor = toIso(epoch(dayStart) - BUCKET_S * 1000)
    if (!starts.includes(neighbor) && neighbor.slice(0, 10) !== vols[0].slice(0, 10)) {
      starts.unshift(neighbor)
    }
    return starts
  }
  if (site === staleSite) {
    // índice no vacío pero a >600 s de cualquier raster → ninguna ventana los toca
    const from = floorBucket(epoch(vols.at(-1)) + 3 * 3_600_000)
    return [0, 1, 2].map(i => toIso(from + i * BUCKET_S * 1000))
  }
  return []
}

/** Ventanas de observación de volúmenes CON meso — esos cubos nunca van vacíos. */
const mesoWindows = (() => {
  const mesoVols = [...new Set(
    phenomena.filter(p => p.kind === 'meso' && p.site_id === joinedSite).map(p => p.vol_time),
  )]
  return mesoVols.map(v => [epoch(v) - WINDOW_FALLBACK_S * 1000, epoch(v)])
})()

const overlapsMeso = (startMs, endMs) =>
  mesoWindows.some(([a, b]) => startMs < b && endMs > a)

/** Centros de clúster: celdas grabadas del sitio; fallback el radar. */
function clusterCenters(site) {
  const cells = phenomena.filter(p => p.site_id === site && p.lat != null && p.lon != null)
  if (cells.length > 0) return cells.map(c => [c.lon, c.lat])
  const radar = radars.find(r => r.site_id === site)
  return [[radar.lon, radar.lat]]
}

function strikesFor(site, bucketStart, rng) {
  const centers = clusterCenters(site)
  const n = 5 + Math.floor(rng() * 35)
  const strikes = []
  for (let i = 0; i < n; i++) {
    const [lon, lat] = centers[Math.floor(rng() * centers.length)]
    strikes.push([
      round(lon + (rng() - 0.5) * 0.3, 3),
      round(lat + (rng() - 0.5) * 0.3, 3),
      round(rng() * BUCKET_S, 1),
    ])
  }
  return strikes.sort((a, b) => a[2] - b[2])
}

const rows = []
let files = 0
for (const radar of radars) {
  const starts = bucketStartsFor(radar.site_id)
  const rng = mulberry32(0xBEEF ^ radar.site_id.charCodeAt(0))
  starts.forEach((bucketStart, i) => {
    const startMs = epoch(bucketStart)
    // vacíos intercalados (fila con r2_key NULL) — nunca el vecino de
    // padding (i=0, debe ejercitar el fetch cross-día) ni ventanas meso
    const empty = i % 4 === 1 && i > 0 && !overlapsMeso(startMs, startMs + BUCKET_S * 1000)
    const strikes = empty ? [] : strikesFor(radar.site_id, bucketStart, rng)
    let key = null
    let size = null
    if (strikes.length > 0) {
      key = r2Key(radar.site_id, bucketStart)
      const body = JSON.stringify({
        site: radar.site_id,
        bucket_start: bucketStart,
        bucket_s: BUCKET_S,
        strikes,
      })
      const path = join(r2Dir, key)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, body)
      size = Buffer.byteLength(body)
      files++
    }
    rows.push({
      site_id: radar.site_id,
      bucket_start: bucketStart,
      bucket_s: BUCKET_S,
      strike_count: strikes.length,
      r2_key: key,
      size_bytes: size,
      source: 'glm-goes19',
      created_at: toIso(startMs + (BUCKET_S + 90) * 1000), // determinista: cierre + 90 s
    })
  })
}

rows.sort((a, b) =>
  a.site_id.localeCompare(b.site_id) || a.bucket_start.localeCompare(b.bucket_start))
writeFileSync(join(fixturesDir, 'lightning.json'), `${JSON.stringify(rows, null, 2)}\n`)
const empties = rows.filter(r => r.strike_count === 0).length
console.log(
  `lightning.json: ${rows.length} filas (joined=${joinedSite}, stale=${staleSite ?? '—'}, `
  + `${empties} cubos vacíos), ${files} ficheros de strikes en tests/fixtures/cogs/r2/`,
)
