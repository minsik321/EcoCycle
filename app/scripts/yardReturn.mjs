// Browser-only diagnostic: inject controlled feeds without changing application logic.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/studio', process.env.YARD_RETURN_OUT ?? 'yard-return');
fs.mkdirSync(out, { recursive: true });
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '5198', '--strictPort'], root, {}, 'Local:');
let browser;
try {
  await app.ready;
  browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5198/scene-demo?tier=standard&yardprobe=1');
  await page.waitForFunction(() => typeof window.__yardAudit === 'function');
  await page.locator('.st-area-button').click();
  await page.getByRole('option', { name: /출하 마당/ }).click();
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    const { Director } = await import('/src/studio/sim/director.ts');
    const { Yard } = await import('/src/studio/sim/yard.ts');
    const { demoData } = await import('/src/studio/demo/demoData.ts');
    const step = Director.prototype.step;
    const sync = Director.prototype.sync;
    window.__returnProbe = { Director, Yard, step, sync, demoData };
    Director.prototype.step = function () { window.__returnProbe.live = this; };
    Director.prototype.sync = function () {};
  });
  await page.waitForFunction(() => !!window.__returnProbe.live);
  const report = await page.evaluate(() => {
    const { Director, Yard, step, sync, demoData, live } = window.__returnProbe;
    const t0 = Date.parse('2026-10-17T00:00:00Z');
    const feed = (t) => Array.from({ length: Math.floor(t / 20) + 1 }, (_, i) => ({
      id: `probe-${i}`, batchId: `batch-${i}`, stage: 'created',
      stageTimes: { created: new Date(t0 + i * 20000).toISOString() },
      updatedAt: new Date(t0 + i * 20000).toISOString(),
    }));
    const input = (bales) => ({ devices: {}, vehicles: [], batches: [], bales });
    const normal = [60, 300, 600, 1800].map((t) => {
      const d = new Director();
      sync.call(d, input(demoData(t0, t).bales), t0 + t * 1000);
      return { absentSeconds: t, ...d.yard.audit() };
    });
    const thresholds = [168, 328, 468, 488].map((t) => {
      const d = new Director();
      sync.call(d, input(feed(t)), t0 + t * 1000);
      return { secondsSinceFirstBale: t, ...d.yard.audit() };
    });
    live.yard = new Yard();
    live.trucks.forEach((t) => { t.active = false; });
    sync.call(live, input(feed(0)), t0);
    for (let i = 0; i < 100; i++) step.call(live, 0.05);
    sync.call(live, input(feed(600)), t0 + 600000);
    window.__returnProbe.initial = live.yard.audit();
    return { conditions: '20 seconds per bale, no shipping; frames and sync paused from second 5 to 600', normalDemo: normal, thresholds, before: live.yard.audit() };
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, '01-return-floating.png') });
  report.recovery = await page.evaluate(() => {
    const { live, step } = window.__returnProbe;
    let seconds = 0;
    let maxOverlap = 0;
    while (seconds < 120 && live.yard.audit().slotErrors.length) {
      step.call(live, 0.05);
      seconds += 0.05;
      const a = live.yard.audit();
      maxOverlap = Math.max(maxOverlap, a.baleOnBale + a.forkOnBale + a.forkOnFork);
    }
    return { seconds, maxOverlap, ...live.yard.audit() };
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(out, '02-after-placement.png') });
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  app.stop();
}
