// 기록 상세 팝업(차량·배치·베일)을 실제 모의 서버·브라우저로 확인하고 스크린샷을 남긴다.
// 폰 390×844(아래 시트)과 데스크톱 1440×900(가운데 대화상자): 팝업 셋, 베일 → 배치 → 베일 이어 열기, 닫으면 바로 전 팝업,
// 뒤로 가기·깊은 링크, 대시보드의 "이 배치 상세". 결과는 docs/screenshots/record-popups.
// 실행: node app/scripts/recordPopups.mjs (로컬 Chromium 필요)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/record-popups');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14018/api/v1';
const origin = 'http://localhost:15218';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14018', CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15218', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14018/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');

let browser;
try {
  await Promise.all([mock.ready, app.ready]);
  // 베일 기록 엔드포인트: 기록 목록 모양, 생산 시각 내림차순, 한 건 조회와 같은 값
  const token = (await (await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', password: 'mock-admin' }) })).json()).accessToken;
  const get = (p) => fetch(api + p, { headers: { Authorization: `Bearer ${token}` } });
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const bales = await (await get(`/bales/records?from=${from}&to=${to}&page=1&pageSize=10`)).json();
  assert.ok(bales.total > 0 && bales.items.length > 0 && bales.items.length <= 10, '베일 기록이 비었습니다');
  assert.ok(bales.items.every((b, i, all) => i === 0 || all[i - 1].createdAt >= b.createdAt), '최신 먼저가 아닙니다');
  assert.ok(bales.items.every((b) => ['created', 'shipped'].includes(b.stage) && typeof b.batchId === 'string' && typeof b.pressureMpa === 'number'));
  const one = await (await get(`/bales/${encodeURIComponent(bales.items[0].id)}`)).json();
  assert.equal(one.pressureMpa, bales.items[0].pressureMpa);
  assert.equal((await get(`/bales/records?from=${to}&to=${from}&page=1&pageSize=10`)).status, 422);
  console.log(`✓ GET /bales/records: ${bales.total}건, 한 건 조회와 같은 값`);

  browser = await chromium.launch({ executablePath: findChromium() });
  for (const [width, height, size] of [
    [390, 844, 'phone'],
    [1440, 900, 'desktop'],
  ]) {
    const phone = width < 600;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await context.addInitScript(() => localStorage.setItem('ecocycle.homeMode', 'dashboard'));
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    await page.goto(`${origin}/login`);
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호').fill('mock-admin');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');
    const dialog = page.getByRole('dialog');
    const shot = async (name) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, `${size}-${name}.png`) });
      console.log(`✓ ${size} ${name}`);
    };
    // 앱 안에서 주소를 바꾼다 (다시 불러오지 않는다). 상태 없이 상세 주소로 가면 주소를 바로 연 것(깊은 링크)과 같다
    const go = async (route) => {
      await page.evaluate((r) => {
        window.history.pushState({}, '', r);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
    };
    const heading = (name) => dialog.getByRole('heading', { name }).waitFor({ timeout: 15_000 });
    const openFirst = async (tab, label) => {
      await go(`/records?tab=${tab}`);
      await page.getByRole('region', { name: label }).waitFor({ timeout: 15_000 });
      await page.waitForTimeout(800);
      const first = phone ? page.getByRole('list', { name: label }).getByRole('button').first() : page.getByRole('table', { name: label }).locator('tbody tr').first();
      await first.click();
    };
    const closeAll = async () => {
      while (await dialog.count()) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      }
    };

    // 팝업 셋
    await openFirst('vehicles', '차량 기록');
    await heading('차량 기록');
    await dialog.getByText('계중대 무게').waitFor();
    assert.match(new URL(page.url()).pathname, /^\/records\/vehicles\//);
    await shot('1-vehicle');
    await closeAll();
    assert.equal(new URL(page.url()).pathname, '/records');

    await openFirst('batches', '배치 기록');
    await heading('배치 상세');
    await dialog.getByText(/^만든 베일/).waitFor();
    await shot('2-batch');
    await closeAll();

    // 베일 A → 배치 → 베일 B (목업은 배치당 베일 하나라 B는 그 배치가 만든 베일)
    await openFirst('bales', '베일 기록');
    await heading('베일 상세');
    await dialog.getByText('사용 압력').waitFor();
    await shot('3-bale');
    await dialog.getByRole('button', { name: /^배치 .* 보기$/ }).click();
    await heading('배치 상세');
    await dialog.getByText(/^만든 베일/).waitFor();
    await shot('4-sequence-2-batch');
    await dialog.getByRole('button', { name: /^베일 .* 보기$/ }).first().click();
    await heading('베일 상세');
    await dialog.getByText('사용 압력').waitFor();
    await dialog.getByText(/^닫으면 이전 팝업\(배치/).waitFor();
    assert.equal(await dialog.count(), 1, '보이는 팝업은 하나여야 합니다');
    await shot('5-sequence-3-bale');
    // 뒤로 가기는 지금 팝업 하나만 닫고 바로 전 팝업(배치)을 보인다
    await page.goBack();
    await heading('배치 상세');
    assert.match(new URL(page.url()).pathname, /^\/records\/batches\//);
    await shot('6-back-shows-previous-batch');
    // 바깥 누르기는 하나만 닫는다 (바로 전 것은 잊었으므로 모두 닫힘)
    await page.mouse.click(5, 5);
    await dialog.waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, '/records?tab=bales');

    // 깊은 링크: 상세 주소를 바로 열면 공정 기록 위에 팝업, 뒤로 가면 공정 기록
    const bale = bales.items[0];
    await go(`/records/bales/${encodeURIComponent(bale.id)}`);
    await heading('베일 상세');
    await page.getByRole('tab', { name: '베일', selected: true }).waitFor({ state: 'attached' });
    await shot('7-deep-link-bale');
    await page.goBack();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname, '/records');

    // 대시보드의 "이 배치 상세": 홈 위에 배치 팝업
    await go('/');
    await page.getByRole('region', { name: '지금 배치' }).waitFor({ timeout: 15_000 });
    const detail = page.getByRole('link', { name: '이 배치 상세 →' });
    await detail.waitFor({ timeout: 20_000 }).catch(() => undefined);
    if (await detail.count()) {
      await detail.click();
      await heading('배치 상세');
      await shot('8-dashboard-batch');
      await closeAll();
      assert.equal(new URL(page.url()).pathname, '/');
    } else {
      console.log(`- ${size}: 지금 진행 중인 배치가 없어 대시보드 팝업은 건너뜀`);
    }
    await context.close();
  }
  console.log(`스크린샷: ${path.relative(root, out)}`);
} finally {
  await browser?.close();
  app.stop();
  mock.stop();
}
