// 글 줄바꿈 화면 점검: 모의 서버와 앱(vite)을 띄우고 실제 브라우저로 폰·태블릿 화면을 열어
// 짧은 이름표가 두 줄로 꺾이거나, 낱말이 중간에서 잘리거나, 화면이 옆으로 넘치는 곳을 찾는다.
//   npm run test:text            (약 2~3분, 서버를 스스로 띄운다)
// 브라우저: CHROMIUM_PATH, 없으면 이 컴퓨터의 Playwright 브라우저 폴더(ms-playwright/chromium-*)에서 찾는다. 내려받지 않는다.
// 글자를 키운 폰(안드로이드 "글자 크기" 130%)도 함께 본다: 글자만 1.3배, 상자 폭은 그대로.
// 실패하면 그 화면을 scripts/.textcheck/에 찍어 둔다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';
import { findWrappedText, zoomText } from './textAudit.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(appDir, '..');
const outDir = path.join(appDir, 'scripts', '.textcheck');
const MOCK_PORT = process.env.TEXTCHECK_MOCK_PORT ?? '4098';
const APP_PORT = process.env.TEXTCHECK_APP_PORT ?? '5198';

const SIZES = [
  [360, 780],
  [390, 844],
  [820, 1180],
];
const ZOOMS = [1, 1.3];

const failures = [];
let checked = 0;

async function check(page, name, zoom) {
  await page.waitForTimeout(400);
  if (zoom !== 1) await page.evaluate(zoomText, zoom);
  const wrapped = await page.evaluate(findWrappedText);
  const width = page.viewportSize().width;
  const overflow = await page.evaluate((w) => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - w, width);
  checked += 1;
  const label = `${width}px 글자 ${zoom * 100}% · ${name}`;
  if (wrapped.length || overflow > 0) {
    failures.push({ label, wrapped, overflow });
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, `${label.replace(/[^\w가-힣%]+/g, '-')}.png`) });
    console.log(`✗ ${label}${overflow > 0 ? ` · 옆으로 ${overflow}px 넘침` : ''}`);
    for (const w of wrapped) console.log(`    "${w.text}" ${w.lines}줄${w.midWord ? ' (낱말 중간에서 잘림)' : ''}, 폭 ${w.width}px`);
  } else console.log(`✓ ${label}`);
}

async function login(context) {
  const page = await context.newPage();
  await page.goto(`http://localhost:${APP_PORT}/login`);
  await page.getByLabel('아이디').fill('admin');
  await page.getByLabel('비밀번호').fill('mock-admin');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}

