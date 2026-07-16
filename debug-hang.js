import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  await page.goto('http://127.0.0.1:8788/AMX/153/20260711T030349'); // 03:03:49 is the first frame (404)
  await page.waitForLoadState('networkidle');
  console.log('Hydrated, clicking play...');
  await page.click('[data-testid="anim-play"]');
  console.log('Clicked play');
  await page.waitForTimeout(5000);
  console.log('Done');
  await browser.close();
})();
