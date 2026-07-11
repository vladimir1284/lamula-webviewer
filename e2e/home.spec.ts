import { expect, test } from '@playwright/test'

test('el shell renderiza servido por el runtime de Pages', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LAMULA WebViewer' })).toBeVisible()
})

test('la sección de radares muestra un estado explícito, nunca revienta', async ({ page }) => {
  await page.goto('/')
  const section = page.getByTestId('radars')
  await expect(section).toBeVisible()
  // Con binding D1 real: lista o vacío. Sin binding (CI local): error explícito.
  await expect(
    section.locator(
      '[data-testid="radars-list"], [data-testid="radars-empty"], [data-testid="radars-error"]',
    ),
  ).toBeVisible()
})
