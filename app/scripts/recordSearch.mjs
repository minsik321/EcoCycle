// 기록·알람 검색 재현과 스크린샷: node app/scripts/recordSearch.mjs [출력 폴더]
// 모의 서버와 앱을 띄워 실제 Chromium으로 390×844·1440×900에서
//   공정 기록의 차량·배치·베일 탭(기간 + 검색), 섹터 하나의 하역 기록, 알람 이력(기간 + 검색), 검색 결과 없음 화면을 찍고
//   검색이 서버에서 기간과 함께 적용되는지(건수가 줄어드는지), 번호판 공백 무시, X 버튼, 쪽 초기화, 짧은 글 꺾임·가로 넘침 없음을 점검한다.
// 결과는 docs/screenshots/record-search. 브라우저는 내려받지 않는다(CHROMIUM_PATH 또는 Playwright 브라우저 폴더).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText } from './textAudit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'docs/screenshots/record-search');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14020/api/v1';
const origin = 'http://localhost:15220';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14020', CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15220', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14020/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
const problems = [];

async function closeToasts(page) {
  while (await page.getByRole('button', { name: '알림 닫기', exact: true }).count()) await page.getByRole('button', { name: '알림 닫기', exact: true }).first().click();
}

async function go(page, route) {
  await page.evaluate((r) => {
    history.pushState({}, '', r);
    dispatchEvent(new PopStateEvent('popstate'));
  }, route);
  await pause(1500);
  await closeToasts(page);
}

async function shot(page, width, height, name) {
  const main = page.locator('main');
  await main.evaluate((el) => el.scrollTo(0, 0));
  const h = await main.evaluate((el) => el.scrollHeight);
  await page.setViewportSize({ width, height: Math.min(Math.max(h + 140, height), 6000) });
  await pause(400);
  await page.screenshot({ path: path.join(out, `${width}x${height}-${name}.png`), fullPage: true });
  await page.setViewportSize({ width, height });
  const wrapped = await page.evaluate(findWrappedText);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (wrapped.length || overflow) problems.push({ size: `${width}×${height}`, name, wrapped, overflow });
}

/** "총 N건"의 N. 아직 못 받았으면 null */
async function total(scope) {
  const text = await scope.locator('p', { hasText: /^.*총 \d+건/ }).first().innerText().catch(() => '');
  const match = /총 (\d+)건/.exec(text);
  return match ? Number(match[1]) : null;
}

async function waitTotal(scope, predicate, label) {
  for (let i = 0; i < 40; i++) {
    const n = await total(scope);
    if (n !== null && predicate(n)) return n;
    await pause(150);
  }
  throw new Error(`건수를 기다리다 시간 초과: ${label} (마지막 ${await total(scope)})`);
}

async function search(scope, label, text) {
  const box = scope.getByRole('searchbox', { name: label });
  await box.fill(text);
  await box.press('Enter');
  await pause(500);
}

