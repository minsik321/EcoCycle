// 베일 적치(남동 구역)·출하 장시간 점검: /scene-demo를 실제 Chromium으로 오래 돌리며 마당이 한정되고 겹침이 없는지 5초마다 본다.
//   node scripts/yardSoak.mjs            (기본 10분, 앱 개발 서버를 스스로 띄운다. 로컬 Chromium 필요)
//   YARD_SOAK_MIN=1 node scripts/yardSoak.mjs   (분 단위로 줄여 시험)
// 월드 시계가 목표(분)에 이르면 1440×900과 390×844로 키워 "베일 적치" 구역의 스크린샷을 docs/screenshots/studio/site-layout/yard/에 둔다.
// 점검 값은 장면이 ?yardprobe 주소에서만 내주는 window.__yardAudit()(StudioScene)이다: 베일끼리·지게차와 베일·지게차끼리·지게차와 트럭·트럭끼리의 겹침, 칸 정합,
// 그리고 표의 "차량 N"(회사 안 차량, onSiteVehicles)과 장면의 회사 안 트럭 대수가 같은지 (5초마다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { findChromium, start } from './browserKit.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(appDir, '..');
const outDir = path.join(rootDir, 'docs', 'screenshots', 'studio', 'site-layout', 'yard');
const PORT = process.env.YARD_SOAK_PORT ?? '5197';
const MINUTES = Number(process.env.YARD_SOAK_MIN ?? 10);
const SAMPLE_MS = 5000;
/** 오래 돌리는 동안에는 작은 화면으로 둬서(소프트웨어 그래픽이라 큰 화면은 월드 시계가 실시간보다 훨씬 느리게 흐른다) 끝난 뒤 두 크기로 키워 찍는다 */
const SOAK_VIEW = { width: 240, height: 160 };
const SHOTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '390x844', width: 390, height: 844 },
];

const exe = findChromium();
if (!exe) {
  console.error('Chromium을 찾지 못했습니다. CHROMIUM_PATH에 실행 파일 경로를 주세요.');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const app = start('앱', ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', PORT, '--strictPort'], rootDir, {}, 'Local:');
let exitCode = 1;
let browser;
try {
  await app.ready;
  browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: SOAK_VIEW, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/scene-demo?tier=standard&yardprobe=1`);
  await page.waitForFunction(() => typeof window.__yardAudit === 'function', null, { timeout: 180_000 });
  const r = { samples: 0, maxStacked: 0, maxActive: 0, maxWaiting: 0, countMismatch: 0, countSamples: 0, problems: [], last: null };
  // 월드 시계(초)가 목표에 이를 때까지 돈다
  const goal = MINUTES * 60;
  const deadline = Date.now() + goal * 1000 * 6;
  for (;;) {
    await page.waitForTimeout(SAMPLE_MS);
    // 장면이 다시 만들어지는 짧은 동안(화질 단계 바뀜 등)에는 점검 함수가 잠깐 없다
    await page.waitForFunction(() => typeof window.__yardAudit === 'function', null, { timeout: 60_000 });
    const a = await page.evaluate(() => window.__yardAudit());
    if (r.samples % 12 === 0) console.log(`  월드 시계 ${a.t.toFixed(0)}초 남동 ${a.seStacked} 북서 ${a.nwStacked} 대기 ${a.waiting} 적치 ${a.stored} 옮김 ${a.transferred} 출하 ${a.shipped} 상차 ${a.loadedOut} 트럭 ${a.trucksOnSite}/${a.vehiclesOnSite}`);
    r.samples += 1;
    r.last = a;
    r.maxStacked = Math.max(r.maxStacked, a.stacked);
    r.maxActive = Math.max(r.maxActive, a.active);
    r.maxWaiting = Math.max(r.maxWaiting, a.waiting);
    const bad = a.baleOnBale + a.forkOnBale + a.forkOnFork + a.forkOnWall + a.forkOnTruck + a.truckOnTruck + a.slotErrors.length;
    if (bad > 0) r.problems.push(`t=${a.t.toFixed(0)}s 겹침/정합 ${JSON.stringify(a)}`);
    if (a.active > a.slots) r.problems.push(`t=${a.t.toFixed(0)}s 베일 ${a.active}개가 칸 ${a.slots}을 넘음`);
    // 표의 "차량 N"과 장면에 보이는 트럭 대수: 장면이 표와 같은 서버 값을 받은 표본(countStable)에서는 한 번도 어긋나면 안 된다
    if (a.countStable) {
      r.countSamples += 1;
      if (a.trucksOnSite !== a.vehiclesOnSite) {
        r.countMismatch += 1;
        r.problems.push(`t=${a.t.toFixed(0)}s 표의 차량 ${a.vehiclesOnSite}대 ≠ 장면 트럭 ${a.trucksOnSite}대`);
      }
    }
    if (a.t >= goal) break;
    if (Date.now() > deadline) {
      r.problems.push(`월드 시계가 너무 느리다: ${a.t.toFixed(0)}초 / ${goal}초`);
      break;
    }
  }
  // 두 크기로 키워 베일 적치 구역을 찍는다 (핀 이름이 장면에 놓이는 것을 기다린다)
  for (const shot of SHOTS) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.waitForTimeout(1500);
    // (소프트웨어 그래픽에서 장면이 무거워 클릭이 "안정될 때까지" 기다리다 멈추는 일이 있어 요소의 click()을 직접 부른다)
    await page.locator('.st-area-button').evaluate((el) => el.click());
    await page.getByRole('option', { name: /베일 적치/ }).first().evaluate((el) => el.click());
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(outDir, `yard-after-${MINUTES}min-${shot.name}.png`) });
  }
  await page.waitForFunction(() => typeof window.__yardAudit === 'function', null, { timeout: 60_000 });
  r.last = await page.evaluate(() => window.__yardAudit());
  await page.close();
  if (r.countSamples < r.samples * 0.9) r.problems.push(`차량 수를 견줄 수 있는 표본이 ${r.countSamples}/${r.samples}뿐이다`);
  exitCode = r.problems.length === 0 ? 0 : 1;
  console.log(`표본 ${r.samples}개, 트럭 대수 어긋남 ${r.countMismatch}번, 월드 시계 ${r.last.t.toFixed(0)}초, 최대 적치 ${r.maxStacked}, 최대 장면 베일 ${r.maxActive}, 최대 대기 ${r.maxWaiting}, 출하 ${r.last.shipped}, 입고 ${r.last.stored}, 칸 ${r.last.slotsUsed}/${r.last.slots}, 막힘 최대 ${r.last.maxBlockedSec.toFixed(1)}초`);
  if (r.problems.length > 0) console.error(r.problems.slice(0, 5).join('\n'));
  console.log(exitCode === 0 ? '✓ 마당이 한정된 채 돌고 겹침이 없다' : '✗ 점검 실패');
} catch (error) {
  console.error(String(error));
} finally {
  await browser?.close();
  app.stop();
}
process.exit(exitCode);
