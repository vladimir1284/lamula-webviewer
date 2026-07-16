import { chromium } from '@playwright/test';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err));
  await page.goto('http://localhost:3000/AMX/153/20260711T031152');
  await page.waitForLoadState('networkidle');
  console.log('Done waiting!');
  await browser.close();
})();
