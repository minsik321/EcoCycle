// 통합 테스트 실행기: 모의 서버를 disconnect 시나리오로 띄우고, 통합 테스트(vitest)를 돌린 뒤,
// 앱(vite)을 띄워 실제 Chromium으로 자동 로그인 새로고침 점검(scripts/authReload.mjs)을 하고, 서버를 정리한다.
//   npm run test:integration
// 브라우저 점검은 내려받지 않는 Chromium이 필요하다(CHROMIUM_PATH 또는 Playwright 브라우저 폴더).
// 없는 컴퓨터에서는 INTEGRATION_SKIP_BROWSER=1로 그 부분만 건너뛸 수 있다(건너뛰었다고 표시한다).
// 브라우저 점검이 안정적인지 보려면 INTEGRATION_BROWSER_RUNS=5처럼 여러 번 잇달아 돌린다(기본 1번).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runAuthReload } from './authReload.mjs';
import { findChromium, start } from './browserKit.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(appDir, '..');
const PORT = process.env.INTEGRATION_PORT ?? '4099';
const APP_PORT = process.env.INTEGRATION_APP_PORT ?? '5199';
const APP_ORIGIN = `http://localhost:${APP_PORT}`;
const API_BASE = `http://localhost:${PORT}/api/v1`;
const WS_BASE = `ws://localhost:${PORT}/ws/v1/stream`;
// 리프레시 재사용 유예 시간(기본 30초)을 짧게 해 "유예 시간이 지난 재사용은 폐기"를 오래 기다리지 않고 본다
const REFRESH_GRACE_SEC = '3';

// 쿠키를 쓰는 요청은 출처를 명시해야 하므로 앱 주소를 허용 목록에 넣는다
const server = start(
  '모의 서버',
  ['run', 'start', '-w', '@ecocycle/mock-server', '--', '--scenario=disconnect'],
  rootDir,
  { PORT, CORS_ORIGINS: APP_ORIGIN, REFRESH_REUSE_GRACE_SEC: REFRESH_GRACE_SEC },
  '[mock-server]',
);
let app = null;
const stopAll = () => {
  app?.stop();
  server.stop();
};
process.on('SIGINT', () => {
  stopAll();
  process.exit(130);
});

let exitCode = 1;
try {
  await server.ready;
  const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.integration.config.ts'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ECOCYCLE_INTEGRATION: '1',
      VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
      VITE_API_BASE: API_BASE,
      VITE_WS_BASE: WS_BASE,
      INTEGRATION_APP_ORIGIN: APP_ORIGIN,
      INTEGRATION_REFRESH_GRACE_SEC: REFRESH_GRACE_SEC,
    },
  });
  exitCode = result.status ?? 1;

  console.log('\n— 자동 로그인 브라우저 점검 (새로고침·브라우저 다시 열기·로그아웃) —');
  const exe = findChromium();
  if (process.env.INTEGRATION_SKIP_BROWSER === '1') {
    console.log('⚠ 건너뜀 (INTEGRATION_SKIP_BROWSER=1)');
  } else if (!exe) {
    console.error('✗ Chromium을 찾지 못했습니다. CHROMIUM_PATH를 주거나 INTEGRATION_SKIP_BROWSER=1로 건너뛰세요.');
    exitCode = 1;
  } else {
    app = start(
      '앱',
      ['run', 'dev', '-w', '@ecocycle/app', '--', '--port', APP_PORT, '--strictPort'],
      rootDir,
      { VITE_API_BASE: API_BASE, VITE_WS_BASE: WS_BASE, VITE_USE_MOCK: 'true' },
      'Local:',
    );
    await app.ready;
    const runs = Math.max(1, Number(process.env.INTEGRATION_BROWSER_RUNS ?? 1) || 1);
    let failedRuns = 0;
    for (let run = 1; run <= runs; run += 1) {
      if (runs > 1) console.log(`
· 브라우저 점검 ${run}/${runs}`);
      const failures = await runAuthReload({ exe, appUrl: APP_ORIGIN, apiBase: API_BASE });
      console.log(failures.length ? `브라우저 점검 실패 ${failures.length}개` : '브라우저 점검 통과');
      if (failures.length) failedRuns += 1;
    }
    if (runs > 1) console.log(`브라우저 점검 ${runs}번 중 ${runs - failedRuns}번 통과`);
    if (failedRuns) exitCode = 1;
  }
} catch (error) {
  console.error(String(error));
  exitCode = 1;
} finally {
  stopAll();
}
process.exit(exitCode);
