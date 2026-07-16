import { chromium } from '@playwright/test';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  await page.goto('http://localhost:3000/AMX/153/20260711T031152');
  await page.waitForLoadState('networkidle');
  console.log('Hydrated. Let\'s see if anim-play exists:');
  const count = await page.locator('[data-testid="anim-play"]').count();
  console.log('anim-play count:', count);
  console.log('HTML:', await page.content());
  await browser.close();
})();
