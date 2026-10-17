// 떠 있는 상단 바와 사이드바 폭이 3D 홈·대시보드·공정 기록에서 같은지 실제 모의 서버·브라우저로 확인하고,
// 세 화면을 나란히 붙인 비교 이미지를 남긴다(1440×900·820×1180·390×844).
// 바: 화면 가장자리에서 떨어진 거리·높이·모서리·그림자가 세 화면에서 같고, 내용은 바 아래 같은 간격에서 시작한다.
// 사이드바: 세 화면에서 폭이 같고(태블릿 기본 아이콘만, 데스크톱 기본 펼침), 접기·펼치기는 3D 홈을 포함해 모든 화면에 이어진다(기기에 기억).
// 결과는 docs/screenshots/floating-bar. 실행: node app/scripts/floatingBar.mjs (로컬 Chromium 필요)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.join(root, 'docs/screenshots/floating-bar');
fs.mkdirSync(out, { recursive: true });
const api = 'http://localhost:14021/api/v1';
const origin = 'http://localhost:15221';
const mock = start('mock', ['run', 'start', '-w', '@ecocycle/mock-server'], root, { PORT: '14021', CORS_ORIGINS: origin }, '[mock-server]');
const app = start('app', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', '15221', '--strictPort'], root, { VITE_API_BASE: api, VITE_WS_BASE: 'ws://localhost:14021/ws/v1/stream', VITE_USE_MOCK: 'true' }, 'Local:');

/** 바·사이드바·내용의 자리. 바의 거리는 내용 칸(사이드바 오른쪽) 기준 */
const measure = (page) =>
  page.evaluate(() => {
    const bar = document.querySelector('header[data-topbar]');
    const nav = document.querySelector('nav[aria-label="주 메뉴"]');
    const column = bar.closest('.isolate') ?? bar.parentElement;
    const b = bar.getBoundingClientRect();
    const c = column.getBoundingClientRect();
    const style = getComputedStyle(bar);
    return {
      kind: bar.dataset.topbar,
      left: Math.round(b.left - c.left),
      right: Math.round(c.right - b.right),
      top: Math.round(b.top - c.top),
      height: Math.round(b.height),
      radius: style.borderTopLeftRadius,
      shadow: style.boxShadow !== 'none',
      navWidth: Math.round(nav.getBoundingClientRect().width),
      collapsed: nav.hasAttribute('data-collapsed'),
    };
  });

/** 보이는 내용(화면 읽기용 글 제외)이 바 아래 얼마나 떨어져 시작하는지 */
const contentGap = (page) =>
  page.evaluate(() => {
    const bar = document.querySelector('header[data-topbar]').getBoundingClientRect();
    const tops = [...document.querySelectorAll('main *')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 40 && r.height > 16).map((r) => r.top);
    return Math.round(Math.min(...tops) - bar.bottom);
  });

let browser;
try {
  await Promise.all([mock.ready, app.ready]);
  browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [width, height, size] of [
    [1440, 900, 'desktop'],
    [820, 1180, 'tablet'],
    [390, 844, 'phone'],
  ]) {
    const phone = width < 768;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    await context.addInitScript(() => {
      if (!sessionStorage.getItem('floating')) {
        sessionStorage.setItem('floating', '1');
        localStorage.setItem('ecocycle.homeMode', '3d');
        localStorage.removeItem('ecocycle.sidebar');
      }
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    await page.goto(`${origin}/login`);
    await page.getByLabel('아이디').fill('admin');
    await page.getByLabel('비밀번호').fill('1234');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');
    const go = async (route) => {
      await page.evaluate((r) => {
        window.history.pushState({}, '', r);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route);
      await page.waitForTimeout(300);
    };
    const bar = page.locator('header[data-topbar]');
    const shot = async (name) => {
      await page.waitForTimeout(600);
      const file = path.join(out, `${size}-${name}.png`);
      await page.screenshot({ path: file });
      console.log(`✓ ${size} ${name}`);
      return file;
    };

    // 1) 3D 홈
    await page.waitForSelector('.st-root', { timeout: 30_000 });
    await page.waitForFunction(() => !document.querySelector('.st-poster'), null, { timeout: 90_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const m3d = await measure(page);
    assert.equal(m3d.kind, 'overlay');
    const files = [await shot('1-home-3d')];

    // 2) 대시보드 홈 (전환은 바 가운데 칸)
    await bar.getByRole('tab', { name: '대시보드' }).dispatchEvent('click');
    await page.getByRole('region', { name: '상태 요약' }).waitFor({ timeout: 30_000 });
    const mDash = await measure(page);
    assert.equal(mDash.kind, 'page');
    const dashGap = await contentGap(page);
    files.push(await shot('2-home-dashboard'));

    // 3) 공정 기록
    await go('/records');
    await page.getByRole('tab', { name: '차량', selected: true }).waitFor({ timeout: 15_000 });
    const mRec = await measure(page);
    const recGap = await contentGap(page);
    files.push(await shot('3-records'));

    // 세 화면의 바와 사이드바가 같다
    const shape = ({ left, right, top, height, radius, shadow, navWidth, collapsed }) => ({ left, right, top, height, radius, shadow, navWidth, collapsed });
    console.log(`  3D ${JSON.stringify(m3d)}\n  대시보드 ${JSON.stringify(mDash)} 내용 간격 ${dashGap}px\n  공정 기록 ${JSON.stringify(mRec)} 내용 간격 ${recGap}px`);
    assert.deepEqual(shape(mDash), shape(m3d), '대시보드의 바·사이드바가 3D 홈과 다릅니다');
    assert.deepEqual(shape(mRec), shape(m3d), '공정 기록의 바·사이드바가 3D 홈과 다릅니다');
    assert.equal(m3d.height, 56);
    assert.equal(dashGap, m3d.top, '대시보드 내용이 바 아래 같은 간격에서 시작하지 않습니다');
    assert.equal(recGap, m3d.top, '공정 기록 내용이 바 아래 같은 간격에서 시작하지 않습니다');
    if (!phone) assert.equal(m3d.collapsed, width < 1280, '사이드바 기본값: 태블릿은 아이콘만, 데스크톱은 펼침');

    // 사이드바 접기·펼치기는 3D 홈에도 이어진다 (기기에 기억). 확인 뒤 기본값으로 되돌린다
    if (!phone) {
      const toggle = page.getByRole('navigation', { name: '주 메뉴' }).getByRole('button', { name: /메뉴 (접기|펼치기)/ });
      await toggle.click();
      const flipped = (await measure(page)).collapsed;
      assert.equal(flipped, !m3d.collapsed);
      await go('/');
      await page.locator('.st-root, [aria-label="상태 요약"]').first().waitFor({ timeout: 60_000 });
      await bar.getByRole('tab', { name: '3D' }).dispatchEvent('click');
      await page.waitForSelector('.st-root', { timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(800);
      assert.equal((await measure(page)).collapsed, flipped, '3D 홈에서 고른 사이드바 상태가 이어지지 않습니다');
      assert.equal(await page.evaluate(() => localStorage.getItem('ecocycle.sidebar')), flipped ? 'collapsed' : 'expanded');
      console.log(`✓ ${size} 사이드바 ${flipped ? '접기' : '펼치기'}가 3D 홈에도 이어지고 기기에 기억된다`);
    }
    await context.close();

    // 세 장을 나란히 (바를 비교하기 쉽게 같은 크기로)
    const scale = phone ? 1 : width > 1000 ? 0.5 : 0.6;
    const html = `<html><body style="margin:0;background:#d9dde4;font:600 15px system-ui;display:flex;gap:16px;padding:16px">${files
      .map(
        (file, i) =>
          `<figure style="margin:0"><figcaption style="padding:0 0 8px">${['3D 홈', '대시보드 홈', '공정 기록'][i]}</figcaption><img src="${pathToFileURL(file).href}" style="display:block;width:${Math.round(width * scale)}px;box-shadow:0 2px 8px #0003"></figure>`,
      )
      .join('')}</body></html>`;
    const sheet = path.join(out, `.${size}.html`);
    fs.writeFileSync(sheet, html);
    const viewer = await browser.newPage({ viewport: { width: Math.round(width * scale) * 3 + 16 * 4, height: Math.round(height * scale) + 64 } });
    await viewer.goto(pathToFileURL(sheet).href);
    await viewer.waitForTimeout(300);
    await viewer.screenshot({ path: path.join(out, `${size}-side-by-side.png`), fullPage: true });
    await viewer.close();
    fs.rmSync(sheet);
    console.log(`✓ ${size} side-by-side`);
  }
  console.log(`스크린샷: ${path.relative(root, out)}`);
} finally {
  await browser?.close();
  app.stop();
  mock.stop();
}
