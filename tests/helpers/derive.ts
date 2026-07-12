// Deriva de las fixtures GRABADAS los casos que ejercita cada consulta:
// la suite no asume qué radares/tormentas había al grabar, así que
// re-grabar (scripts/record-fixtures.sh) nunca rompe los tests — si las
// grabaciones no dan para una consulta, esto lanza con mensaje claro.
//
// Carga por fs (no import de JSON): lo consumen vitest Y playwright, y el
// loader ESM de node exige import attributes que vitest no necesita.
// Ambos runners corren con cwd = raíz del repo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PhenomenonRow, ProductRow, RadarRow, RasterRow, VwpRow } from '../../shared/contract/types'

type Recorded<T> = T & { created_at: string }

function loadFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'server/dal/fixtures', `${name}.json`), 'utf8'),
  ) as T
}

export const radars = loadFixture<RadarRow[]>('radars')
export const products = loadFixture<ProductRow[]>('products')
export const rasters = loadFixture<Recorded<RasterRow>[]>('rasters')
export const phenomena = loadFixture<Recorded<PhenomenonRow>[]>('phenomena')
export const vwp = loadFixture<Recorded<VwpRow>[]>('vwp')

function fail(msg: string): never {
  throw new Error(`fixtures insuficientes: ${msg} — re-grabar con scripts/record-fixtures.sh`)
}

export const siteIds = radars.map(r => r.site_id).sort()

/** Serie (site, product, día UTC) más larga — para times/closest/next/prev. */
export const series = (() => {
  const groups = new Map<string, Recorded<RasterRow>[]>()
  for (const r of rasters) {
    const key = `${r.site_id}|${r.product_code}|${r.vol_time.slice(0, 10)}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const best = [...groups.values()].sort((a, b) => b.length - a.length)[0]
  if (!best || best.length < 3) fail('se necesita una serie de ≥3 volúmenes en un mismo día UTC')
  const rows = best.sort((a, b) => a.vol_time.localeCompare(b.vol_time))
  return {
    site: rows[0]!.site_id,
    product: rows[0]!.product_code,
    day: rows[0]!.vol_time.slice(0, 10),
    times: rows.map(r => r.vol_time),
    rows,
  }
})()

/** Volumen con más fenómenos — para el overlay del frame. */
export const phenVolume = (() => {
  const groups = new Map<string, Recorded<PhenomenonRow>[]>()
  for (const p of phenomena) {
    const key = `${p.site_id}|${p.vol_time}`
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  const best = [...groups.values()].sort((a, b) => b.length - a.length)[0]
  if (!best) fail('no hay fenómenos grabados')
  return { site: best[0]!.site_id, volTime: best[0]!.vol_time, rows: best }
})()

/** cell_id presente en más volúmenes — para la serie de tendencia. */
export const trackedCell = (() => {
  const groups = new Map<string, Set<string>>()
  for (const p of phenomena) {
    if (!p.cell_id) continue
    const key = `${p.site_id}|${p.cell_id}`
    groups.set(key, (groups.get(key) ?? new Set()).add(p.vol_time))
  }
  const best = [...groups.entries()].sort((a, b) => b[1].size - a[1].size)[0]
  if (!best || best[1].size < 2) fail('ningún cell_id aparece en ≥2 volúmenes (ampliar ventana de phenomena)')
  const [site, cellId] = best[0].split('|') as [string, string]
  return { site, cellId, volumes: best[1].size }
})()

/** Volumen con perfil VWP más rico. */
export const vwpVolume = (() => {
  const groups = new Map<string, Recorded<VwpRow>[]>()
  for (const v of vwp) {
    const key = `${v.site_id}|${v.vol_time}`
    groups.set(key, [...(groups.get(key) ?? []), v])
  }
  const best = [...groups.values()].sort((a, b) => b.length - a.length)[0]
  if (!best) fail('no hay VWP grabado')
  return { site: best[0]!.site_id, volTime: best[0]!.vol_time, rows: best }
})()

/** Instante naive-UTC desplazado n segundos respecto a un vol_time. */
export function shiftIso(iso: string, seconds: number): string {
  return new Date(Date.parse(`${iso}Z`) + seconds * 1000).toISOString().slice(0, 19)
}

/** "Ahora" determinista para health: 5 min después del último scan grabado. */
export const healthNow = new Date(
  Date.parse(`${radars.map(r => r.last_seen_at).sort().at(-1)!}Z`) + 5 * 60_000,
)
