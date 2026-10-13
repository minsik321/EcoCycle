// 통합 테스트 실행기: 모의 서버를 disconnect 시나리오로 띄우고, 통합 테스트를 돌린 뒤, 서버를 정리한다.
//   npm run test:integration
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootDir = path.resolve(appDir, '..');
const PORT = process.env.INTEGRATION_PORT ?? '4099';
const isWindows = process.platform === 'win32';

const server = spawn('npm', ['run', 'start', '-w', '@ecocycle/mock-server', '--', '--scenario=disconnect'], {
  cwd: rootDir,
  shell: true,
  detached: !isWindows,
  env: { ...process.env, PORT },
});

function stopServer() {
  if (!server.pid) return;
  if (isWindows) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-server.pid);
    } catch {
      // 이미 끝났다
    }
  }
}

process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('모의 서버가 20초 안에 시작되지 않았습니다.')), 20_000);
  server.stdout.on('data', (chunk) => {
    const text = String(chunk);
    process.stdout.write(`[mock] ${text}`);
    if (text.includes('[mock-server]')) {
      clearTimeout(timer);
      resolve(undefined);
    }
  });
  server.stderr.on('data', (chunk) => process.stderr.write(`[mock] ${chunk}`));
  server.on('exit', (code) => reject(new Error(`모의 서버가 먼저 끝났습니다 (코드 ${code}).`)));
});

let exitCode = 1;
try {
  await ready;
  const result = spawnSync('npx', ['vitest', 'run', '--config', 'vitest.integration.config.ts'], {
    cwd: appDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ECOCYCLE_INTEGRATION: '1',
      VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
      VITE_API_BASE: `http://localhost:${PORT}/api/v1`,
      VITE_WS_BASE: `ws://localhost:${PORT}/ws/v1/stream`,
    },
  });
  exitCode = result.status ?? 1;
} catch (error) {
  console.error(String(error));
} finally {
  stopServer();
}
process.exit(exitCode);
