// @vitest-environment node
// 통합 테스트: 화면의 권한 표시와 서버의 실제 차단이 같은 기준표를 따르는지 실제 모의 서버로 확인한다 (규칙 1: 권한은 서버가 판단한다).
//   화면이 비활성으로 보여 주는 조작 → 서버가 403으로 막는다.
//   화면이 허용하는 조작            → 서버가 403으로 막지 않는다 (다른 이유의 거부는 허용).
// 부작용을 피하려고 허용되는 조작은 일부러 검증에 실패하는 본문(422)이나 이미 그 상태라 거부되는 요청(409)으로 보내
// 권한 검사만 통과하는지 본다. 실행: npm run test:integration
import { describe, expect, it } from 'vitest';
import { COMMAND_RULES } from '@ecocycle/shared';
import type { CommandType, Role } from '@ecocycle/shared';
import { ROLE_PERMISSIONS } from '../../../mock-server/src/fixtures/accounts';
import { canUse } from '../config/controls';

const API = (process.env.VITE_API_BASE ?? 'http://localhost:4099/api/v1').replace(/\/$/, '');
const ROLES: readonly Role[] = ['admin', 'operator', 'viewer'];

async function login(role: Role): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: role, password: `mock-${role}` }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** 서버는 접수 시점의 상태로 판단하고 0.6~1.2초 뒤에 실행한다. 다음 명령은 실행이 끝난 뒤에 보낸다. */
const SETTLE_MS = 1_800;

let keySeq = 0;
async function send(token: string, deviceId: string, body: object): Promise<number> {
  const res = await fetch(`${API}/devices/${deviceId}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': `perm-${Date.now()}-${keySeq++}` },
    body: JSON.stringify(body),
  });
  return res.status;
}

/**
 * 명령 종류마다 "권한 검사는 통과하지만 실행은 되지 않는" 요청.
 * 서버는 종류·대상 → 권한 → 값 검증 → 현재 상태 순으로 판단한다.
 */
const PROBES: Record<CommandType, { device: string; body: object }> = {
  start: { device: 'conveyor-z', body: { type: 'start' } }, // 이미 가동 중이라 409
  resume: { device: 'conveyor-z', body: { type: 'resume' } }, // 이미 가동 중이라 409
  pause: { device: 'conveyor-z', body: { type: 'pause' } }, // 아래에서 따로 다룬다 (실제로 실행된다)
  stop: { device: 'conveyor-z', body: { type: 'stop' } }, // 아래에서 따로 다룬다 (실제로 실행된다)
  set_mode: { device: 'robot-1', body: { type: 'set_mode', mode: 'manual' } }, // confirm이 없어 422
  pick_from: { device: 'robot-1', body: { type: 'pick_from', confirm: true } }, // tankId가 없어 422
  update_setting: { device: 'tank-a1', body: { type: 'update_setting', key: 'nope', value: 1, confirm: true } }, // 없는 설정이라 422
  ack_alarm: { device: 'tank-a1', body: { type: 'ack_alarm', alarmId: 'none' } }, // 없는 알람이라 422
};

describe('권한: 화면의 표시와 서버의 차단이 같다 (실제 모의 서버)', () => {
  for (const role of ROLES) {
    describe(role, () => {
      for (const type of Object.keys(COMMAND_RULES) as CommandType[]) {
        const allowed = canUse(ROLE_PERMISSIONS[role], type);
        const sideEffect = type === 'pause' || type === 'stop';

        // 허용되지 않는 역할의 요청은 부작용이 없으므로 모든 명령을 점검한다. 허용되는 역할은 부작용 없는 요청만 점검한다.
        if (allowed && sideEffect) continue;

        it(`${type}: ${allowed ? '서버가 권한으로 막지 않는다' : '서버가 403으로 막는다'}`, async () => {
          const token = await login(role);
          const status = await send(token, PROBES[type].device, PROBES[type].body);
          if (allowed) expect(status).not.toBe(403);
          else expect(status).toBe(403);
        });
      }
    });
  }

  it('작업자의 일시정지·정지는 권한으로 막히지 않고 결과가 있다 (압축기로 확인하고 되돌린다)', async () => {
    const token = await login('operator');
    for (const type of ['pause', 'start', 'stop', 'start']) {
      expect(await send(token, 'compressor-1', { type }), type).toBe(202);
      await sleep(SETTLE_MS);
    }
  }, 20_000);

  it('열람자는 어떤 조작도 할 수 없지만 조회는 할 수 있다', async () => {
    const token = await login('viewer');
    const headers = { Authorization: `Bearer ${token}` };
    for (const path of ['/devices', '/plant/summary', '/alarms', '/cameras']) {
      expect((await fetch(`${API}${path}`, { headers })).status, path).toBe(200);
    }
    expect(await send(token, 'compressor-1', { type: 'pause' })).toBe(403);
  });

  it('로그인하지 않으면 조회도 조작도 401이다', async () => {
    expect((await fetch(`${API}/devices`)).status).toBe(401);
    expect(await send('', 'compressor-1', { type: 'pause' })).toBe(401);
  });

  it('서버가 알려 주는 /me의 권한 목록이 기준표와 같다', async () => {
    for (const role of ROLES) {
      const token = await login(role);
      const me = (await (await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { permissions: string[] };
      expect([...me.permissions].sort()).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });
});
