// 3D 홈 첫 화면 시간 측정: 프로덕션 빌드를 모의 서버와 함께 띄우고, 폰(390×844)에 4G(약 4Mbps, 150ms)와 CPU 4배 느림을 걸어
// 로그인 버튼을 누른 때부터 ① 지표 칩에 숫자가 보일 때까지, ② 3D 첫 장이 그려질 때까지(준비 화면이 걷힐 때)를 잰다.
//   npm run measure:load            (약 3~5분, 빌드하고 서버를 스스로 띄운다)
// 로그인 화면에 머무는 시간 두 가지: 0초(저장된 비밀번호로 바로 누름), 4초(직접 입력). 각 RUNS번 재서 가운데 값을 적는다.
// 앱은 배포(Vercel)처럼 내준다: gzip 압축, Cache-Control: public, max-age=0, must-revalidate + ETag(바뀌지 않았으면 304), 없는 경로는 index.html.
// (vite preview는 압축하지 않아 3D 조각이 1.4MB로 오므로 실제보다 훨씬 느리게 잰다)
// LOADTIME_APP_DIR에 다른 앱 폴더(예: 이전 커밋을 풀어 둔 곳)를 주면 그 코드를 같은 조건으로 잰다(이전·이후 비교).
// 그래픽은 기본이 SwiftShader(소프트웨어)라 3D 첫 장 시간이 실제 폰보다 느리게 나온다. LOADTIME_GPU=1이면 이 컴퓨터의 GPU(D3D11)를 쓴다
// (데스크톱 GPU라 실제 폰보다 빠르게 나온다: 두 값 사이가 실제 폰이다). 지표 시간은 그래픽과 거의 무관하다.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = process.env.LOADTIME_APP_DIR ? path.resolve(process.env.LOADTIME_APP_DIR) : path.resolve(scriptDir, '..');
const rootDir = path.resolve(scriptDir, '..', '..');
const outDir = path.join(scriptDir, '.loadtime');
const MOCK_PORT = process.env.LOADTIME_MOCK_PORT ?? '4097';
const APP_PORT = process.env.LOADTIME_APP_PORT ?? '5197';
const RUNS = Number(process.env.LOADTIME_RUNS ?? 3);
const DWELLS = [0, 4000];
// 4G: 약 4Mbps 내려받기, 3Mbps 올리기, 150ms 지연
const NETWORK = { offline: false, latency: 150, downloadThroughput: (4e6 / 8) | 0, uploadThroughput: (3e6 / 8) | 0, connectionType: 'cellular4g' };

