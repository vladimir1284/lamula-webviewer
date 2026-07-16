import { chromium } from '@playwright/test';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000');
  await page.waitForLoadState('networkidle');
  console.log('Hydrated attr:', await page.getAttribute('html', 'data-nuxt-hydrated'));
  await browser.close();
})();
