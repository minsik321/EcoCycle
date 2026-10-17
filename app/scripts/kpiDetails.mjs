// KPI API 계약·두 홈 진입·기간 전환·작은 화면·오류 복구를 실제 브라우저로 확인하고 스크린샷 저장.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText, zoomText } from './textAudit.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/kpi-detail');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14017/api/v1';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14017', CORS_ORIGINS: 'http://localhost:15217' }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15217', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14017/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');
const metrics = [['balesToday', '오늘 생산 베일'], ['averageMoisturePercent', '평균 수분'], ['compressorUptimePercent', '압축기 가동률']];
let browser;
let lastPage;
try {
  await Promise.all([mock.ready, app.ready]);
  const token = (await (await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', password: '1234' }) })).json()).accessToken;
  const headers = { Authorization: `Bearer ${token}` };
  const get = p => fetch(api + p, { headers });
  for (const [metric] of metrics) for (const range of ['today', '7d', '30d']) {
    const r = await get(`/plant/kpi-history?metric=${metric}&range=${range}&timeZone=Asia/Seoul`);
    assert.equal(r.status, 200); const d = await r.json();
    assert.equal(d.metric, metric); assert.equal(d.range, range);
    assert.ok(d.points.length > 0 && d.points.length <= 30);
    if (range !== 'today') assert.equal(d.points.length, range === '7d' ? 7 : 30);
    assert.equal(d.statistics.min, Math.min(...d.points.map(p => p.value)));
    assert.equal(d.statistics.max, Math.max(...d.points.map(p => p.value)));
    assert.ok(d.points.every(p => Date.parse(p.ts) >= Date.parse(d.from) && Date.parse(p.ts) <= Date.parse(d.to)));
    if (metric === 'balesToday') assert.ok(d.points.every(p => Number.isInteger(p.value) && p.value >= 0));
    if (metric === 'balesToday' && range === 'today') assert.equal(d.points.reduce((s, p) => s + p.value, 0), d.statistics.current);
    if (metric === 'compressorUptimePercent') assert.ok(d.points.every(p => p.value >= 0 && p.value <= 100 && p.runningMinutes >= 0 && p.stoppedMinutes >= 0));
    if (metric === 'averageMoisturePercent') assert.deepEqual(d.targetBand, { min: 10, max: 14 });
  }
  for (const query of ['metric=bad&range=today', 'metric=balesToday&range=bad', 'metric=balesToday&range=today&timeZone=bad']) assert.equal((await get(`/plant/kpi-history?${query}`)).status, 422);
  assert.equal((await fetch(`${api}/plant/kpi-history?metric=balesToday&range=30d`)).status, 401);
  // DST가 있는 시간대도 현지 자정부터 집계한다.
  const ny = await (await get('/plant/kpi-history?metric=balesToday&range=30d&timeZone=America/New_York')).json();
  assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ny.from)), '00');
  browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let checked = 0;
  for (const [width, height] of [[360, 780], [390, 844], [820, 1180]]) for (const zoom of [1, 1.3]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await context.addInitScript(() => { localStorage.setItem('ecocycle.homeMode', 'dashboard'); localStorage.setItem('ecocycle.qualityMode', 'low'); localStorage.setItem('ecocycle.qualityChosen', 'true'); });
    const page = await context.newPage();
    lastPage = page;
    page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await page.goto('http://localhost:15217/login');
    await page.getByLabel('아이디').fill('admin'); await page.getByLabel('비밀번호').fill('1234');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL(u => u.pathname === '/');
    if (zoom !== 1) await page.evaluate(zoomText, zoom);
    const audit = async name => {
      await page.waitForTimeout(180);
      const wrapped = await page.evaluate(findWrappedText);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (wrapped.length || overflow) { await page.screenshot({ path: path.join(out, `failure-${width}-${zoom}-${name}.png`) }); throw Error(JSON.stringify({ width, zoom, name, wrapped, overflow })); }
      checked++;
    };
    for (const home of ['dashboard', ...(width !== 360 && zoom === 1 ? ['3d'] : [])]) {
      if (home === '3d') { await page.getByRole('tab', { name: '3D', exact: true }).click(); await page.locator('.st-kpis').waitFor(); }
      for (const [metric, label] of metrics) {
        console.log(`${width}px ${zoom} ${home} ${metric}`);
        const trigger = page.getByRole('button', { name: `${label} 상세 보기`, exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: label, exact: true });
        await dialog.getByText('마지막 갱신', { exact: false }).waitFor();
        for (const [range, tab] of [['today', '오늘'], ['7d', '7일'], ['30d', '30일']]) {
          if (range !== 'today') {
            const response = page.waitForResponse(r => r.url().includes('/plant/kpi-history') && r.url().includes(`range=${range}`));
            await dialog.getByRole('tab', { name: tab, exact: true }).click(); await response;
            await page.waitForFunction(() => document.querySelector('[aria-busy="false"]'));
          }
          await audit(`${home}-${metric}-${range}`);
          if (zoom === 1 && width !== 360 && range === 'today') { await page.mouse.move(0, 0); await page.screenshot({ path: path.join(out, `${width}x${height}-${home}-${metric}.png`) }); }
        }
        await page.keyboard.press('Escape');
        assert.equal(await dialog.count(), 0);
        assert.ok(await trigger.evaluate(el => document.activeElement === el));
      }
    }
    // 실패·재시도 및 연결 끊김에서 현재값 숨김.
    if (width === 390 && zoom === 1) {
      await page.route('**/plant/kpi-history?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: '연결 끊김' } }) }));
      await page.getByRole('button', { name: '평균 수분 상세 보기', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '이력을 불러오지 못했습니다' }).waitFor();
      await page.unroute('**/plant/kpi-history?**');
      await page.getByRole('button', { name: '다시 시도', exact: true }).click();
      await page.getByRole('dialog').getByText('마지막 갱신', { exact: false }).waitFor();
      await context.setOffline(true); await page.waitForTimeout(16500);
      assert.ok((await page.getByRole('dialog').innerText()).includes('연결 끊김'));
      assert.ok((await page.getByRole('dialog').innerText()).includes('–'));
      await context.setOffline(false);
    }
    await context.close();
  }
  const result = `PASS: API 3 metrics × 3 ranges, validation 422/auth 401, timezone; ${checked} browser text checks (360/390/820px, 100/130%); both homes, focus restore, retry, disconnect.\n`;
  fs.writeFileSync(path.join(out, 'validation.txt'), result); console.log(result);
} catch (error) {
  if (lastPage && !lastPage.isClosed()) { console.log((await lastPage.locator('body').innerText()).slice(-4000)); await lastPage.screenshot({ path: path.join(out, 'failure-current.png') }); }
  throw error;
} finally { await browser?.close(); app.stop(); mock.stop(); }
