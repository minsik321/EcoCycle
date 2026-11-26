// 기록 상세 팝업(차량·배치·베일)을 실제 모의 서버·브라우저로 확인하고 스크린샷을 남긴다.
// 폰 390×844(아래 시트)과 데스크톱 1440×900(가운데 대화상자): 팝업 셋, 베일 → 배치 → 베일 이어 열기, 닫으면 바로 전 팝업,
// 뒤로 가기·깊은 링크, 대시보드의 "이 배치 상세", 상차 차량 팝업(실은 베일·무게 셋) → 베일 팝업의 "실은 차량" → 차량 팝업.
// 새 팝업 화면은 글 꺾임·가로 넘침도 본다. 결과는 docs/screenshots/record-popups.
// 실행: node app/scripts/recordPopups.mjs (로컬 Chromium 필요)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText } from './textAudit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/record-popups');
fs.mkdirSync(out, { recursive: true });
// 포트: 다른 점검과 겹치지 않게 RECORD_POPUPS_MOCK_PORT·RECORD_POPUPS_APP_PORT로 바꿀 수 있다
const mockPort = process.env.RECORD_POPUPS_MOCK_PORT ?? '14018';
const appPort = process.env.RECORD_POPUPS_APP_PORT ?? '15218';
const api = `http://localhost:${mockPort}/api/v1`;
const origin = `http://localhost:${appPort}`;
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: mockPort, CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', appPort, '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: `ws://localhost:${mockPort}/ws/v1/stream`, VITE_USE_MOCK: 'true' }, 'Local:');
const problems = [];

let browser;
try {
  await Promise.all([mock.ready, app.ready]);
  // 베일 기록 엔드포인트: 기록 목록 모양, 생산 시각 내림차순, 한 건 조회와 같은 값
  const token = (await (await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', password: '1234' }) })).json()).accessToken;
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
  // 상차 차량: 출차한 것 중 베일을 실은 것 하나, 그 베일의 vehicleId가 같다
  const outboundPage = await (await get(`/vehicles/records?from=${from}&to=${to}&page=1&pageSize=50&q=${encodeURIComponent('상차')}`)).json();
  const outbound = outboundPage.items.find((v) => v.kind === 'outbound' && v.status === 'departed' && v.baleIds.length > 0);
  assert.ok(outbound, '최근 7일에 베일을 실은 상차 차량이 없습니다');
  const loadedBale = await (await get(`/bales/${encodeURIComponent(outbound.baleIds[0])}`)).json();
  assert.equal(loadedBale.vehicleId, outbound.id);
  assert.equal(loadedBale.stage, 'shipped');
  console.log(`✓ 상차 차량 ${outbound.id}: 베일 ${outbound.baleIds.length}개, 베일 vehicleId 일치`);

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
    await page.getByLabel('비밀번호').fill('1234');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');
    const dialog = page.getByRole('dialog');
    const shot = async (name, audit = false) => {
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, `${size}-${name}.png`) });
      if (audit) {
        const wrapped = await page.evaluate(findWrappedText);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (wrapped.length || overflow) problems.push({ size, name, wrapped, overflow });
      }
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
    // 넓은 화면은 홈이 3D로 열릴 수 있어(기억한 모드가 앞 단계에서 바뀜) 전환에서 대시보드를 고른다
    const dashboardTab = page.getByRole('tablist', { name: '홈 보기' }).getByRole('tab', { name: '대시보드' });
    await dashboardTab.waitFor({ timeout: 15_000 });
    if ((await dashboardTab.getAttribute('aria-selected')) !== 'true') await dashboardTab.click();
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
    // 상차 차량 팝업: 종류 상차, 실은 베일 수와 베일 링크, 무게 셋 → 베일 팝업의 "실은 차량" → 차량 팝업
    await go(`/records/vehicles/${encodeURIComponent(outbound.id)}`);
    await heading('차량 기록');
    await dialog.getByText(`실은 베일 ${outbound.baleIds.length}개`).waitFor();
    await dialog.getByText('공차 (입차)').waitFor();
    await dialog.getByText('총중량 (출차 계근)').waitFor();
    assert.equal(await dialog.getByText('배정 섹터').count(), 0, '상차 차량에 배정 섹터가 보입니다');
    await shot('9-outbound-vehicle', true);
    await dialog.getByRole('button', { name: `베일 ${outbound.baleIds[0]} 보기` }).click();
    await heading('베일 상세');
    await dialog.getByText('실은 차량').waitFor();
    await dialog.getByText(outbound.id, { exact: true }).waitFor();
    await shot('10-outbound-bale-vehicle', true);
    await dialog.getByRole('button', { name: `차량 ${outbound.id} 보기` }).click();
    await heading('차량 기록');
    await dialog.getByText(`실은 베일 ${outbound.baleIds.length}개`).waitFor();
    assert.match(new URL(page.url()).pathname, new RegExp(`^/records/vehicles/${outbound.id}$`));
    await closeAll();
    // 공정 기록 차량 탭(상차 검색) 화면도 넘침을 본다
    await go('/records?tab=vehicles');
    await page.getByRole('region', { name: '차량 기록' }).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await shot('11-vehicles-tab', true);

    await context.close();
  }
  assert.deepEqual(problems, [], '글 꺾임·가로 넘침');
  console.log(`스크린샷: ${path.relative(root, out)}`);
} finally {
  await browser?.close();
  app.stop();
  mock.stop();
}