// 페이지 안: 로그인 제출 시각, 지표 숫자가 처음 보인 시각, 3D 첫 장(캔버스가 있고 준비 화면이 없음) 시각을 적는다
function probe() {
  const t = { submit: null, kpi: null, frame: null };
  window.__loadtime = t;
  document.addEventListener('submit', () => (t.submit ??= performance.now()), true);
  const check = () => {
    if (t.submit === null) return;
    if (t.kpi === null) {
      const value = document.querySelector('.st-kpi-value');
      if (value && /\d/.test(value.textContent ?? '') && value.getBoundingClientRect().height > 0) t.kpi = performance.now();
    }
    if (t.frame === null && document.querySelector('.st-canvas canvas') && !document.querySelector('.st-poster')) t.frame = performance.now();
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  const tick = () => {
    check();
    if (t.kpi === null || t.frame === null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function once(browser, dwell) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await context.addInitScript(() => localStorage.setItem('ecocycle.homeMode', '3d'));
  await context.addInitScript(probe);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  // 로그인 화면에서 받기 시작한 JS를 로그인 뒤 새 요청으로 처음부터 또 받았는지 (캐시·받는 중인 것을 이어 썼으면 0)
  // 로그인 전에 시작한 요청이 로그인 뒤에 끝나는 것은 같은 한 번이라 세지 않는다. 304(바뀌지 않음 확인)도 세지 않는다
  let loggedIn = false;
  const early = new Set();
  const late = new Set();
  let refetched = 0;
  cdp.on('Network.requestWillBeSent', ({ requestId, request }) => {
    if (!loggedIn) early.add(request.url);
    else if (early.has(request.url)) late.add(requestId);
  });
  cdp.on('Network.responseReceived', ({ requestId, response }) => {
    if (late.has(requestId) && /\/assets\/.*\.js$/.test(response.url) && response.status === 200 && !response.fromDiskCache && !response.fromPrefetchCache && !response.fromMemoryCache) refetched += 1;
  });
  await cdp.send('Network.emulateNetworkConditions', NETWORK);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // 로그인 화면을 처음 여는 시간은 재지 않는다 (요청은 "로그인 뒤"부터)
  await page.goto(`http://localhost:${APP_PORT}/login`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.getByLabel('아이디').waitFor();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.waitForTimeout(dwell);
  const beforeLogin = requests.filter((u) => u.includes(`:${MOCK_PORT}`)).length;
  const prefetched = requests.filter((u) => u.includes(`:${APP_PORT}/`)).map((u) => new URL(u).pathname);
  await page.getByLabel('아이디').fill('admin');
  await page.getByLabel('비밀번호').fill('mock-admin');
  loggedIn = true;
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForFunction(() => window.__loadtime.kpi !== null && window.__loadtime.frame !== null, null, { timeout: 120_000, polling: 100 });
  const t = await page.evaluate(() => window.__loadtime);
  await context.close();
  return { kpi: t.kpi - t.submit, frame: t.frame - t.submit, beforeLogin, prefetched, refetched };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.txt': 'text/plain' };
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt', '.wasm', '.glb']);

/** 배포처럼 내주는 정적 서버 (압축본은 한 번 만들어 기억한다) */
function serveStatic(dir, port) {
  const cache = new Map();
  const load = (file) => {
    if (!cache.has(file)) {
      const raw = fs.readFileSync(file);
      const ext = path.extname(file);
      const body = COMPRESS.has(ext) ? zlib.gzipSync(raw, { level: 6 }) : raw;
      cache.set(file, { body, gzip: COMPRESS.has(ext), type: TYPES[ext] ?? 'application/octet-stream', etag: `"${createHash('sha1').update(raw).digest('hex').slice(0, 16)}"` });
    }
    return cache.get(file);
  };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(dir, pathname);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
    const entry = load(file);
    const headers = { 'Content-Type': entry.type, 'Cache-Control': 'public, max-age=0, must-revalidate', ETag: entry.etag };
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers).end();
      return;
    }
    if (entry.gzip) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, { ...headers, 'Content-Length': entry.body.length }).end(entry.body);
  });
  return new Promise((resolve) => server.listen(Number(port), () => resolve(server)));
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const exe = findChromium();
if (!exe) {
  console.error('Chromium을 찾지 못했습니다. CHROMIUM_PATH에 실행 파일 경로를 주세요.');
  process.exit(2);
}
const dist = path.join(outDir, 'dist');
console.log('프로덕션 빌드…');
const built = spawnSync('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir'], {
  cwd: appDir,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, VITE_API_BASE: `http://localhost:${MOCK_PORT}/api/v1`, VITE_WS_BASE: `ws://localhost:${MOCK_PORT}/ws/v1/stream`, VITE_USE_MOCK: 'true' },
});
if (built.status !== 0) process.exit(1);

const mock = start('모의 서버', ['run', 'start', '-w', '@ecocycle/mock-server'], rootDir, { PORT: MOCK_PORT, CORS_ORIGINS: `http://localhost:${APP_PORT}` }, '[mock-server]');
let exitCode = 1;
let browser;
let appServer;
try {
  appServer = await serveStatic(dist, APP_PORT);
  await mock.ready;
  const gpu = process.env.LOADTIME_GPU === '1' ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ executablePath: exe, args: [...gpu, '--ignore-gpu-blocklist'] });
  const rows = [];
  for (const dwell of DWELLS) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) {
      const r = await once(browser, dwell);
      runs.push(r);
      console.log(`  로그인 화면 ${dwell / 1000}초 · ${i + 1}회: 지표 ${Math.round(r.kpi)}ms, 3D 첫 장 ${Math.round(r.frame)}ms, 로그인 전 API 요청 ${r.beforeLogin}개, 미리 받은 JS를 또 받음 ${r.refetched}번`);
      if (i === 0 && r.prefetched.length) console.log(`    로그인 화면에서 받은 정적 파일: ${r.prefetched.filter((p) => p !== '/login').join(', ')}`);
    }
    rows.push({ dwell, kpi: median(runs.map((r) => r.kpi)), frame: median(runs.map((r) => r.frame)), apiBeforeLogin: Math.max(...runs.map((r) => r.beforeLogin)) });
  }
  console.log('\n로그인 화면에 머문 시간 | 지표 보임(가운데 값) | 3D 첫 장(가운데 값) | 로그인 전 API 요청');
  for (const r of rows) console.log(`${r.dwell / 1000}초 | ${Math.round(r.kpi)}ms | ${Math.round(r.frame)}ms | ${r.apiBeforeLogin}`);
  fs.writeFileSync(path.join(outDir, `result-${process.env.LOADTIME_LABEL ?? 'current'}.json`), JSON.stringify(rows, null, 2));
  exitCode = 0;
} catch (error) {
  console.error(String(error));
} finally {
  await browser?.close();
  appServer?.close();
  mock.stop();
}
process.exit(exitCode);
