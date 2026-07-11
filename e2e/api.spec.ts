// Rutas del DAL sobre el runtime real de Pages (workerd) en modo fixture:
// mismas respuestas deterministas que la suite unitaria, servidas end-to-end.
import { expect, test } from '@playwright/test'

test('/api/radars responde el catálogo', async ({ request }) => {
  const res = await request.get('/api/radars')
  expect(res.status()).toBe(200)
  const radars = await res.json()
  expect(radars.map((r: { site_id: string }) => r.site_id)).toEqual(['AMX', 'JUA'])
  expect(radars[0].proj4).toContain('+proj=aeqd')
})

test('/api/products responde los descriptores', async ({ request }) => {
  const products = await (await request.get('/api/products')).json()
  expect(products.length).toBeGreaterThanOrEqual(10)
})

test('/api/rasters/times lista los vol_times del día', async ({ request }) => {
  const res = await request.get('/api/rasters/times?site=AMX&product=153&day=2026-07-06')
  const times = await res.json()
  expect(times).toHaveLength(6)
})

test('/api/rasters/closest resuelve el volumen más cercano', async ({ request }) => {
  const res = await request.get('/api/rasters/closest?site=AMX&product=153&t=2026-07-06T15:44:00')
  expect(res.status()).toBe(200)
  const raster = await res.json()
  expect(raster.vol_time).toBe('2026-07-06T15:45:17')
  expect(raster.r2_key).toBe('AMX/N0B/2026/07/06/AMX_N0B_20260706_154517.tif')
})

test('/api/rasters/next en el borde → 404 explícito', async ({ request }) => {
  const res = await request.get('/api/rasters/next?site=AMX&product=153&t=2026-07-06T15:45:17')
  expect(res.status()).toBe(404)
})

test('/api/phenomena devuelve el overlay del volumen con attrs parseado', async ({ request }) => {
  const res = await request.get('/api/phenomena?site=AMX&vol_time=2026-07-06T15:45:17')
  const rows = await res.json()
  expect(rows).toHaveLength(3)
  expect(rows.find((r: { cell_id: string }) => r.cell_id === 'B7').attrs.new).toBe(true)
})

test('/api/phenomena/series devuelve la serie por cell_id', async ({ request }) => {
  const res = await request.get('/api/phenomena/series?site=AMX&cell_id=A0')
  const serie = await res.json()
  expect(serie).toHaveLength(2)
})

test('/api/vwp devuelve el perfil por altura', async ({ request }) => {
  const res = await request.get('/api/vwp?site=AMX&vol_time=2026-07-06T15:45:17')
  const levels = await res.json()
  expect(levels).toHaveLength(8)
  expect(levels[0].height_ft).toBe(1000)
})

test('/api/health reporta frescura por radar', async ({ request }) => {
  const res = await request.get('/api/health')
  const health = await res.json()
  expect(health.radars).toHaveLength(2)
  expect(typeof health.radars[0].minutes_since_last_scan).toBe('number')
})

test('parámetros inválidos → 400 con detalle, no 500', async ({ request }) => {
  const res = await request.get('/api/rasters/closest?site=miami&product=153&t=ayer')
  expect(res.status()).toBe(400)
})
