// Rutas del DAL sobre el runtime real de Pages (workerd) en modo fixture:
// mismas grabaciones que la suite unitaria, servidas end-to-end. Las
// expectativas se derivan de las fixtures (tests/helpers/derive.ts).
import { expect, test } from '@playwright/test'
import {
  phenVolume,
  series,
  shiftIso,
  siteIds,
  trackedCell,
  vwpVolume,
} from '../tests/helpers/derive'

test('/api/radars responde el catálogo grabado', async ({ request }) => {
  const res = await request.get('/api/radars')
  expect(res.status()).toBe(200)
  const radars = await res.json()
  expect(radars.map((r: { site_id: string }) => r.site_id)).toEqual(siteIds)
  expect(radars[0].proj4).toContain('+proj=aeqd')
})

test('/api/products responde los descriptores', async ({ request }) => {
  const products = await (await request.get('/api/products')).json()
  expect(products.length).toBeGreaterThanOrEqual(10)
})

test('/api/rasters/times lista los vol_times del día', async ({ request }) => {
  const res = await request.get(
    `/api/rasters/times?site=${series.site}&product=${series.product}&day=${series.day}`,
  )
  expect(await res.json()).toEqual(series.times)
})

test('/api/rasters/closest resuelve el volumen más cercano', async ({ request }) => {
  const t = shiftIso(series.times[1]!, -1)
  const res = await request.get(
    `/api/rasters/closest?site=${series.site}&product=${series.product}&t=${t}`,
  )
  expect(res.status()).toBe(200)
  const raster = await res.json()
  expect(raster.vol_time).toBe(series.times[1])
  expect(raster.r2_key).toBe(series.rows[1]!.r2_key)
})

test('/api/rasters/next en el borde → 404 explícito', async ({ request }) => {
  const res = await request.get(
    `/api/rasters/next?site=${series.site}&product=${series.product}&t=${series.times.at(-1)}`,
  )
  expect(res.status()).toBe(404)
})

test('/api/phenomena devuelve el overlay del volumen con attrs parseado', async ({ request }) => {
  const res = await request.get(
    `/api/phenomena?site=${phenVolume.site}&vol_time=${phenVolume.volTime}`,
  )
  const rows = await res.json()
  expect(rows).toHaveLength(phenVolume.rows.length)
  expect(typeof rows[0].attrs).toBe('object')
})

test('/api/phenomena/series devuelve la serie por cell_id', async ({ request }) => {
  const res = await request.get(
    `/api/phenomena/series?site=${trackedCell.site}&cell_id=${trackedCell.cellId}`,
  )
  const serie = await res.json()
  expect(new Set(serie.map((p: { vol_time: string }) => p.vol_time)).size).toBe(trackedCell.volumes)
})

test('/api/vwp devuelve el perfil por altura', async ({ request }) => {
  const res = await request.get(
    `/api/vwp?site=${vwpVolume.site}&vol_time=${vwpVolume.volTime}`,
  )
  const levels = await res.json()
  expect(levels).toHaveLength(vwpVolume.rows.length)
})

test('/api/health reporta frescura por radar', async ({ request }) => {
  const res = await request.get('/api/health')
  const health = await res.json()
  expect(health.radars).toHaveLength(siteIds.length)
  expect(typeof health.radars[0].minutes_since_last_scan).toBe('number')
})

test('parámetros inválidos → 400 con detalle, no 500', async ({ request }) => {
  const res = await request.get('/api/rasters/closest?site=miami&product=153&t=ayer')
  expect(res.status()).toBe(400)
})
