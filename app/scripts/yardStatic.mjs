// 3D 홈을 현장 사진과 견주는 스크린샷 (S2e): /scene-demo(예시 원본)와 실제 홈(모의 서버 + admin 로그인)을
// 390×844·820×1180·1440×900에서 부지 전체·기본 구역·위에서 보기와, 현장 사진과 같은 방향의 화면으로 찍는다.
//   node app/scripts/yardStatic.mjs   (로컬 Chromium 필요, 약 10~15분. 포트: SITE_SHOTS_PORT(앱, 기본 5522)·SITE_SHOTS_MOCK_PORT(모의 서버, 기본 5521))
//   SITE_SHOTS_ONLY=demo|live 로 한쪽만 찍는다. SITE_SHOTS_VIEWS=top,gate 처럼 화면 이름(파일 이름의 <화면>), SITE_SHOTS_SIZES=1440 처럼 폭으로 일부만 찍는다
// 카메라는 장면이 ?yardprobe 주소(실제 홈은 세션 저장소 'ecocycle.yardprobe')에서만 내주는 window.__studioView(key)(StudioScene: 지역 보기와 world/views의 PHOTO_VIEWS)로
// 미끄러지지 않고 바로 옮기고, window.__cameraError()가 0에 가까운 채로 머무는 것(카메라가 목표에 닿음)과 그린 장이 이어지는 것을 확인한 뒤 찍는다 (정해진 시간만 기다리지 않는다).
// 결과: docs/screenshots/studio/site-layout/{demo,live}-<화면>-<크기>.png
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/studio/site-layout');
fs.mkdirSync(out, { recursive: true });
const APP_PORT = process.env.SITE_SHOTS_PORT ?? '5522';
const MOCK_PORT = process.env.SITE_SHOTS_MOCK_PORT ?? '5521';
const ONLY = process.env.SITE_SHOTS_ONLY ?? '';
const origin = `http://localhost:${APP_PORT}`;
const ONLY_VIEWS = process.env.SITE_SHOTS_VIEWS ? new Set(process.env.SITE_SHOTS_VIEWS.split(',')) : null;
const ONLY_SIZES = process.env.SITE_SHOTS_SIZES ? new Set(process.env.SITE_SHOTS_SIZES.split(',').map(Number)) : null;
const SIZES = [
  [390, 844],
  [820, 1180],
  [1440, 900],
].filter(([w]) => !ONLY_SIZES || ONLY_SIZES.has(w));
/** 지역 보기 (지역 전환 목록의 이름표, 보기 key, 파일 이름) */
const AREAS = [
  [/부지 전체/, 'site', 'wide'],
  [/섹터·로봇/, 'process', 'default'],
  [/위에서 보기/, 'top', 'top'],
];
/** 사진 방향 화면 (모든 크기), 1440에서만 더 찍는 것 */
const PHOTO = ['gate', 'weighbridge', 'upperRoad'];
const PHOTO_WIDE_ONLY = ['entrance', 'approach'];
const EXTRA_AREAS = [
  [/입구·계근대/, 'inbound', 'inbound'],
  [/압축기·레일/, 'baler', 'baler'],
  [/베일 적치/, 'bales', 'bales'],
];
const want = (file) => !ONLY_VIEWS || ONLY_VIEWS.has(file);

const exe = findChromium();
if (!exe) {
  console.error('Chromium을 찾지 못했습니다. CHROMIUM_PATH에 실행 파일 경로를 주세요.');
  process.exit(2);
}
const live = ONLY !== 'demo';
const mock = live ? start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: MOCK_PORT, CORS_ORIGINS: origin }, '[mock-server]') : null;
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', APP_PORT, '--strictPort'], root, live ? { VITE_API_BASE: `http://localhost:${MOCK_PORT}/api/v1`, VITE_WS_BASE: `ws://localhost:${MOCK_PORT}/ws/v1/stream`, VITE_USE_MOCK: 'true' } : {}, 'Local:');

