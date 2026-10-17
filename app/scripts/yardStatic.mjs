import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/studio/yard-static');
fs.mkdirSync(out, { recursive: true });
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '5199', '--strictPort'], root, {}, 'Local:');
let browser;
try {
  await app.ready;
  browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5199/scene-demo?tier=standard&yardprobe=1');
  await page.waitForFunction(() => typeof window.__yardAudit === 'function', null, { timeout: 60000 });
  await page.locator('.st-area-button').click();
  await page.getByRole('option', { name: /출하 마당/ }).click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(out, 'three-fixed-bales.png') });
  console.log(JSON.stringify(await page.evaluate(() => window.__yardAudit())));
} finally {
  await browser?.close();
  app.stop();
}
