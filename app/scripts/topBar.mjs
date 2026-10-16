// 앱 상단 바 하나(3D 홈·일반 화면)와 3D 홈 표(접기·장면에 없는 대상의 팝업)를 실제 모의 서버·브라우저로 확인하고 스크린샷을 남긴다.
// 390×844(폰)·820×1180(세로 태블릿)·1440×900(데스크톱): 3D 홈의 바, 태블릿·데스크톱의 표 펼침·접힘(기기에 기억),
// 장면에 없는 대상을 누르면 카메라는 그대로 두고 기록 팝업, 베일 탭의 "기록 보기", 일반 화면의 바와 사용자 메뉴, 대시보드(전환이 바 안).
// 결과는 docs/screenshots/top-bar. 실행: node app/scripts/topBar.mjs (로컬 Chromium 필요)
// 소프트웨어 그래픽(SwiftShader)은 3D 장면을 여러 번 새로 만들면 WebGL이 지치므로 3D 홈은 처음 한 번과 맨 끝(대시보드로 가기 전) 한 번만 연다.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/top-bar');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14019/api/v1';
const origin = 'http://localhost:15219';
const COLLAPSED_KEY = 'ecocycle.studio.tableCollapsed';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14019', CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15219', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14019/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');

let browser;
try {
  await Promise.all([mock.ready, app.ready]);
  browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [width, height, size] of [
    [390, 844, 'phone'],
    [820, 1180, 'tablet'],
    [1440, 900, 'desktop'],
  ]) {
    const phone = width < 600;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await context.addInitScript((key) => {
      if (!sessionStorage.getItem('topbar')) {
        sessionStorage.setItem('topbar', '1');
        localStorage.setItem('ecocycle.homeMode', '3d');
        localStorage.removeItem(key);
      }
    }, COLLAPSED_KEY);
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    await page.goto(`${origin}/login`);
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호').fill('mock-admin');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');
    const shot = async (name) => {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(out, `${size}-${name}.png`) });
      console.log(`✓ ${size} ${name}`);
    };
    // 앱 안에서 주소를 바꾼다 (새로 불러오면 로그인이 풀린다: 토큰은 메모리에만 있다)
    const go = async (route) => {
      await page.evaluate((r) => {
        window.history.pushState({}, '', r);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await page.waitForTimeout(300);
    };
    const bar = page.locator('header[data-topbar]');
    const home3d = async () => {
      await page.waitForSelector('.st-root', { timeout: 30_000 });
      await page.waitForFunction(() => !document.querySelector('.st-poster'), null, { timeout: 90_000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
    };

    // 1) 3D 홈: 3D 위에 뜬 같은 상단 바(로고 · 예시 · 3D | 대시보드 · 연결·시계 · 알람 · CCTV · 사용자), 검색 없음
    await home3d();
    assert.equal(await bar.count(), 1, '상단 바는 하나여야 합니다');
    assert.equal(await bar.getAttribute('data-topbar'), 'overlay');
    assert.equal(await page.getByRole('searchbox').count(), 0, '검색이 남아 있습니다');
    await bar.getByRole('tab', { name: '3D' }).waitFor();
    await bar.getByRole('status').filter({ hasText: /\d\d:\d\d/ }).waitFor();
    assert.equal(await bar.getByRole('link', { name: /알람 보기/ }).isVisible(), !phone, '알람은 폰에서는 아래 탭 바가 맡습니다');
    await shot('1-home-3d');

    // 2) 태블릿·데스크톱: 표 펼침 → 접기(요약 한 줄, 기기에 기억) → 펼침
    const table = page.getByRole('region', { name: '공정 기록' });
    if (!phone) {
      await table.getByRole('tablist', { name: '기록 종류' }).waitFor();
      await shot('2-panel-expanded');
      await table.getByRole('button', { name: '공정 기록 표 접기' }).click();
      await table.getByRole('button', { name: /공정 기록 표 펼치기/ }).waitFor();
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), COLLAPSED_KEY), '1');
      await shot('3-panel-collapsed');
      await table.getByRole('button', { name: /공정 기록 표 펼치기/ }).click();
      await table.getByRole('tablist', { name: '기록 종류' }).waitFor();
    }

    // 3) 장면에 없는 대상(출차한 차량, 없으면 배치)을 누르면: 카메라·고르기는 그대로, 기록 팝업만
    const scope = phone ? page.locator('.st-sheet') : table;
    const pickTab = async (name) => {
      if (phone) {
        if (!(await page.getByRole('tablist', { name: '공정 정보 종류' }).count())) await page.getByRole('button', { name: '공정 정보 펼치기' }).click();
        await page.getByRole('tablist', { name: '공정 정보 종류' }).getByRole('tab', { name: new RegExp(`^${name}`) }).click();
      } else await scope.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
      await page.waitForTimeout(300);
    };
    await pickTab('차량');
    let row = scope.locator('tr[data-off-scene]').first();
    let kind = 'vehicles';
    if (!(await row.count())) {
      await pickTab('배치');
      row = scope.locator('tr[data-off-scene]').first();
      kind = 'batches';
    }
    assert.ok(await row.count(), '장면에 없는 줄이 없습니다');
    await row.dispatchEvent('click');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: kind === 'vehicles' ? '차량 기록' : '배치 상세' }).waitFor({ timeout: 15_000 });
    await dialog.getByText(/^(계중대 무게|만든 베일)/).first().waitFor({ timeout: 15_000 });
    assert.match(new URL(page.url()).pathname, new RegExp(`^/records/${kind}/`));
    assert.equal(await page.getByRole('complementary', { name: '차량 상세' }).count(), 0, '고르기가 바뀌었습니다');
    await shot(`4-off-scene-${kind === 'vehicles' ? 'vehicle' : 'batch'}-popup`);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).pathname, '/');

    // 4) 베일 탭의 "기록 보기" → 공정 기록의 베일 탭 (일반 화면의 상단 바)
    await pickTab('베일');
    await scope.getByRole('link', { name: '기록 보기' }).click();
    await page.waitForURL((u) => u.pathname === '/records' && u.searchParams.get('tab') === 'bales');
    await page.getByRole('tab', { name: '베일', selected: true }).waitFor();
    await page.getByRole('region', { name: '베일 기록' }).waitFor({ timeout: 15_000 });
    assert.equal(await bar.getAttribute('data-topbar'), 'page');
    await shot('5-bales-record-link');

    // 5) 일반 화면: 같은 바가 흰 떠 있는 판으로 그려진다. 홈 전환은 없다. 사용자 메뉴(설정·화질, 폰은 CCTV, 로그아웃)
    await go('/robot');
    await page.getByRole('heading', { name: '로봇팔' }).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    assert.equal(await bar.getByRole('tab').count(), 0, '홈 전환은 홈에서만 있습니다');
    await shot('6-page');
    await bar.getByRole('button', { name: /메뉴$/ }).click();
    await page.getByRole('menu', { name: '사용자 메뉴' }).getByRole('menuitem', { name: '로그아웃' }).waitFor();
    await shot('7-user-menu');
    await page.keyboard.press('Escape');

    // 6) 3D 홈을 다시 열면 표는 접힌 채(기기에 기억). 그다음 대시보드: 전환이 앱 상단 바 가운데 칸에 들어간다
    if (!phone) await page.evaluate((key) => localStorage.setItem(key, '1'), COLLAPSED_KEY);
    await go('/');
    await page.locator('.st-root, [aria-label="상태 요약"]').first().waitFor({ timeout: 60_000 });
    if (await page.locator('.st-root').count()) {
      await home3d();
      if (!phone) {
        await table.getByRole('button', { name: /공정 기록 표 펼치기/ }).waitFor();
        console.log(`✓ ${size} 3D 홈을 다시 열어도 표는 접힌 채`);
      }
      await bar.getByRole('tab', { name: '대시보드' }).dispatchEvent('click');
    } else console.log(`- ${size}: 3D를 다시 만들지 못해(소프트웨어 그래픽) 접힘 기억 확인은 건너뜀 (단위 테스트가 본다)`);
    await page.getByRole('region', { name: '상태 요약' }).waitFor({ timeout: 30_000 });
    assert.equal(await bar.getAttribute('data-topbar'), 'page');
    assert.equal(await bar.getByRole('tab', { name: '대시보드', selected: true }).count(), 1, '대시보드의 전환이 상단 바에 없습니다');
    await shot('8-dashboard');
    await context.close();
  }
  console.log(`스크린샷: ${path.relative(root, out)}`);
} finally {
  await browser?.close();
  app.stop();
  mock.stop();
}
