import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { ACCOUNTS } from '../src/fixtures/accounts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), 'ecocycle-env-'));
try {
  mkdirSync(join(fixture, 'src'));
  copyFileSync(fileURLToPath(new URL('../src/config.ts', import.meta.url)), join(fixture, 'src/config.mts'));
  writeFileSync(join(fixture, '.env'), 'PORT=15439\nAPI_BASE_PATH=/from-file\nWS_PATH=/file-stream\n');
  const env = { ...process.env };
  for (const key of ['PORT', 'API_BASE_PATH', 'WS_PATH']) delete env[key];
  const loaded = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `const {config}=await import(${JSON.stringify(pathToFileURL(join(fixture, 'src/config.mts')).href)}); console.log(JSON.stringify(config))`], { cwd: root, encoding: 'utf8', env });
  assert.equal(loaded.status, 0, loaded.stderr);
  const fromFile = JSON.parse(loaded.stdout);
  assert.equal(fromFile.port, 15439);
  assert.equal(fromFile.apiBasePath, '/from-file');
  assert.equal(fromFile.wsPath, '/file-stream');
} finally {
  // mkdtemp로 이 검사에서 생성한 임시 폴더만 정리한다.
  rmSync(fixture, { recursive: true, force: true });
}

const probe = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
  "const {config}=await import('./mock-server/src/config.ts'); console.log(JSON.stringify(config))"], {
  cwd: root, encoding: 'utf8', env: { ...process.env, PORT: '14328', API_BASE_PATH: '/custom/api/', WS_PATH: '/custom/stream' },
});
assert.equal(probe.status, 0, probe.stderr);
const config = JSON.parse(probe.stdout);
assert.equal(config.port, 14328);
assert.equal(config.apiBasePath, '/custom/api');
assert.equal(config.refreshCookiePath, '/custom/api/auth');
assert.equal(config.wsPath, '/custom/stream');

const server = spawn(process.execPath, ['--import', 'tsx', 'mock-server/src/index.ts'], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '14328', HOST: '127.0.0.1', API_BASE_PATH: '/custom/api', WS_PATH: '/custom/stream', CORS_ORIGINS: 'https://example.vercel.app', REFRESH_COOKIE_SAMESITE: 'none' },
});
try {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('서버 시작 시간 초과')), 15000);
    server.stdout.on('data', (data) => {
      if (String(data).includes('[mock-server]')) { clearTimeout(timeout); resolve(); }
    });
    server.once('error', reject);
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`서버 종료: ${code}`)); });
  });
  const base = 'http://127.0.0.1:14328/custom/api';
  const account = ACCOUNTS[0]!;
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.vercel.app' },
    body: JSON.stringify({ id: account.id, password: account.password, refreshTokenDelivery: 'cookie' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://example.vercel.app');
  assert.match(response.headers.get('set-cookie')!, /Path=\/custom\/api\/auth/);
  assert.match(response.headers.get('set-cookie')!, /SameSite=None/i);
  const { accessToken } = await response.json() as { accessToken: string };
  const ticketResponse = await fetch(`${base}/auth/ws-ticket`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(ticketResponse.status, 200);
  const { ticket } = await ticketResponse.json() as { ticket: string };
  const ws = new WebSocket(`ws://127.0.0.1:14328/custom/stream?ticket=${ticket}`);
  try { await once(ws, 'open', { signal: AbortSignal.timeout(5000) }); } finally { ws.close(); }
  console.log('환경변수 우선순위, 사용자 API 경로, 쿠키 경로·SameSite, CORS, WebSocket 연결 통과');
} finally {
  const stopped = once(server, 'exit');
  server.kill();
  await stopped;
}
