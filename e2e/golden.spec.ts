// Goldens visuales (puerta M2): COG golden commiteado + paleta → render
// esperado. Corre 100 % offline: el DAL sirve fixtures y los COGs salen de
// tests/fixtures/cogs/r2/ vía scripts/serve-cogs.mjs (ver playwright.config).
// La base OSM va apagada (?base=off): fondo determinista, el golden compara
// solo raster + cobertura.
//
// DESACTIVADOS por defecto (gate GOLDENS=1 en playwright.config.ts) mientras
// la UI está en flujo — cada cambio de layout invalidaba los 10 baselines.
// Correr a demanda antes de tocar paletas/render: GOLDENS=1 pnpm test:e2e
//
// Regenerar tras re-grabar fixtures/COGs o cambiar una paleta:
//   GOLDENS=1 pnpm exec playwright test e2e/golden.spec.ts --update-snapshots --no-deps
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { isoToPath } from '../shared/url/time-path'
import { mesoVolume, products, rasters } from '../tests/helpers/derive'

const mnemonicOf = new Map(products.map(p => [p.code, p.mnemonic]))

// Filas que /api/rasters/closest?t=ahora devuelve por (site, product): la más
// reciente de cada serie — exactamente las que scripts descargó como golden.
const goldenRows = (() => {
  const best = new Map<string, (typeof rasters)[number]>()
  for (const r of rasters) {
    const k = `${r.site_id}|${r.product_code}`
    const prev = best.get(k)
    if (!prev || r.vol_time > prev.vol_time) best.set(k, r)
  }
  return [...best.values()]
    .filter(r => existsSync(join(process.cwd(), 'tests/fixtures/cogs/r2', r.r2_key)))
    .sort((a, b) => a.site_id.localeCompare(b.site_id) || a.product_code - b.product_code)
})()

test.describe('goldens visuales', () => {
  test('hay COGs golden para los 7 productos raster', () => {
    const codes = new Set(goldenRows.map(r => r.product_code))
    expect([...codes].sort((a, b) => a - b)).toEqual([134, 135, 153, 154, 170, 172, 173])
  })

  for (const row of goldenRows) {
    const mnemonic = mnemonicOf.get(row.product_code) ?? row.product_code
    test(`${row.site_id} ${mnemonic} renderiza igual al golden`, async ({ page }) => {
      // deep link directo al frame (F3): determinista y valida la ruta de paso
      await page.goto(
        `/${row.site_id}/${row.product_code}/${isoToPath(row.vol_time)}?base=off`,
      )

      const map = page.getByTestId('radar-map')
      // rendercomplete de OL: tiles del COG cargados y dibujados
      await expect(map).toHaveAttribute('data-raster-loaded', 'true', { timeout: 30_000 })
      // tras el primer rendercomplete queda una pasada más (overview →
      // resolución final, ~600 ms); el render final es bit-idéntico entre
      // corridas, así que un settle fijo lo captura determinista
      await page.waitForTimeout(1500)

      await expect(map).toHaveScreenshot(`${row.site_id}-${mnemonic}.png`, {
        maxDiffPixelRatio: 0.01,
      })
    })
  }

  // F4: overlay de fenómenos sobre el volumen con mesociclones (celdas +
  // tracks + meso/TVS). Vectorial puro sobre base apagada — determinista.
  // Los goldens sin ?layers quedan intactos (default off).
  test('overlay de fenómenos renderiza igual al golden', async ({ page }) => {
    const row = rasters.find(
      r => r.site_id === mesoVolume.site
        && r.vol_time === mesoVolume.volTime
        && existsSync(join(process.cwd(), 'tests/fixtures/cogs/r2', r.r2_key)),
    )
    test.skip(!row, 'el volumen con meso no tiene COG golden commiteado')

    await page.goto(
      `/${row!.site_id}/${row!.product_code}/${isoToPath(row!.vol_time)}?base=off&layers=cells,meso`,
    )
    const map = page.getByTestId('radar-map')
    await expect(map).toHaveAttribute('data-raster-loaded', 'true', { timeout: 30_000 })
    // además del settle del raster, las features llegan tras el fetch de
    // fenómenos del cliente — esperar a que la capa vectorial tenga algo
    await page.waitForTimeout(1500)

    // guard anti-baseline-vacío: los markers deben estar PINTADOS en el
    // canvas de la capa vectorial (la última 2D de .ol-layers) antes del
    // screenshot — un `--update-snapshots` sobre un overlay roto pasaba en
    // silencio (el baseline vacío de 78f8f20 se horneó así)
    await expect.poll(async () => page.evaluate(() => {
      const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.ol-layers canvas')]
      const last = canvases[canvases.length - 1]
      const ctx = last?.getContext('2d')
      if (!ctx) return -1
      const data = ctx.getImageData(0, 0, last!.width, last!.height).data
      let n = 0
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++
      return n
    }), { timeout: 10_000 }).toBeGreaterThan(1000)

    await expect(map).toHaveScreenshot(`${row!.site_id}-overlay.png`, {
      maxDiffPixelRatio: 0.01,
    })
  })
})