let browser;
let failed = 0;
/** 카메라가 목표에 닿아 머물고(오차 0.003 이하가 0.6초 동안), 그 뒤 화면을 두 장 더 그릴 때까지 기다린다 */
async function settle(page) {
  await page.waitForFunction(
    () => {
      const w = window;
      const e = w.__cameraError?.() ?? Infinity;
      const now = performance.now();
      if (e > 0.003) {
        w.__settledSince = undefined;
        return false;
      }
      w.__settledSince ??= now;
      return now - w.__settledSince > 600;
    },
    null,
    { timeout: 120_000, polling: 100 },
  );
  // 데이터에 따라 움직이는 것(트럭·지게차)이 있어 장면은 계속 그려질 수 있다: 카메라가 선 뒤 두 번의 화면 갱신을 기다린다
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 400)))));
}
async function view(page, key) {
  // 장면이 다시 만들어지는 짧은 동안(접속 측정으로 화질 단계가 바뀜 등)에는 카메라가 없다: 옮겨질 때까지 다시 부른다
  await page
    .waitForFunction((k) => window.__studioView?.(k) ?? false, key, { timeout: 120_000, polling: 500 })
    .catch(() => {
      throw new Error(`화면 ${key}를 열지 못했다`);
    });
  await settle(page);
}
async function area(page, name, key) {
  // 지역 전환 판의 이름표도 바꿔 둔다 (폰 폭에서 클릭 뒤 "예정된 이동"을 기다리다 멈추는 일이 있어 요소의 click()을 직접 부른다)
  // (이름표는 보기만의 것: 느린 화면에서 판이 늦게 열리면 건너뛰고 카메라는 아래 view가 옮긴다)
  try {
    await page.locator('.st-area-button').evaluate((el) => el.click(), null, { timeout: 60_000 });
    await page.getByRole('option', { name }).first().evaluate((el) => el.click(), null, { timeout: 60_000 });
  } catch {
    console.log(`  (지역 전환 판 이름표 ${key}는 건너뜀)`);
  }
  await view(page, key);
}
async function shots(page, prefix, width, height) {
  const size = `${width}x${height}`;
  const list = [...AREAS, ...(width >= 1200 ? EXTRA_AREAS : [])];
  for (const [name, key, file] of list) {
    if (!want(file)) continue;
    await area(page, name, key);
    await page.screenshot({ path: path.join(out, `${prefix}-${file}-${size}.png`) });
    console.log(`✓ ${prefix} ${file} ${size}`);
  }
  for (const key of [...PHOTO, ...(width >= 1200 ? PHOTO_WIDE_ONLY : [])]) {
    if (!want(`photo-${key}`)) continue;
    await view(page, key);
    // 사진 방향 화면은 건물·지형을 사진과 견주는 화면이라 핀(상태 알약)을 잠깐 가린다
    await page.evaluate(() => document.querySelectorAll('.st-pins').forEach((el) => (el.style.opacity = '0')));
    await page.screenshot({ path: path.join(out, `${prefix}-photo-${key}-${size}.png`) });
    await page.evaluate(() => document.querySelectorAll('.st-pins').forEach((el) => (el.style.opacity = '')));
    console.log(`✓ ${prefix} photo ${key} ${size}`);
  }
}

try {
  await Promise.all([app.ready, mock?.ready]);
  browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [width, height] of SIZES) {
    const phone = width < 600;
    if (ONLY !== 'live') {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      const page = await context.newPage();
      page.on('pageerror', (e) => {
        failed += 1;
        console.log('PAGE ERROR', e.message);
      });
      await page.goto(`${origin}/scene-demo?tier=standard&yardprobe=1`);
      await page.waitForFunction(() => typeof window.__studioView === 'function', null, { timeout: 180_000 });
      // 시연 원본이 차량·베일을 몇 개 내보내도록 잠깐 돌린다
      await page.waitForTimeout(20_000);
      await shots(page, 'demo', width, height);
      await context.close();
    }
    if (live) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
      await context.addInitScript(() => {
        localStorage.setItem('ecocycle.homeMode', '3d');
        sessionStorage.setItem('ecocycle.yardprobe', '1');
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => {
        failed += 1;
        console.log('PAGE ERROR', e.message);
      });
      await page.goto(`${origin}/login`);
      await page.getByLabel('아이디').fill('admin');
      await page.getByLabel('비밀번호').fill('1234');
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      await page.waitForURL((u) => u.pathname === '/');
      // 폰은 홈이 대시보드로 열릴 수 있다: 3D로 바꾼다
      const tab3d = page.getByRole('tab', { name: '3D' });
      if ((await tab3d.getAttribute('aria-selected')) !== 'true') await tab3d.evaluate((el) => el.click());
      await page.waitForFunction(() => typeof window.__studioView === 'function', null, { timeout: 180_000 });
      await page.waitForTimeout(20_000);
      await shots(page, 'live', width, height);
      await context.close();
    }
  }
} catch (error) {
  failed += 1;
  console.error(String(error));
} finally {
  await browser?.close();
  app.stop();
  mock?.stop();
}
console.log(failed === 0 ? '✓ 현장 사진 비교 스크린샷' : '✗ 실패');
process.exit(failed === 0 ? 0 : 1);
