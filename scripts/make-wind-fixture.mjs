#!/usr/bin/env node
// Genera el fixture SINTÉTICO de viento GFS (server/dal/fixtures/wind.json)
// y sus ficheros u/v golden en tests/fixtures/cogs/r2/<r2_key> — el pipeline
// aún no ingiere viento; cuando lo haga, esto se reemplaza por grabaciones
// reales (scripts/record-fixtures.sh) y los tests siguen pasando porque las
// expectativas se derivan del fixture (tests/helpers/derive.ts).
//
// Diseño data-driven sobre las grabaciones existentes (radar-agnóstico):
//  - sitio "joined": el que tiene meso + raster (caso e2e BYX hoy) — viento
//    horario cubriendo sus vol_times, más un vecino a las 23:00 del día
//    anterior (ejercita el padding ±2 h del índice).
//  - siguiente sitio con rasters: viento solo a +3/+4 h del último vol_time
//    → índice no vacío pero join fuera de tolerancia (capa limpia).
//  - resto: sin filas → índice vacío.
//
// Campo analítico (verificable a ojo y por asserts exactos en unit tests):
// flujo medio rotado por hora + vórtice de cuerpo sólido centrado en el radar.
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

const GRID_DEG = 0.25
const HALF_DEG = 6

/** bbox ±6° expandido hacia fuera a múltiplos de la grilla GFS. */
function domain(radar) {
  const snap = (v, up) => (up ? Math.ceil(v / GRID_DEG) : Math.floor(v / GRID_DEG)) * GRID_DEG
  const la1 = snap(radar.lat + HALF_DEG, true) // norte
  const laS = snap(radar.lat - HALF_DEG, false)
  const lo1 = snap(radar.lon - HALF_DEG, false) // oeste
  const loE = snap(radar.lon + HALF_DEG, true)
  return {
    la1,
    lo1,
    nx: Math.round((loE - lo1) / GRID_DEG) + 1,
    ny: Math.round((la1 - laS) / GRID_DEG) + 1,
  }
}

/** Flujo medio (rotado por hora del valid_time) + vórtice centrado en el radar. */
function field(radar, lon, lat, hour) {
  const theta = (hour * 10 * Math.PI) / 180
  const u0 = 3 * Math.cos(theta) - 2 * Math.sin(theta)
  const v0 = 3 * Math.sin(theta) + 2 * Math.cos(theta)
  const dx = lon - radar.lon
  const dy = lat - radar.lat
  const r = Math.hypot(dx, dy)
  const RADIUS = 3 // grados; fuera decae 1/r
  const PEAK = 10 // m/s en el borde del núcleo
  const w = r <= RADIUS ? (PEAK * r) / RADIUS : (PEAK * RADIUS) / Math.max(r, 1e-9)
  const uv = r < 1e-9 ? [0, 0] : [(-dy / r) * w, (dx / r) * w] // antihorario
  return [u0 + uv[0], v0 + uv[1]]
}

const round2 = v => Math.round(v * 100) / 100

function gridFile(radar, validTime, cycleTime, forecastHour) {
  const { la1, lo1, nx, ny } = domain(radar)
  const hour = Number(validTime.slice(11, 13))
  const u = []
  const v = []
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [uu, vv] = field(radar, lo1 + i * GRID_DEG, la1 - j * GRID_DEG, hour)
      u.push(round2(uu))
      v.push(round2(vv))
    }
  }
  return {
    header: {
      nx,
      ny,
      lo1,
      la1,
      dx: GRID_DEG,
      dy: GRID_DEG,
      refTime: `${cycleTime}Z`,
      forecastHour,
    },
    u,
    v,
  }
}

/** Ciclo GFS (00/06/12/18Z) y fh que producirían este valid_time con fh ≤ 12. */
function cycleFor(validTime) {
  const t = new Date(`${validTime}Z`)
  const cycleHour = Math.floor(t.getUTCHours() / 6) * 6
  const cycle = new Date(t)
  cycle.setUTCHours(cycleHour, 0, 0, 0)
  const fh = Math.round((t - cycle) / 3_600_000)
  return { cycleTime: cycle.toISOString().slice(0, 19), forecastHour: fh }
}

function r2Key(site, validTime, cycleTime, forecastHour) {
  const d = validTime.slice(0, 10).replaceAll('-', '')
  const hms = validTime.slice(11).replaceAll(':', '')
  const c = cycleTime.slice(0, 13).replaceAll('-', '').replace('T', '')
  const fff = String(forecastHour).padStart(3, '0')
  const [y, m, day] = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)]
  return `${site}/WIND/${y}/${m}/${day}/${site}_WIND_${d}_${hms}_c${c}f${fff}.json`
}

const shiftHours = (iso, h) =>
  new Date(Date.parse(`${iso}Z`) + h * 3_600_000).toISOString().slice(0, 19)

/** valid_times sintéticos por sitio según el rol (ver cabecera). */
function validTimesFor(site) {
  const vols = rasters.filter(r => r.site_id === site).map(r => r.vol_time).sort()
  const floorHour = iso => `${iso.slice(0, 13)}:00:00`
  if (site === joinedSite) {
    const from = floorHour(vols[0])
    const times = []
    for (let t = shiftHours(from, -1); t <= shiftHours(vols.at(-1), 1); t = shiftHours(t, 1)) {
      times.push(t)
    }
    // vecino en el día anterior, a <2 h del borde — ejercita el padding
    times.unshift(`${shiftHours(from, -24).slice(0, 10)}T23:00:00`)
    return times
  }
  if (site === staleSite) {
    // índice no vacío pero todo a >1 h de cualquier raster → join siempre falla
    const last = floorHour(vols.at(-1))
    return [shiftHours(last, 3), shiftHours(last, 4)]
  }
  return []
}

const rows = []
let files = 0
for (const radar of radars) {
  for (const validTime of validTimesFor(radar.site_id)) {
    const { cycleTime, forecastHour } = cycleFor(validTime)
    const key = r2Key(radar.site_id, validTime, cycleTime, forecastHour)
    const file = gridFile(radar, validTime, cycleTime, forecastHour)
    const body = JSON.stringify(file)
    const path = join(r2Dir, key)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body)
    files++
    rows.push({
      site_id: radar.site_id,
      valid_time: validTime,
      // '10m' es el único nivel ingerido en producción (0005_wind_levels.sql,
      // rollout de 850/700/500 hPa pendiente) — el fixture sigue sintético
      level: '10m',
      cycle_time: cycleTime,
      forecast_hour: forecastHour,
      model: 'gfs0p25',
      r2_key: key,
      size_bytes: Buffer.byteLength(body),
      created_at: shiftHours(validTime, 0), // determinista
    })
  }
}

rows.sort((a, b) => a.site_id.localeCompare(b.site_id) || a.valid_time.localeCompare(b.valid_time))
writeFileSync(join(fixturesDir, 'wind.json'), `${JSON.stringify(rows, null, 2)}\n`)
console.log(
  `wind.json: ${rows.length} filas (joined=${joinedSite}, stale=${staleSite ?? '—'}), ${files} ficheros u/v en tests/fixtures/cogs/r2/`,
)
