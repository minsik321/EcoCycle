// 로봇팔 7단위 화면 점검과 스크린샷 (390×844·1440×900):
//   로봇팔 페이지의 운전 모드 세 가지(자동 · 자동 · 섹터 지정 · 수동)와 수동의 "놓기 대기", 집기 기록의 두 단계,
//   섹터 지정 중인 배치의 계획 배합 vs 실제 배합(배치·베일 화면), 3D 홈 로봇 패널의 같은 조작.
//   "적용"이 줄 하나를 차지하지 않는지(태블릿·데스크톱은 세 칸 오른쪽, 폰은 칩 줄·안내 글 오른쪽)도 본다.
//   node app/scripts/robotControls.mjs   (모의 서버·앱을 스스로 띄움, 로컬 Chromium 필요, 결과 docs/screenshots/robot-controls)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText } from './textAudit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/robot-controls');
fs.mkdirSync(out, { recursive: true });
const API_PORT = process.env.ROBOT_SHOT_API_PORT ?? '14007';
const APP_PORT = process.env.ROBOT_SHOT_APP_PORT ?? '15207';
const api = `http://localhost:${API_PORT}/api/v1`;
const origin = `http://localhost:${APP_PORT}`;
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: API_PORT, CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', APP_PORT, '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: `ws://localhost:${API_PORT}/ws/v1/stream`, VITE_USE_MOCK: 'true' }, 'Local:');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  await Promise.all([mock.ready, app.ready]);
  const token = (await (await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', password: '1234' }) })).json()).accessToken;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const get = async (route) => (await fetch(api + route, { headers })).json();
  const command = async (body) => {
    const r = await fetch(`${api}/devices/robot-1/commands`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
    assert.equal(r.status, 202, await r.clone().text());
    const { commandId } = await r.json();
    for (let i = 0; i < 400; i++) {
      const res = await get(`/commands/${commandId}`);
      if (res.status !== 'accepted') return res;
      await pause(100);
    }
    throw Error('명령 시간 초과');
  };
  const robot = () => get('/devices/robot-1/state');
  const waitFor = async (check, what, ms = 90_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = await check(); if (v) return v; await pause(300); }
    throw Error(`${what} 시간 초과`);
  };
  const toAuto = async () => {
    const r = await robot();
    if (r.mode === 'manual' && r.heldSectorId) await command({ type: 'place_on_conveyor', confirm: true });
    if ((await robot()).mode !== 'auto') await command({ type: 'set_mode', mode: 'auto', confirm: true });
  };

  browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const phone = width < 600;
    const size = `${width}x${height}`;
    await toAuto();
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await context.addInitScript(() => { if (!sessionStorage.getItem('shot')) { sessionStorage.setItem('shot', '1'); localStorage.setItem('ecocycle.homeMode', 'dashboard'); } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    await page.goto(`${origin}/login`);
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호').fill('1234');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');
    const go = async (route) => {
      await page.evaluate((r) => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')); }, route);
      await pause(400);
    };
    const closeToasts = async () => {
      while (await page.getByRole('button', { name: '알림 닫기', exact: true }).count()) await page.getByRole('button', { name: '알림 닫기', exact: true }).first().click();
    };
    const shot = async (name, target, { check = true } = {}) => {
      await closeToasts();
      if (target) await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await pause(300);
      await page.screenshot({ path: path.join(out, `${size}-${name}.png`) });
      if (check) {
        const wrapped = await page.evaluate(findWrappedText);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.deepEqual({ wrapped, overflow }, { wrapped: [], overflow: false }, `${size} ${name}`);
      }
      console.log(`✓ ${size} ${name}`);
    };
    const confirm = async () => page.getByRole('dialog').getByRole('button', { name: '실행', exact: true }).click();

    // ── 1. 로봇팔 페이지: 자동 ──
    await go('/robot');
    const mode = page.getByRole('region', { name: '운전 모드', exact: true });
    const radio = (re) => mode.getByRole('radio').filter({ hasText: re });
    const current = (re) => mode.locator('[role="radio"]').filter({ hasText: re }).filter({ hasText: '지금' });
    const apply = mode.getByRole('button', { name: '적용', exact: true });
    await current(/^자동(?! ·)/).waitFor();
    // "적용"은 따로 된 줄이 아니다: 데스크톱은 세 칸 오른쪽, 폰은 안내 글 오른쪽
    const sameRow = async (a, b) => {
      const [ra, rb] = [await a.boundingBox(), await b.boundingBox()];
      return Math.abs(ra.y + ra.height / 2 - (rb.y + rb.height / 2)) < Math.max(ra.height, rb.height) / 2;
    };
    assert.ok(await sameRow(apply, phone ? mode.getByText(/배합 중인 배치의 배합비/) : mode.getByRole('radiogroup')), '적용이 한 줄을 차지합니다');
    assert.ok(await apply.isDisabled(), '바꾼 것이 없으면 적용은 비활성');
    await shot('1-robot-auto', mode);

    // ── 2. 자동 · 섹터 지정 (계획에 없는 섹터를 골라 실제 배합이 계획과 달라지게) ──
    const mixing = await waitFor(async () => (await get('/process/state')).batches.find((b) => b.stage === 'mixing'), '배합 중인 배치');
    const tanks = (await get('/devices')).filter((d) => d.type === 'tank' && d.volumeM3 > 0.5);
    const pin = (tanks.filter((t) => !mixing.mix.some((m) => m.sectorId === t.id)).sort((a, b) => b.volumeM3 - a.volumeM3)[0] ?? tanks[0]).id;
    const pinLabel = pin.replace('tank-', '').toUpperCase();
    await radio(/^자동 · 섹터 지정/).click();
    await mode.getByRole('button', { name: `섹터 ${pinLabel}`, exact: true }).click();
    if (phone) assert.ok(await sameRow(apply, mode.getByRole('button', { name: `섹터 ${pinLabel}` })), '폰: 적용은 섹터 칩 줄의 마지막 칩');
    await shot('2-robot-pinned-draft', mode);
    await apply.click();
    await confirm();
    await current(/^자동 · 섹터 지정/).waitFor();
    await shot('3-robot-pinned', mode);

    // ── 3. 배치: 계획 배합 vs 실제 배합 (서버가 놓은 부피로 계산) ──
    await waitFor(async () => (await get('/process/state')).batches.find((b) => b.stage === 'mixing' && b.actualMix?.some((m) => m.sectorId === pin)), '지정 섹터를 놓은 실제 배합');
    await go('/records/batches');
    const batchCard = page.getByRole('region', { name: '현재 배치', exact: true });
    await batchCard.getByText(/섹터 지정 중/).waitFor({ timeout: 15_000 });
    await batchCard.getByLabel('실제 배합 (놓은 부피 기준)').waitFor();
    await shot('4-batch-plan-vs-actual', batchCard);
    const events = page.getByRole('region', { name: '배치·베일 사건 기록', exact: true }).first();
    await events.getByText(/섹터 지정/).first().waitFor({ state: 'attached', timeout: 15_000 });
    await shot('5-batch-events-pin', events);

    // ── 4. 수동: 빈 손 → 집기 → 놓기 대기 → 놓기 ──
    await go('/robot');
    await radio(/^수동/).click();
    await shot('6-robot-manual-draft', mode);
    await apply.click();
    await confirm();
    await current(/^수동/).waitFor();
    await waitFor(async () => { const r = await robot(); return r.phase === 'idle' && !r.heldSectorId; }, '자동 사이클 끝');
    const status = mode.getByRole('status', { name: '수동 집기 상태' });
    await status.filter({ hasText: '빈 손' }).waitFor();
    assert.ok(await mode.getByRole('button', { name: '컨베이어에 놓기' }).isDisabled(), '들고 있지 않으면 놓기는 비활성');
    await shot('7-robot-manual-empty', mode);
    const fullest = (await get('/devices')).filter((d) => d.type === 'tank').sort((a, b) => b.volumeM3 - a.volumeM3)[0].id;
    await mode.getByLabel('집을 섹터').selectOption(fullest);
    await mode.getByRole('button', { name: '집기', exact: true }).click();
    await confirm();
    await status.filter({ hasText: '놓기 대기' }).waitFor({ timeout: 30_000 });
    assert.ok(await mode.getByRole('button', { name: '집기', exact: true }).isDisabled(), '들고 있는 동안 집기는 비활성');
    assert.ok(await mode.getByRole('button', { name: '컨베이어에 놓기' }).isEnabled(), '들고 있으면 놓기');
    await shot('8-robot-manual-holding', mode);
    await shot('8-robot-manual-holding-page', null);
    await mode.getByRole('button', { name: '컨베이어에 놓기' }).click();
    await confirm();
    await status.filter({ hasText: '빈 손' }).waitFor({ timeout: 30_000 });
    const picks = page.getByRole('region', { name: '집기 기록', exact: true });
    await picks.getByText(/놓기 \d/).first().waitFor({ state: 'attached', timeout: 15_000 });
    await shot('9-pick-records-steps', picks);

    // ── 5. 3D 홈 로봇 패널: 같은 조작 ──
    await go('/');
    await page.getByRole('tab', { name: '3D' }).click();
    await page.waitForSelector('.st-root', { timeout: 30_000 });
    await page.waitForFunction(() => !document.querySelector('.st-poster'), null, { timeout: 120_000 }).catch(() => undefined);
    const pinButton = page.getByRole('button', { name: /^로봇팔 / }).first();
    await pinButton.waitFor({ state: 'attached', timeout: 60_000 });
    await pinButton.evaluate((el) => el.click());
    const panel = page.getByRole('complementary', { name: '로봇팔 상세' });
    await panel.waitFor();
    const panelMode = panel.getByRole('region', { name: '운전 모드' });
    await panelMode.waitFor();
    await shot('10-home3d-robot-panel', panelMode, { check: false });
    await panelMode.getByRole('radio').filter({ hasText: /^자동 · 섹터 지정/ }).evaluate((el) => el.click());
    await shot('11-home3d-robot-panel-pinned-draft', panelMode, { check: false });
    await context.close();
  }
  await toAuto();
  fs.writeFileSync(path.join(out, 'validation.txt'), 'PASS: 390×844, 1440×900; robot page auto / auto·pinned / manual (empty, holding, placed), inline apply, batch planned vs actual mix with pin badge, pin events, pick records two steps, 3D home robot panel controls.\n');
  console.log('PASS');
} finally { await browser?.close(); app.stop(); mock.stop(); }
