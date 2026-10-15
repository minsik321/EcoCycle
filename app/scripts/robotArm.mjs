import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText, zoomText } from './textAudit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/robot-arm');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14006/api/v1';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14006', CORS_ORIGINS: 'http://localhost:15206' }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15206', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14006/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');
const pause = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  await Promise.all([mock.ready, app.ready]);
  const login = async role => (await (await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: role, password: `mock-${role}` }) })).json()).accessToken;
  const token = await login('admin');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const get = async route => { const r = await fetch(api + route, { headers }); assert.equal(r.status, 200, route); return r.json(); };
  const post = (body, key = crypto.randomUUID(), auth = headers) => fetch(`${api}/devices/robot-1/commands`, { method: 'POST', headers: { ...auth, 'Idempotency-Key': key }, body: JSON.stringify(body) });
  const finish = async id => {
    for (let i = 0; i < 400; i++) {
      const result = await get(`/commands/${id}`);
      if (result.status !== 'accepted') { assert.equal(result.status, 'completed', JSON.stringify(result)); return; }
      await pause(100);
    }
    throw Error('명령 시간 초과');
  };
  const command = async body => { const r = await post(body); assert.equal(r.status, 202, await r.clone().text()); await finish((await r.json()).commandId); };
  const pinned = { type: 'set_mode', mode: 'auto_pinned', pinnedSectors: ['tank-a1', 'tank-b1'], confirm: true };
  for (const pins of [[], ['tank-a1', 'tank-a1'], ['bad'], null]) assert.equal((await post({ ...pinned, pinnedSectors: pins })).status, 422);
  assert.equal((await post({ ...pinned, confirm: false })).status, 422);
  for (const role of ['operator', 'viewer']) assert.equal((await post(pinned, crypto.randomUUID(), { ...headers, Authorization: `Bearer ${await login(role)}` })).status, 403);
  const key = crypto.randomUUID();
  const accepted = await post(pinned, key); assert.equal(accepted.status, 202);
  const id = (await accepted.json()).commandId;
  assert.equal((await (await post(pinned, key)).json()).commandId, id);
  await finish(id);
  assert.deepEqual((await get('/devices/robot-1/state')).pinnedSectors, pinned.pinnedSectors);
  await command({ ...pinned, pinnedSectors: ['tank-a2'] }); // 같은 모드에서 지정 변경
  const query = () => `/robots/robot-1/picks/records?from=${new Date(Date.now() - 86400000).toISOString()}&to=${new Date(Date.now() + 1000).toISOString()}&page=1&pageSize=10`;
  const after = Date.now();
  let live;
  for (let i = 0; i < 450; i++) {
    live = (await get(query())).items.find(r => Date.parse(r.pickedAt) > after && r.mode === 'auto_pinned' && r.sectorId === 'tank-a2');
    if (live) break;
    await pause(100);
  }
  assert.ok(live, '지정된 섹터에서 실제 자동 사이클 기록');
  assert.ok(live.volumeM3 > 0 && live.batchId && live.conveyorId === 'conveyor-z');
  await command({ type: 'set_mode', mode: 'manual', confirm: true });
  while ((await get('/devices/robot-1/state')).phase !== 'idle') await pause(100);
  await command({ type: 'pick_from', tankId: 'tank-b2', confirm: true });
  assert.equal((await get(query())).items[0].mode, 'manual');
  assert.equal((await get(query())).items[0].sectorId, 'tank-b2');
  await pause(1400);
  assert.equal((await get('/devices/robot-1/state')).phase, 'idle');
  await command({ type: 'set_mode', mode: 'auto', confirm: true });
  assert.deepEqual((await get('/devices/robot-1/state')).pinnedSectors, []);

  browser = await chromium.launch({ executablePath: findChromium() });
  for (const [width, height] of [[390, 844], [820, 1180]]) {
    for (const zoom of [1, 1.3]) {
      if ((await get('/devices/robot-1/state')).mode !== 'auto') await command({ type: 'set_mode', mode: 'auto', confirm: true });
      const context = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      await context.addInitScript(() => localStorage.setItem('ecocycle.homeMode', 'dashboard'));
      const page = await context.newPage();
      await page.goto('http://localhost:15206/login');
      await page.getByLabel('아이디').fill('admin');
      await page.getByLabel('비밀번호').fill('mock-admin');
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      await page.waitForURL(u => u.pathname === '/');
      await page.evaluate(() => { history.pushState({}, '', '/robot'); dispatchEvent(new PopStateEvent('popstate')); });
      const mode = page.getByRole('region', { name: '운전 모드', exact: true });
      const radio = (re) => mode.getByRole('radio').filter({ hasText: re });
      const current = (re) => mode.locator('[role="radio"]').filter({ hasText: re }).filter({ hasText: '지금' });
      const apply = async () => {
        await mode.getByRole('button', { name: '적용', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: '실행', exact: true }).click();
      };
      await current(/^자동(?! ·)/).waitFor();
      await page.getByRole('region', { name: '집기 기록', exact: true }).getByText('불러오는 중…', { exact: true }).waitFor({ state: 'hidden' });
      if (zoom !== 1) await page.evaluate(zoomText, zoom);
      const shot = async (name, target) => {
        if (!(await page.getByRole('dialog').count())) {
          while (await page.getByRole('button', { name: '알림 닫기', exact: true }).count()) await page.getByRole('button', { name: '알림 닫기', exact: true }).first().click();
        }
        if (target) await target.evaluate(el => el.scrollIntoView({ block: 'start' }));
        await pause(200);
        const wrapped = await page.evaluate(findWrappedText);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('table')].some(t => t.getBoundingClientRect().width && t.scrollWidth > t.parentElement.clientWidth + 1));
        await page.screenshot({ path: path.join(out, `${width}x${height}-${zoom}-${name}.png`) });
        if (zoom === 1 && name !== '3-confirm') await page.screenshot({ path: path.join(out, `${width}x${height}-${name}-full.png`), fullPage: true });
        assert.deepEqual({ wrapped, overflow }, { wrapped: [], overflow: false }, name);
      };
      // 운전 모드 세 칸 (자동 | 자동 · 섹터 지정 | 수동): 칸 고르기는 초안, 적용·집기는 확인 단계를 거친다
      await shot('1-auto', mode);
      await radio(/^수동/).click();
      await apply();
      await current(/^수동/).waitFor();
      await shot('2-manual', mode);
      await shot('2-manual-alignment', mode.getByLabel('집을 섹터'));
      await radio(/^자동 · 섹터 지정/).click();
      await mode.getByRole('button', { name: '섹터 A1', exact: true }).click();
      await mode.getByRole('button', { name: '섹터 B1', exact: true }).click();
      await mode.getByRole('button', { name: '적용', exact: true }).click();
      await shot('3-confirm');
      await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
      assert.equal((await get('/devices/robot-1/state')).mode, 'manual');
      await apply();
      await current(/^자동 · 섹터 지정/).waitFor();
      assert.deepEqual((await get('/devices/robot-1/state')).pinnedSectors, ['tank-a1', 'tank-b1']);
      await shot('4-pinned', mode);
      await shot('5-records', page.getByRole('region', { name: '집기 기록', exact: true }));
      await radio(/^자동(?! ·)/).click();
      await apply();
      await current(/^자동(?! ·)/).waitFor();
      assert.deepEqual((await get('/devices/robot-1/state')).pinnedSectors, []);
      await context.close();
    }
  }
  fs.writeFileSync(path.join(out, 'validation.txt'), 'PASS: 390×844, 820×1180; 100%/130%; segmented 3 modes (auto | auto · sector pinned | manual), pins, confirmation/cancel, reset, records; actual pinned/manual cycles, validation 422, permissions 403, idempotency.\n');
  console.log('PASS: robot modes, actual cycles, records, permissions; 2 sizes × 2 text scales.');
} finally { await browser?.close(); app.stop(); mock.stop(); }
