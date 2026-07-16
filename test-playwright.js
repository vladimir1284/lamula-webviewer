import { chromium, expect } from '@playwright/test';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<div data-testid="test">WRONG</div>');
  try {
    await expect(page.getByTestId('test')).toHaveText('RIGHT', { timeout: 1000 });
  } catch (err) {
    console.log(err.message);
  }
  await browser.close();
})();
