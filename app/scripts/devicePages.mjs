// 기기 페이지 재설계(로봇팔·압축기·컨베이어) 재현과 스크린샷: node app/scripts/devicePages.mjs
// 모의 서버와 앱을 띄워 실제 Chromium으로 390×844·820×1180·1440×900에서 네 페이지(섹터 포함, 맨 위·"자세히" 열기)와 로봇 운전 모드 세 칸
// (자동 → 자동 · 섹터 지정 → 수동, 실제 명령·확인 단계·적용 결과)을 찍고, 글자 100%·130%에서 짧은 글 꺾임·가로 넘침이 없는지 본다.
// 결과는 docs/screenshots/device-pages (글자 100%만 저장). 브라우저는 내려받지 않는다(CHROMIUM_PATH 또는 Playwright 브라우저 폴더).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText, zoomText } from './textAudit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/device-pages');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14007/api/v1';
const origin = 'http://localhost:15207';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14007', CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15207', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14007/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  await Promise.all([mock.ready, app.ready]);
  const token = (await (await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', password: 'mock-admin' }) })).json()).accessToken;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const get = async (route) => (await fetch(api + route, { headers })).json();
  const setMode = async (mode) => {
    const r = await fetch(`${api}/devices/robot-1/commands`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ type: 'set_mode', mode, confirm: true }) });
    const { commandId } = await r.json();
    for (let i = 0; i < 300 && (await get(`/commands/${commandId}`)).status === 'accepted'; i++) await pause(100);
  };

  // 모의 서버 값 점검: 집기 부피는 0.06~0.14 m³에서 매번 다르고, 기기 상태에 새 값(itemsToBaler, cycleStage)이 있다
  const picks = (await get(`/robots/robot-1/picks/records?from=${new Date(Date.now() - 86_400_000).toISOString()}&to=${new Date(Date.now() + 1000).toISOString()}&page=1&pageSize=50`)).items;
  const volumes = picks.map((p) => p.volumeM3);
  assert.ok(volumes.every((v) => v >= 0.06 && v <= 0.14), `부피 범위: ${volumes}`);
  assert.ok(new Set(volumes).size > 10, `부피가 여러 가지여야 한다: ${[...new Set(volumes)]}`);
  const conveyor = await get('/devices/conveyor-z/state');
  const compressor = await get('/devices/compressor-1/state');
  assert.equal(typeof conveyor.itemsToBaler, 'number');
  assert.ok(['idle', 'filling', 'pressing', 'ejecting'].includes(compressor.cycleStage), compressor.cycleStage);

  browser = await chromium.launch({ executablePath: findChromium() });
  const notes = [];
  for (const [width, height] of [[390, 844], [820, 1180], [1440, 900]]) {
    for (const zoom of [1, 1.3]) {
      if ((await get('/devices/robot-1/state')).mode !== 'auto') await setMode('auto');
      const context = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      await context.addInitScript(() => localStorage.setItem('ecocycle.homeMode', 'dashboard'));
      const page = await context.newPage();
      await page.goto(`${origin}/login`);
      await page.getByLabel('아이디').fill('admin');
      await page.getByLabel('비밀번호').fill('mock-admin');
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      await page.waitForURL((u) => u.pathname === '/');
      const go = async (route) => {
        await page.evaluate((r) => {
          history.pushState({}, '', r);
          dispatchEvent(new PopStateEvent('popstate'));
        }, route);
        await page.locator('main').evaluate((el) => el.scrollTo(0, 0));
      };
      if (zoom !== 1) await page.evaluate(zoomText, zoom);
      const shot = async (name, target, { full = false } = {}) => {
        if (!(await page.getByRole('dialog').count())) {
          while (await page.getByRole('button', { name: '알림 닫기', exact: true }).count()) await page.getByRole('button', { name: '알림 닫기', exact: true }).first().click();
        }
        if (target) await target.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await pause(300);
        const wrapped = await page.evaluate(findWrappedText);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (zoom === 1) {
          await page.screenshot({ path: path.join(out, `${width}x${height}-${name}.png`) });
          if (full) {
            // 화면 전체(스크롤 영역)를 한 장으로: main의 높이를 펼쳐 찍는다
            const main = page.locator('main');
            const h = await main.evaluate((el) => el.scrollHeight);
            await page.setViewportSize({ width, height: Math.min(h + 140, 6000) });
            await pause(300);
            await page.screenshot({ path: path.join(out, `${width}x${height}-${name}-full.png`), fullPage: true });
            await page.setViewportSize({ width, height });
            await pause(200);
          }
        }
        assert.deepEqual({ wrapped, overflow }, { wrapped: [], overflow: false }, `${width}px 글자 ${zoom * 100}% ${name}`);
      };

      // 로봇팔: 맨 위, 운전 모드 세 칸
      await go('/robot');
      const mode = page.getByRole('region', { name: '운전 모드', exact: true });
      const radio = (re) => mode.getByRole('radio').filter({ hasText: re });
      const current = (re) => mode.locator('[role="radio"]').filter({ hasText: re }).filter({ hasText: '지금' });
      await current(/^자동(?! ·)/).waitFor();
      await page.getByRole('group', { name: '이번 시간 집기' }).getByText(/^\d+/).waitFor();
      await shot('robot-1-top', null, { full: true });
      await shot('robot-mode-1-auto', mode);

      await radio(/^자동 · 섹터 지정/).click();
      await mode.getByRole('button', { name: '섹터 A1', exact: true }).click();
      await mode.getByRole('button', { name: '섹터 B1', exact: true }).click();
      await mode.getByRole('button', { name: '적용', exact: true }).click();
      await shot('robot-mode-2-pinned-confirm');
      await page.getByRole('dialog').getByRole('button', { name: '실행', exact: true }).click();
      await current(/^자동 · 섹터 지정/).waitFor();
      await mode.getByRole('status', { name: '모드 전환 결과' }).getByText('적용됨').waitFor();
      assert.deepEqual((await get('/devices/robot-1/state')).pinnedSectors, ['tank-a1', 'tank-b1']);
      await shot('robot-mode-2-pinned', mode);

      await radio(/^수동/).click();
      await mode.getByRole('button', { name: '적용', exact: true }).click();
      await page.getByRole('dialog').getByRole('button', { name: '실행', exact: true }).click();
      await current(/^수동/).waitFor();
      assert.equal((await get('/devices/robot-1/state')).mode, 'manual');
      // 집을 섹터와 집기가 한 줄에, 같은 높이로
      const select = mode.getByLabel('집을 섹터');
      const pick = mode.getByRole('button', { name: /^집기/ });
      await pick.and(page.locator(':enabled')).waitFor({ timeout: 30_000 });
      const [a, b] = [await select.boundingBox(), await pick.boundingBox()];
      assert.ok(Math.abs(a.y - b.y) < 2 && Math.abs(a.height - b.height) < 2, `집을 섹터·집기 정렬: ${JSON.stringify({ a, b })}`);
      // 이름표도 같은 줄, 같은 가운데선
      const text = await mode.locator('label', { hasText: '집을 섹터' }).boundingBox();
      assert.ok(Math.abs(text.y + text.height / 2 - (a.y + a.height / 2)) < 2, `집을 섹터 이름표 정렬: ${JSON.stringify({ text, a })}`);
      await shot('robot-mode-3-manual', mode);

      await page.getByRole('button', { name: '자세히', exact: true }).click();
      await page.getByRole('region', { name: '관절 값' }).waitFor();
      await shot('robot-2-details', page.getByRole('button', { name: '자세히', exact: true }), { full: true });
      await setMode('auto');

      // 섹터·압축기·컨베이어: 맨 위(전체), "자세히" 열기(전체). 열린 자세히가 폭 전체에 펼쳐지는지는 스크린샷으로 본다
      for (const [route, name] of [
        ['/tanks/tank-a1', 'sector'],
        ['/compressor', 'compressor'],
        ['/conveyor', 'conveyor'],
      ]) {
        await go(route);
        await page.getByLabel('지금 하는 일').filter({ hasNotText: '불러오는 중' }).waitFor();
        await shot(`${name}-1-top`, null, { full: true });
        await page.getByRole('button', { name: '자세히', exact: true }).click();
        await page.getByRole('img', { name: /이력 그래프|그래프/ }).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
        await shot(`${name}-2-details`, page.getByRole('button', { name: '자세히', exact: true }), { full: true });
      }
      notes.push(`${width}×${height} 글자 ${zoom * 100}%`);
      await context.close();
    }
  }
  fs.writeFileSync(
    path.join(out, 'validation.txt'),
    `PASS (${new Date().toISOString()}): ${notes.join(', ')}.\n` +
      '로봇 운전 모드 자동 → 자동 · 섹터 지정(A1·B1, 확인 단계, 적용됨) → 수동(이름표·선택·집기 한 줄 정렬), 진단(관리자), 섹터·압축기·컨베이어 맨 위(자세히 닫힘)와 자세히 열림 전체 화면.\n' +
      '모의 서버: 집기 부피 0.06~0.14 m³ 여러 값, 컨베이어 itemsToBaler, 압축기 cycleStage.\n',
  );
  console.log(`PASS: ${notes.join(', ')}`);
} finally {
  await browser?.close();
  app.stop();
  mock.stop();
}
