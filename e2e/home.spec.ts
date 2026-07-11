import { expect, test } from '@playwright/test'
import { radars } from '../tests/helpers/derive'

test('el shell renderiza servido por el runtime de Pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LAMULA WebViewer' })).toBeVisible()
})

test('la lista de radares se puebla desde el DAL (modo fixture)', async ({ page }) => {
  await page.goto('/')
  const list = page.getByTestId('radars-list')
  await expect(list).toBeVisible()
  for (const radar of radars) {
    await expect(list).toContainText(radar.icao ?? radar.site_id)
  }
})