async function run(browser) {
  for (const [w, h] of SIZES) {
    for (const zoom of ZOOMS) {
      const phone = w < 600;
      const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      await context.addInitScript(() => {
        if (!sessionStorage.getItem('textcheck')) {
          sessionStorage.setItem('textcheck', '1');
          localStorage.setItem('ecocycle.homeMode', '3d');
        }
      });
      const page = await login(context);
      await page.waitForSelector('.st-root', { timeout: 30_000 }).catch(async (error) => {
        fs.mkdirSync(outDir, { recursive: true });
        await page.screenshot({ path: path.join(outDir, 'start-failed.png') });
        throw new Error(`3D 홈이 열리지 않았습니다 (${page.url()}): ${(await page.locator('body').innerText()).slice(0, 300)}`, { cause: error });
      });
      await page.waitForFunction(() => !document.querySelector('.st-poster'), null, { timeout: 60_000 }).catch(() => undefined);
      // 앱 안에서 주소를 바꾼다 (새로 불러오면 로그인이 풀린다: 토큰은 메모리에만 있다)
      const go = async (route) => {
        await page.evaluate((r) => {
          window.history.pushState({}, '', r);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, route);
        await page.waitForTimeout(300);
      };
      // 고른 것을 풀고(Escape) 시트를 펼쳐 탭을 고른다. 3D를 다시 만들지 않는다(느리고, 소프트웨어 그래픽에서는 WebGL이 지친다)
      const tabs = page.getByRole('tablist', { name: '공정 정보 종류' });
      const openSheet = async (tab) => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        if (!(await tabs.count())) await page.getByRole('button', { name: '공정 정보 펼치기' }).click();
        await tabs.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
      };
      if (phone) {
        for (const tab of ['배치', '차량', '섹터', '베일']) {
          await openSheet(tab);
          await check(page, `시트 ${tab}`, zoom);
        }
        for (const [pin, name] of [
          ['섹터 A1', '섹터 상세'],
          ['로봇팔', '로봇팔 상세'],
          ['압축기', '압축기 상세'],
          ['컨베이어', '컨베이어 상세'],
        ]) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          const target = page.locator(`.st-pin[aria-label^="${pin}"]`).first();
          if (!(await target.count())) {
            failures.push({ label: `${w}px · ${name}`, wrapped: [], overflow: 0 });
            console.log(`✗ ${w}px · ${name}: 핀을 찾지 못했습니다`);
            continue;
          }
          await target.dispatchEvent('click');
          const more = page.locator('details.st-more summary').first();
          if (await more.count()) await more.click();
          await check(page, name, zoom);
        }
        // 차량·베일 상세 (진행 중인 것이 있을 때만 고를 수 있다)
        for (const [tab, name] of [
          ['차량', '차량 상세'],
          ['베일', '베일 상세'],
        ]) {
          await openSheet(tab);
          const row = page.locator('.st-sheet-body tr[tabindex="0"]').first();
          if (!(await row.count())) {
            console.log(`- ${w}px 글자 ${zoom * 100}% · ${name}: 지금 고를 수 있는 ${tab}이 없어 건너뜀`);
            continue;
          }
          await row.click();
          await check(page, name, zoom);
        }
      } else {
        await check(page, '3D 홈', zoom);
        await page.locator('.st-table tr[tabindex="0"]').first().click().catch(() => undefined);
        await check(page, '3D 홈 상세', zoom);
      }
      for (const [route, name] of [
        ['/tanks', '섹터 목록'],
        ['/tanks/tank-a1', '섹터 페이지'],
        ['/robot', '로봇팔 페이지'],
        ['/compressor', '압축기 페이지'],
        ['/design/records', '기록 목록'],
      ]) {
        await go(route);
        await page.waitForTimeout(1200);
        await check(page, name, zoom);
      }
      // 공정 기록: 차량·배치 탭과 각각의 상세 (첫 줄을 눌러 연다)
      for (const [tab, label, name] of [
        ['vehicles', '차량 기록', '공정 기록 차량'],
        ['batches', '배치 기록', '공정 기록 배치'],
      ]) {
        await go(`/records?tab=${tab}`);
        await page.getByRole('region', { name: label }).waitFor({ timeout: 15_000 });
        await page.waitForTimeout(1200);
        await check(page, name, zoom);
        const first = phone ? page.getByRole('list', { name: label }).getByRole('button').first() : page.getByRole('table', { name: label }).locator('tbody tr').first();
        await first.click();
        await page.getByText(/^(계중대 무게|만든 베일)/).first().waitFor({ timeout: 15_000 });
        await page.waitForTimeout(800);
        await check(page, `${name} 상세`, zoom);
      }
      // 폰: 아래 탭 바의 "더 보기"를 펼친 모습
      if (phone) {
        await go('/robot');
        await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: '더 보기' }).click();
        await check(page, '주 메뉴 더 보기', zoom);
        await page.keyboard.press('Escape');
      }
      // 대시보드: 3D가 다시 열리면 전환을 누르고, 3D가 실패해 이미 대시보드로 바뀌었으면 그대로 본다
      await go('/');
      await page.locator('.st-root, [aria-label="상태 요약"]').first().waitFor({ timeout: 60_000 });
      if (await page.locator('.st-root').count()) await page.getByRole('tab', { name: '대시보드' }).click();
      await page.getByRole('region', { name: '상태 요약' }).waitFor();
      await page.waitForTimeout(800);
      await check(page, '대시보드', zoom);
      await context.close();
    }
  }
}

const exe = findChromium();
if (!exe) {
  console.error('Chromium을 찾지 못했습니다. CHROMIUM_PATH에 실행 파일 경로를 주세요.');
  process.exit(2);
}
const mock = start('모의 서버', ['run', 'start', '-w', '@ecocycle/mock-server'], rootDir, { PORT: MOCK_PORT, CORS_ORIGINS: `http://localhost:${APP_PORT}` }, '[mock-server]');
const app = start(
  '앱',
  ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', APP_PORT, '--strictPort'],
  rootDir,
  { VITE_API_BASE: `http://localhost:${MOCK_PORT}/api/v1`, VITE_WS_BASE: `ws://localhost:${MOCK_PORT}/ws/v1/stream`, VITE_USE_MOCK: 'true' },
  'Local:',
);
const stopAll = () => {
  app.stop();
  mock.stop();
};
process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});

let exitCode = 1;
let browser;
try {
  await Promise.all([mock.ready, app.ready]);
  fs.rmSync(outDir, { recursive: true, force: true });
  browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  await run(browser);
  console.log(`\n${checked}개 화면 점검, 문제 ${failures.length}개`);
  exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.error(String(error));
} finally {
  await browser?.close();
  stopAll();
}
process.exit(exitCode);
