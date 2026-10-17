// 페이지 폭·간격 재현과 스크린샷: node app/scripts/layoutPages.mjs [출력 폴더]
// 모의 서버와 앱을 띄워 실제 Chromium으로 390×844·820×1180·1180×820·1440×900에서 섹터 목록, 공정 기록, 대시보드 홈, 비교용 로봇팔 페이지를
// 찍고(전체 스크롤 영역), 페이지 틀 폭이 같은지와 짧은 글 꺾임·가로 넘침이 없는지 본다(글자 100%).
// 결과는 docs/screenshots/layout-width. 브라우저는 내려받지 않는다(CHROMIUM_PATH 또는 Playwright 브라우저 폴더).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText } from './textAudit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'docs/screenshots/layout-width');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14010/api/v1';
const origin = 'http://localhost:15210';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14010', CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15210', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14010/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = [
  ['sectors', '/tanks'],
  ['records', '/records'],
  ['dashboard', '/'],
  ['robot', '/robot'],
];
let browser;
const problems = [];
try {
  await Promise.all([mock.ready, app.ready]);
  browser = await chromium.launch({ executablePath: findChromium() });
  for (const [width, height] of [[390, 844], [820, 1180], [1180, 820], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await context.addInitScript(() => localStorage.setItem('ecocycle.homeMode', 'dashboard'));
    const page = await context.newPage();
    await page.goto(`${origin}/login`);
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호').fill('1234');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');
    const widths = {};
    for (const [name, route] of PAGES) {
      await page.evaluate((r) => {
        history.pushState({}, '', r);
        dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await pause(2000);
      while (await page.getByRole('button', { name: '알림 닫기', exact: true }).count()) await page.getByRole('button', { name: '알림 닫기', exact: true }).first().click();
      const main = page.locator('main');
      await main.evaluate((el) => el.scrollTo(0, 0));
      // 페이지 틀 = main의 첫 자식
      widths[name] = await main.evaluate((el) => Math.round(el.firstElementChild.getBoundingClientRect().width));
      const wrapped = await page.evaluate(findWrappedText);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (wrapped.length || overflow) problems.push({ size: `${width}×${height}`, name, wrapped, overflow });
      const h = await main.evaluate((el) => el.scrollHeight);
      await page.setViewportSize({ width, height: Math.min(Math.max(h + 140, height), 6000) });
      await pause(400);
      await page.screenshot({ path: path.join(out, `${width}x${height}-${name}.png`), fullPage: true });
      await page.setViewportSize({ width, height });
    }
    // 같은 페이지 틀: 섹터 목록·공정 기록·대시보드가 로봇팔 페이지와 같은 폭
    for (const name of ['sectors', 'records', 'dashboard']) {
      if (widths[name] !== widths.robot) problems.push({ size: `${width}×${height}`, name, width: widths[name], expected: widths.robot });
    }
    await context.close();
  }
  assert.deepEqual(problems, []);
  console.log('PASS: 390×844, 820×1180, 1180×820, 1440×900 (같은 페이지 폭, 글 꺾임·가로 넘침 없음)');
} finally {
  await browser?.close();
  app.stop();
  mock.stop();
}
