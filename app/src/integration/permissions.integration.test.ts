// @vitest-environment node
// 통합 테스트: 권한 매트릭스(src/test/permissionMatrix.ts)의 모든 줄을 실제 모의 서버에 HTTP로 직접 불러 본다 (규칙 1: 권한은 서버가 판단한다).
//   명령 줄: 권한이 없는 역할 → 403. 권한이 있는 역할 → 403이 아니다(다른 이유의 거부는 허용).
//   조회 줄: 로그인한 모든 역할 → 200. 로그인하지 않으면 401.
//   표시 구분 줄(serverEnforced: false): 서버가 모든 역할에게 같은 값을 준다는 것을 확인한다.
// 화면·api 클라이언트 층은 permissionMatrix.test.tsx가 같은 표로 본다.
// 부작용을 피하려고 허용되는 조작은 일부러 검증에 실패하는 본문(422)이나 이미 그 상태라 거부되는 요청(409)으로 보내
// 권한 검사만 통과하는지 본다. 실행: npm run test:integration
import { beforeAll, describe, expect, it } from 'vitest';
import type { RecordPage, Role } from '@ecocycle/shared';
import { ROLE_PERMISSIONS } from '../../../mock-server/src/fixtures/accounts';
import { PERMISSION_MATRIX, ROLES, allowedFor } from '../test/permissionMatrix';
import type { MatrixRowId } from '../test/permissionMatrix';

const API = (process.env.VITE_API_BASE ?? 'http://localhost:4099/api/v1').replace(/\/$/, '');
const WS = (process.env.VITE_WS_BASE ?? 'ws://localhost:4099/ws/v1/stream').replace(/\/$/, '');

async function login(role: Role): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: role, password: '1234' }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** 서버는 접수 시점의 상태로 판단하고 0.6~1.2초 뒤에 실행한다. 다음 명령은 실행이 끝난 뒤에 보낸다. */
const SETTLE_MS = 1_800;

