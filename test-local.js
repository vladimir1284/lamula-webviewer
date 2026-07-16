import { chromium } from '@playwright/test';
import { isoToPath } from './shared/url/time-path.ts';
import { series } from './tests/helpers/derive.ts';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  
  const golden = series.times.at(-1);
  const url = `http://127.0.0.1:3000/${series.site}/${series.product}/${isoToPath(golden)}`;
  console.log('Navigating to', url);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  
  console.log('Clicking play...');
  await page.click('[data-testid="anim-play"]');
  
  for(let i=0; i<20; i++) {
    console.log(await page.textContent('[data-testid="anim-play"]'));
    await page.waitForTimeout(100);
  }
  await browser.close();
})();
