// 3D 홈 준비 화면의 포스터 두 장(app/public/studio/poster-wide.jpg, poster-tall.jpg)을 다시 찍는다.
//   npm run poster            (약 1분, 앱 개발 서버를 스스로 띄운다. 모의 서버는 쓰지 않는다)
// /scene-demo?poster=1 은 빈 장면만 그린다(PosterStudio: 데이터 없음, 로봇 기본 자세, 패널·핀·글자 없음).
// 포스터는 로그인 화면에서 미리 받는 공개 파일이므로 번호판·회사 이름·숫자 같은 실시간 값이 들어가면 안 된다.
// 장면을 크게 바꾸면 다시 찍는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(appDir, '..');
const outDir = path.join(appDir, 'public', 'studio');
const APP_PORT = process.env.POSTER_APP_PORT ?? '5196';

/** 이름 · 화면 크기 (세로 화면은 tall, 가로 화면은 wide를 쓴다: StudioView의 <picture>) */
const POSTERS = [
  ['poster-wide.jpg', 960, 600],
  ['poster-tall.jpg', 546, 786],
];
/** 카메라가 부지 전체에서 기본 구역으로 들어오는 시간 (이만큼 기다린 뒤 찍는다) */
const SETTLE_MS = 4000;

const exe = findChromium();
if (!exe) {
  console.error('Chromium을 찾지 못했습니다. CHROMIUM_PATH에 실행 파일 경로를 주세요.');
  process.exit(2);
}
const app = start('앱', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', APP_PORT, '--strictPort'], rootDir, {}, 'Local:');
let exitCode = 1;
let browser;
try {
  await app.ready;
  browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, width, height] of POSTERS) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${APP_PORT}/scene-demo?poster=1&tier=high`);
    await page.waitForSelector('[data-poster-ready]', { timeout: 120_000 });
    await page.waitForTimeout(SETTLE_MS);
    // 화면에 글자가 하나도 없어야 한다 (패널·핀·문구가 끼어들면 멈춘다)
    const text = await page.evaluate(() => document.body.innerText.trim());
    if (text) throw new Error(`포스터 화면에 글자가 있습니다: "${text.slice(0, 80)}"`);
    const file = path.join(outDir, name);
    await page.locator('.st-canvas canvas').screenshot({ path: file, type: 'jpeg', quality: 72 });
    console.log(`✓ ${name} ${width}×${height} · ${Math.round(fs.statSync(file).size / 1024)}KB`);
    await page.close();
  }
  exitCode = 0;
} catch (error) {
  console.error(String(error));
} finally {
  await browser?.close();
  app.stop();
}
process.exit(exitCode);
