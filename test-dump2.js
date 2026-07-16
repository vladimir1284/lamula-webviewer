import { chromium } from '@playwright/test';
import * as fs from 'fs';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:3000/AMX/153/20260711T031152');
  await page.waitForLoadState('networkidle');
  fs.writeFileSync('browser.html', await page.content());
  await browser.close();
})();
