import { expect, test } from '@playwright/test'

test('el shell renderiza servido por el runtime de Pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LAMULA WebViewer' })).toBeVisible()
})

test('la lista de radares se puebla desde el DAL (modo fixture)', async ({ page }) => {
  await page.goto('/')
  const list = page.getByTestId('radars-list')
  await expect(list).toBeVisible()
  await expect(list).toContainText('KAMX')
  await expect(list).toContainText('TJUA')
})