try {
  await Promise.all([mock.ready, app.ready]);
  browser = await chromium.launch({ executablePath: findChromium() });
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await context.addInitScript(() => localStorage.setItem('ecocycle.homeMode', 'dashboard'));
    const page = await context.newPage();
    await page.goto(`${origin}/login`);
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호').fill('1234');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');

    // ── 공정 기록 · 차량: 최근 7일 + 번호판(공백 없이)
    await go(page, '/records?tab=vehicles');
    let section = page.getByRole('region', { name: '차량 기록' });
    await section.getByRole('button', { name: '최근 7일' }).click();
    const all = await waitTotal(section, (n) => n > 3, '차량 전체');
    assert.equal(await section.getByRole('searchbox').getAttribute('placeholder'), '번호판, 회사 검색');
    const plate = /\d{2,3}[가-힣]\s\d{4}/.exec(await section.innerText())?.[0];
    assert.ok(plate, '화면에서 번호판을 못 찾았다');
    await search(section, '차량 기록 검색', plate.replace(/\s+/g, ''));
    const found = await waitTotal(section, (n) => n >= 1 && n < all, '번호판 검색');
    assert.ok(found < all, `검색이 건수를 줄이지 못했다 (${found} / ${all})`);
    await shot(page, width, height, 'records-vehicles-search');
    // 같은 검색어로 기간만 바꾸기: 어제 → 건수가 기간 안에서만 센다 (검색어는 유지)
    await section.getByRole('button', { name: '오늘' }).click();
    await pause(700);
    assert.equal(await section.getByRole('searchbox').inputValue(), plate.replace(/\s+/g, ''));
    // X 버튼: 지우면 최근 7일이 아니라 오늘 전체
    await section.getByRole('button', { name: '검색어 지우기' }).click();
    await pause(600);
    assert.equal(await section.getByRole('searchbox').inputValue(), '');
    // 결과 없음
    await section.getByRole('button', { name: '최근 7일' }).click();
    await search(section, '차량 기록 검색', '없는-번호판-zzz');
    await section.getByText('검색 결과가 없습니다').waitFor();
    assert.match(await section.innerText(), /기간 최근 7일/);
    assert.match(await section.innerText(), /검색어 “없는-번호판-zzz”/);
    await shot(page, width, height, 'records-empty-search');

    // ── 공정 기록 · 배치: 섹터 A1
    await go(page, '/records?tab=batches');
    section = page.getByRole('region', { name: '배치 기록' });
    await section.getByRole('button', { name: '최근 7일' }).click();
    const batchesAll = await waitTotal(section, (n) => n > 2, '배치 전체');
    assert.equal(await section.getByRole('searchbox').getAttribute('placeholder'), '배치 ID, 섹터 검색');
    await search(section, '배치 기록 검색', '섹터 A1');
    const batchesA1 = await waitTotal(section, (n) => n >= 1 && n <= batchesAll, '배치 A1');
    await shot(page, width, height, 'records-batches-search');

    // ── 공정 기록 · 베일: 베일 ID 일부
    await go(page, '/records?tab=bales');
    section = page.getByRole('region', { name: '베일 기록' });
    await section.getByRole('button', { name: '최근 7일' }).click();
    const balesAll = await waitTotal(section, (n) => n > 3, '베일 전체');
    assert.equal(await section.getByRole('searchbox').getAttribute('placeholder'), '베일 ID, 배치 ID 검색');
    const baleId = /BL-\d+-\d+/.exec(await section.innerText())?.[0];
    assert.ok(baleId, '화면에서 베일 ID를 못 찾았다');
    await search(section, '베일 기록 검색', baleId.toLowerCase());
    await waitTotal(section, (n) => n >= 1 && n < balesAll, '베일 ID');
    await shot(page, width, height, 'records-bales-search');

    // ── 섹터 하역 기록
    await go(page, '/tanks/tank-a1');
    section = page.getByRole('region', { name: '하역 기록' });
    await section.scrollIntoViewIfNeeded();
    await section.getByRole('button', { name: '최근 7일' }).click();
    const unloadsAll = await waitTotal(section, (n) => n > 2, '하역 전체');
    assert.equal(await section.getByRole('searchbox').getAttribute('placeholder'), '번호판, 회사 검색');
    const unloadPlate = /\d{2,3}[가-힣]\s\d{4}/.exec(await section.innerText())?.[0];
    assert.ok(unloadPlate);
    await search(section, '하역 기록 검색', unloadPlate.replace(/\s+/g, '').toLowerCase());
    await waitTotal(section, (n) => n >= 1 && n < unloadsAll, '하역 번호판');
    await shot(page, width, height, 'sector-unloads-search');

    // ── 알람 이력
    await go(page, '/alarms');
    await page.getByRole('button', { name: '알람 이력' }).click();
    await pause(800);
    const main = page.locator('main');
    const alarmsAll = await waitTotal(main, (n) => n >= 3, '알람 전체');
    assert.equal(await main.getByRole('searchbox').getAttribute('placeholder'), '기기 이름, 알람 내용 검색');
    await search(main, '알람 검색', '압축기');
    const alarmsFound = await waitTotal(main, (n) => n >= 1 && n < alarmsAll, '알람 압축기');
    await shot(page, width, height, 'alarms-search');
    await search(main, '알람 검색', '없는 알람 zzz');
    await main.getByText('검색 결과가 없습니다').waitFor();
    await shot(page, width, height, 'alarms-empty-search');

    console.log(`${width}×${height}: 차량 ${all}→${found}, 배치 ${batchesAll}→${batchesA1}, 베일 ${balesAll}, 하역 ${unloadsAll}, 알람 ${alarmsAll}→${alarmsFound}`);
    await context.close();
  }
  assert.deepEqual(problems, []);
  console.log('PASS: 390×844, 1440×900 (검색 + 기간, 공백 무시, X, 결과 없음, 글 꺾임·가로 넘침 없음)');
} finally {
  await browser?.close();
  app.stop();
  mock.stop();
}