let keySeq = 0;
async function send(token: string, deviceId: string, body: object): Promise<Response> {
  return fetch(`${API}/devices/${deviceId}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': `perm-${Date.now()}-${keySeq++}` },
    body: JSON.stringify(body),
  });
}
const get = (token: string, path: string, method = 'GET') => fetch(`${API}${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });

/**
 * 명령 줄마다 "권한 검사는 통과하지만 실행은 되지 않는" 요청.
 * 서버는 종류·대상 → 권한 → 값 검증 → 현재 상태 순으로 판단한다. sideEffect는 허용되는 역할에서 실제로 실행되므로 아래에서 따로 다룬다.
 */
type Probe = { device: string; body: object; sideEffect?: true };
const PROBES: Partial<Record<MatrixRowId, Probe[]>> = {
  'cmd.run': [
    { device: 'conveyor-z', body: { type: 'start' } }, // 이미 가동 중이라 409
    { device: 'conveyor-z', body: { type: 'resume' } }, // 이미 가동 중이라 409
    { device: 'conveyor-z', body: { type: 'pause' }, sideEffect: true },
    { device: 'conveyor-z', body: { type: 'stop' }, sideEffect: true },
  ],
  'cmd.ack': [{ device: 'tank-a1', body: { type: 'ack_alarm', alarmId: 'none' } }], // 없는 알람이라 422
  'cmd.setting': [{ device: 'tank-a1', body: { type: 'update_setting', key: 'nope', value: 1, confirm: true } }], // 없는 설정이라 422
  'cmd.mode': [{ device: 'robot-1', body: { type: 'set_mode', mode: 'manual' } }], // confirm이 없어 422
  'cmd.pin': [{ device: 'robot-1', body: { type: 'set_mode', mode: 'auto_pinned', pinnedSectors: ['tank-a1'] } }], // confirm이 없어 422
  'cmd.pick': [{ device: 'robot-1', body: { type: 'pick_from', confirm: true } }], // tankId가 없어 422
  'cmd.place': [{ device: 'robot-1', body: { type: 'place_on_conveyor' } }], // confirm이 없어 422
  'cmd.batchMix': [{ device: 'compressor-1', body: { type: 'set_batch_mix' } }], // batchId가 없어 422
  'cmd.batchPressure': [{ device: 'compressor-1', body: { type: 'set_batch_pressure' } }],
  'cmd.batchPause': [
    { device: 'compressor-1', body: { type: 'pause_batch' } },
    { device: 'compressor-1', body: { type: 'resume_batch' } },
  ],
  'cmd.batchSkip': [{ device: 'compressor-1', body: { type: 'skip_batch' } }],
};

const now = Date.now();
const range = `from=${new Date(now - 30 * 86_400_000).toISOString()}&to=${new Date(now + 60_000).toISOString()}`;
const page = `${range}&page=1&pageSize=10`;
const ids = { vehicle: '', batch: '', bale: '' };

/** 조회 줄마다 화면이 부르는 조회 API (모두 200이어야 한다). POST는 앞에 "POST "를 붙인다 */
const READS: Partial<Record<MatrixRowId, () => string[]>> = {
  'view.home3d': () => ['/plant/summary', '/devices', '/process/state', `/plant/history?metric=balesToday&${range}&interval=1d`, '/robots/robot-1/model', '/alarms?state=active', 'POST /auth/ws-ticket'],
  'view.dashboard': () => ['/plant/summary', '/process/state', '/plant/kpi-history?metric=balesToday&range=today&timeZone=Asia/Seoul', '/plant/kpi-history?metric=averageMoisturePercent&range=7d'],
  'view.devices': () => [
    '/devices/tank-a1/state',
    `/devices/tank-a1/history?metric=level&${range}&interval=1d`,
    `/devices/tank-a1/unloads/records?${page}`,
    '/devices/robot-1/state',
    `/robots/robot-1/picks/records?${page}`,
    `/devices/conveyor-z/history?metric=load&${range}&interval=1d`,
    `/devices/compressor-1/history?metric=pressure&${range}&interval=1d`,
  ],
  'view.records': () => [`/vehicles/records?${page}`, `/batches/records?${page}&q=batch`, `/bales/records?${page}`, `/vehicles/${ids.vehicle}`, `/batches/${ids.batch}`, `/bales/${ids.bale}`],
  'view.batchBale': () => ['/batches/control', `/batches/events/records?${page}`],
  'view.alarms': () => ['/alarms', `/alarms?${range}&q=섹터`],
  'view.cctv': () => ['/cameras', '/cameras/cam-1/stream'],
  'view.settings': () => ['/me'],
};

beforeAll(async () => {
  const token = await login('admin');
  const first = async (path: string) => ((await (await get(token, `${path}?${page}`)).json()) as RecordPage<{ id: string }>).items[0]?.id ?? '';
  ids.vehicle = await first('/vehicles/records');
  ids.batch = await first('/batches/records');
  ids.bale = await first('/bales/records');
  expect(ids.vehicle && ids.batch && ids.bale, '모의 서버에 지난 기록이 있어야 한다').toBeTruthy();
});

describe('권한 매트릭스: 서버의 실제 차단 (모의 서버에 직접 HTTP)', () => {
  it('모든 줄에 서버 점검이 있다 (명령 줄은 그 줄의 명령을 모두, 조회 줄은 화면이 부르는 조회 API를)', () => {
    for (const row of PERMISSION_MATRIX) {
      if (row.commands.length > 0) {
        const types = new Set(PROBES[row.id]!.map((p) => (p.body as { type: string }).type));
        expect([...types].sort(), row.id).toEqual([...new Set(row.commands)].sort());
      } else if (row.serverEnforced) expect(READS[row.id], row.id).toBeDefined();
    }
  });

  for (const role of ROLES) {
    describe(role, () => {
      for (const row of PERMISSION_MATRIX) {
        const allowed = allowedFor(row, role);

        if (row.commands.length > 0) {
          for (const probe of PROBES[row.id]!) {
            const type = (probe.body as { type: string }).type;
            // 허용되지 않는 역할의 요청은 부작용이 없으므로 모두 점검한다. 허용되는 역할은 부작용 없는 요청만 (나머지는 아래에서)
            if (allowed && probe.sideEffect) continue;
            it(`${row.id} ${type}: ${allowed ? '권한으로 막지 않는다' : '403'}`, async () => {
              const res = await send(await login(role), probe.device, probe.body);
              if (allowed) expect(res.status).not.toBe(403);
              else {
                expect(res.status).toBe(403);
                expect(((await res.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN');
              }
            });
          }
        } else if (READS[row.id]) {
          it(`${row.id}: 조회 200`, async () => {
            const token = await login(role);
            for (const entry of READS[row.id]!()) {
              const [method, path] = entry.startsWith('POST ') ? ['POST', entry.slice(5)] : ['GET', entry];
              expect((await get(token, path, method)).status, `${role} ${entry}`).toBe(200);
            }
          });
        }
      }
    });
  }

  it('조회 API는 로그인하지 않으면 401이다 (권한 대신 로그인으로 막는다)', async () => {
    for (const read of Object.values(READS)) {
      for (const entry of read()) {
        const [method, path] = entry.startsWith('POST ') ? ['POST', entry.slice(5)] : ['GET', entry];
        expect((await get('', path, method)).status, entry).toBe(401);
      }
    }
    expect((await send('', 'compressor-1', { type: 'pause' })).status).toBe(401);
  });

  it('CCTV 정지 화면은 권한으로 막지 않는다 (모의 서버는 이미지가 없어 503)', async () => {
    for (const role of ROLES) expect((await get(await login(role), '/cameras/cam-1/snapshot')).status, role).toBe(503);
  });

  it('작업자의 일시정지·정지는 권한으로 막히지 않고 접수된다. 명령 결과 조회는 보낸 사람만 (압축기로 확인하고 되돌린다)', async () => {
    const operator = await login('operator');
    const viewer = await login('viewer');
    const admin = await login('admin');
    for (const type of ['pause', 'start', 'stop', 'start']) {
      const res = await send(operator, 'compressor-1', { type });
      expect(res.status, type).toBe(202);
      const { commandId } = (await res.json()) as { commandId: string };
      expect((await get(operator, `/commands/${commandId}`)).status).toBe(200);
      // 다른 사람의 명령 결과는 역할과 상관없이 403
      expect((await get(viewer, `/commands/${commandId}`)).status).toBe(403);
      expect((await get(admin, `/commands/${commandId}`)).status).toBe(403);
      await sleep(SETTLE_MS);
    }
  }, 30_000);

  it('로봇 진단(관절 값)은 표시 구분이다: 서버는 열람자에게도 robot-1.joints를 보낸다', async () => {
    const token = await login('viewer');
    const { ticket } = (await (await get(token, '/auth/ws-ticket', 'POST')).json()) as { ticket: string };
    const ws = new WebSocket(`${WS}?ticket=${ticket}`);
    try {
      const got = await new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(() => resolve(false), 40_000); // disconnect 시나리오의 침묵(25초)을 넘겨 기다린다
        ws.onerror = () => reject(new Error('WebSocket 오류'));
        ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', topics: ['robot-1.joints'] }));
        ws.onmessage = (event) => {
          if ((JSON.parse(String(event.data)) as { type: string }).type === 'robot.joints') {
            clearTimeout(timer);
            resolve(true);
          }
        };
      });
      expect(got).toBe(true);
    } finally {
      ws.close();
    }
  }, 45_000);

  it('서버가 알려 주는 /me의 권한 목록이 기준표(모의 서버 계정)와 같다', async () => {
    for (const role of ROLES) {
      const token = await login(role);
      const me = (await (await get(token, '/me')).json()) as { permissions: string[] };
      expect([...me.permissions].sort()).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });
});
