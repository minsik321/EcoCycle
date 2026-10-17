// UI 다듬기 점검(2026-10-16): 섹터 상세 칸 비율, 배치·베일 폭, KPI 상세 높이 고정, 3D 지역 전환 간격, 팝업 X 닫기,
// 기기 페이지 알람 이력 5건·"전체 알람 보기", 모의 계정 비밀번호 1234. 세 크기(390×844·820×1180·1440×900)로 찍는다.
// 결과는 docs/screenshots/ui-polish. 실행: node app/scripts/uiPolish.mjs (로컬 Chromium 필요)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/ui-polish');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14031/api/v1';
const origin = 'http://localhost:15231';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14031', CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15231', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14031/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');

const SIZES = [
  [390, 844, 'phone'],
  [820, 1180, 'tablet'],
  [1440, 900, 'desktop'],
];
const box = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
  });

let browser;
let lastPage;
try {
  await Promise.all([mock.ready, app.ready]);
  // 7. 모의 계정은 모두 1234, 옛 비밀번호는 거부
  for (const id of ['admin', 'operator', 'viewer']) {
    const ok = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, password: '1234' }) });
    assert.equal(ok.status, 200, `${id} 로그인`);
  }
  const bad = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'admin', password: 'mock-admin' }) });
  assert.equal(bad.status, 401);
  console.log('✓ 계정 비밀번호 1234');

  browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [width, height, size] of SIZES) {
    const phone = width < 600;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await context.addInitScript(() => {
      if (!sessionStorage.getItem('polish')) {
        sessionStorage.setItem('polish', '1');
        localStorage.setItem('ecocycle.homeMode', '3d');
        localStorage.setItem('ecocycle.qualityMode', 'low');
        localStorage.setItem('ecocycle.qualityChosen', 'true');
      }
    });
    const page = await context.newPage();
    lastPage = page;
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    const shot = async (name, opts = {}) => {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(out, `${size}-${name}.png`), timeout: 120_000, ...opts });
      console.log(`✓ ${size} ${name}`);
    };
    const go = async (route) => {
      await page.evaluate((r) => {
        window.history.pushState({}, '', r);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
    };

    await page.goto(`${origin}/login`);
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호').fill('1234');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');

    // 4. 3D 홈 지역 전환
    await page.locator('.st-area-dock').waitFor();
    await page.waitForTimeout(2500);
    await shot('4-3d-home');
    const dock = await box(page, '.st-area-dock');
    console.log('  dock', JSON.stringify(dock));
    await page.screenshot({ path: path.join(out, `${size}-4-area-switcher.png`), clip: { x: 0, y: Math.max(0, dock.y - 80), width: Math.min(width, 700), height: 260 }, timeout: 120_000 });

    // 펼친 목록: 파란 아이콘과 목록 칸의 간격
    await page.getByRole('button', { name: /^지역:/ }).click();
    await page.getByRole('listbox', { name: '카메라 지역' }).waitFor();
    const gaps = await page.locator('.st-area-list .st-area-badge').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r, i, all) => (i ? r.top - all[i - 1].bottom : null)).filter((g) => g !== null));
    const badge = await page.locator('.st-area-list .st-area-badge').first().evaluate((el) => el.getBoundingClientRect().width);
    const listGap = (await box(page, '.st-area-list')).y - (await box(page, '.st-area-button')).bottom;
    console.log('  아이콘 크기', badge, '줄 사이 간격', gaps.map(Math.round).join(','), '버튼-목록 간격', Math.round(listGap));
    assert.ok(badge <= 28 && gaps.every((g) => g >= 10) && listGap >= 6, '지역 전환 아이콘은 작고 줄 사이가 떨어져야 함');
    await page.screenshot({ path: path.join(out, `${size}-4-area-switcher-open.png`), clip: { x: 0, y: Math.max(0, dock.y - 60), width: Math.min(width, 700), height: 520 }, timeout: 120_000 });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^지역:/ }).evaluate((el) => el.getAttribute('aria-expanded') === 'true' && el.click());

    // 3. KPI 상세: 3D 홈과 대시보드, 불러오는 동안 높이 고정
    const kpiCheck = async (home) => {
      const trigger = page.getByRole('button', { name: '평균 수분 상세 보기', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: '평균 수분', exact: true });
      await dialog.getByText('마지막 갱신').waitFor();
      const frame = () => dialog.locator('[aria-busy] > div').first().evaluate((el) => el.getBoundingClientRect().height);
      const stats = () => dialog.locator('dl').evaluate((el) => el.getBoundingClientRect().top);
      const h0 = await frame();
      const s0 = await stats();
      let release;
      const gate = new Promise((r) => (release = r));
      await page.route('**/plant/kpi-history?**', async (route) => {
        await gate;
        await route.continue();
      });
      await dialog.getByRole('tab', { name: '7일', exact: true }).click();
      await dialog.getByText('불러오는 중…').waitFor();
      assert.equal(await frame(), h0, `${home} 로딩 중 그래프 칸 높이`);
      assert.equal(await stats(), s0, `${home} 로딩 중 통계 위치`);
      await shot(`3-kpi-${home}-loading`);
      release();
      await dialog.getByText('마지막 갱신').waitFor();
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      await page.unroute('**/plant/kpi-history?**');
      assert.equal(await frame(), h0, `${home} 로딩 뒤 그래프 칸 높이`);
      assert.equal(await stats(), s0, `${home} 로딩 뒤 통계 위치`);
      // 5. X 아이콘 닫기
      const close = dialog.getByRole('button', { name: '닫기', exact: true });
      assert.equal(await close.count(), 1);
      assert.equal(await close.innerText(), '');
      await shot(`3-kpi-${home}-loaded`);
      await page.keyboard.press('Escape');
    };
    await kpiCheck('3d');
    await page.getByRole('tab', { name: '대시보드', exact: true }).click();
    await page.getByRole('button', { name: '평균 수분 상세 보기', exact: true }).waitFor();
    await kpiCheck('dashboard');

    // 5. 기록 팝업 X 닫기
    for (const [tab, label, title] of [
      ['vehicles', '차량 기록', '차량 기록'],
      ['batches', '배치 기록', '배치 상세'],
      ['bales', '베일 기록', '베일 상세'],
    ]) {
      await go(`/records?tab=${tab}`);
      await page.getByRole('region', { name: label }).waitFor({ timeout: 15_000 });
      await page.waitForTimeout(800);
      const first = phone ? page.getByRole('list', { name: label }).getByRole('button').first() : page.getByRole('table', { name: label }).locator('tbody tr').first();
      await first.click();
      const dialog = page.getByRole('dialog', { name: title });
      await dialog.waitFor();
      const close = dialog.getByRole('button', { name: '닫기', exact: true });
      assert.equal(await close.count(), 1);
      assert.equal(await close.innerText(), '', `${title} 닫기는 글자 없는 아이콘`);
      assert.equal(await dialog.getByText('닫기', { exact: true }).count(), 0, `${title}에 글자 닫기 버튼이 남음`);
      if (tab === 'vehicles') await shot('5-popup-vehicle');
      await close.click();
      await dialog.waitFor({ state: 'detached' });
    }

    // 2. 배치·베일 폭: 로봇팔 페이지와 같은 틀
    const container = async (route) => {
      await go(route);
      await page.waitForTimeout(900);
      return page.evaluate(() => Math.round(document.querySelector('main').firstElementChild.getBoundingClientRect().width));
    };
    const w1 = await container('/robot');
    const w2 = await container('/records/batches');
    console.log('  틀 폭 로봇팔', w1, '배치·베일', w2);
    assert.equal(w2, w1, `배치·베일 틀 폭(${w2})이 로봇팔 페이지(${w1})와 같아야 함`);
    await shot('2-batch-bale');

    // 1·6. 섹터 상세와 알람 이력
    await go('/tanks/tank-a1');
    await page.getByRole('heading', { name: /섹터 A1/, level: 1 }).waitFor();
    await page.waitForTimeout(800);
    await shot('1-sector-detail');
    if (size === 'desktop') {
      const hero = await box(page, 'section[aria-label$="상태"]');
      const details = await box(page, 'section.\\@container');
      console.log('  hero', Math.round(hero.w), 'details', Math.round(details.w));
      assert.ok(Math.abs(hero.w / (hero.w + details.w + 24) - 1 / 3) < 0.05, '그림 카드가 전체의 약 1/3');
    }
    if (size !== 'desktop') await page.getByRole('button', { name: '자세히' }).click();
    const alarmCard = page.getByRole('region', { name: '알람 이력 (최근 7일)' });
    await alarmCard.waitFor();
    await page.waitForTimeout(800);
    const items = await alarmCard.locator('ul > li').count();
    assert.ok(items <= 5, `알람 이력 ${items}건`);
    const link = alarmCard.getByRole('link', { name: '전체 알람 보기' });
    assert.equal(await link.getAttribute('href'), '/alarms?device=tank-a1');
    await alarmCard.scrollIntoViewIfNeeded();
    await shot('6-alarm-history');
    await link.click();
    await page.getByText('섹터 A1 알람만 보는 중').waitFor();
    await shot('6-alarms-filtered');
    await context.close();
  }
  console.log('PASS');
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: path.join(out, 'failure-current.png') });
    console.log((await lastPage.locator('body').innerText()).slice(-1500));
  }
  throw error;
} finally {
  await browser?.close();
  app.stop();
  mock.stop();
}
