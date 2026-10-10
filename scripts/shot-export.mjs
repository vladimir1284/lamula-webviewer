#!/usr/bin/env node
// Genera muestras del exportador (F7.1 y F7.3, decisiones 40 y 42) para
// inspección
// humana: el mapa real con sus capas, en los dos modos de chrome. No es un
// test — no asserta nada; existe porque la franja y la leyenda del export
// sólo se validan mirándolas, y reconstruir el montaje a mano cada vez es
// caro (dos servidores, deep link con meso+raster, menú, diálogo).
//
//   pnpm build && node scripts/shot-export.mjs [directorio-salida]
//
// Levanta los COGs golden (scripts/serve-cogs.mjs) y el server Nuxt en modo
// fixture, calcula el deep link al volumen con más mesociclones que además
// tiene raster (hoy BYX 03:08:18), enciende celdas/meso/viento/rayos y
// descarga el PNG en modo franja y en modo superpuesto, y un GIF del bucle
// de rayos (lo único que valida que el bucle empalma sin costura es verlo).
//
// Zona horaria fijada a America/New_York: la hora del chrome se formatea en
// local, y sin esto la muestra cambia según la máquina.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'

const ROOT = process.cwd()
const OUT = resolve(ROOT, process.argv[2] ?? 'test-results/export-samples')
const COGS_PORT = 8790
const APP_PORT = 8788

const fixture = name => JSON.parse(readFileSync(join(ROOT, 'server/dal/fixtures', `${name}.json`), 'utf8'))

// Mismo criterio que tests/helpers/derive.ts (mesoVolume): el volumen más
// rico del fixture, nunca un sitio/hora hardcodeados.
function deepLinkPath() {
  const rasters = fixture('rasters')
  const withRaster = new Set(rasters.map(r => `${r.site_id}|${r.vol_time}`))
  const mesoByVolume = new Map()
  for (const p of fixture('phenomena')) {
    if (p.kind !== 'meso') continue
    const key = `${p.site_id}|${p.vol_time}`
    mesoByVolume.set(key, (mesoByVolume.get(key) ?? 0) + 1)
  }
  const best = [...mesoByVolume.entries()]
    .filter(([key]) => withRaster.has(key))
    .sort((a, b) => b[1] - a[1])[0]
  if (!best) throw new Error('fixtures insuficientes: ningún volumen tiene meso Y raster')
  const [site, volTime] = best[0].split('|')
  const row = rasters.find(r => r.site_id === site && r.vol_time === volTime)
  return `/${site}/${row.product_code}/${volTime.replace(/[-:]/g, '')}`
}

const children = []
function serve(args, env) {
  children.push(spawn('node', args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore' }))
}

async function waitUp(url) {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url)
      return
    }
    catch {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  throw new Error(`no levantó: ${url}`)
}

const path = deepLinkPath()
console.log('deep link:', path)
mkdirSync(OUT, { recursive: true })

serve(['scripts/serve-cogs.mjs', String(COGS_PORT)])
serve(['.output/server/index.mjs'], {
  PORT: String(APP_PORT),
  HOST: '127.0.0.1',
  NUXT_DAL_ADAPTER: 'fixture',
  NUXT_PUBLIC_R2_BASE_URL: `http://127.0.0.1:${COGS_PORT}`,
})

let browser
try {
  await waitUp(`http://127.0.0.1:${COGS_PORT}`)
  await waitUp(`http://127.0.0.1:${APP_PORT}`)

  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    timezoneId: 'America/New_York',
    acceptDownloads: true,
  })
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${APP_PORT}${path}?base=osm&layers=cells,meso,wind,lightning`)
  await page.waitForSelector('[data-testid="radar-map"][data-raster-loaded="true"]', { timeout: 60_000 })
  await page.waitForLoadState('networkidle')
  // Las partículas del viento y el bucle de rayos necesitan unos ciclos para
  // tener algo que mostrar; sin esto el PNG sale con esas dos capas vacías.
  await page.waitForTimeout(2500)

  // Click único tras networkidle: el botón tiene efecto (carrera de
  // hidratación SSR — ver CLAUDE.md), reintentar lo abriría y cerraría.
  await page.getByTestId('layers-menu-toggle').click()
  await page.getByTestId('export-open').click()

  async function grab(name) {
    await page.waitForSelector('[data-testid="export-download"]:not([disabled])', { timeout: 60_000 })
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-download').click(),
    ])
    await download.saveAs(join(OUT, name))
    console.log('guardado', join(OUT, name))
  }

  await grab('export-franja.png')
  await page.getByTestId('export-chrome-overlay').click()
  await page.waitForTimeout(1500)
  await grab('export-superpuesto.png')

  // GIF del bucle de rayos (F7.3): lo único que valida que el bucle empalma
  // sin costura es verlo dar la vuelta. Vuelve al chrome en franja primero.
  await page.getByTestId('export-chrome-bar').click()
  await page.waitForSelector('[data-testid="export-download"]:not([disabled])', { timeout: 60_000 })
  const [gif] = await Promise.all([
    page.waitForEvent('download', { timeout: 180_000 }),
    page.getByTestId('export-anim-run').click(),
  ])
  await gif.saveAs(join(OUT, 'export-rayos.gif'))
  console.log('guardado', join(OUT, 'export-rayos.gif'))
}
finally {
  await browser?.close()
  for (const child of children) child.kill('SIGTERM')
}
process.exit(0)
