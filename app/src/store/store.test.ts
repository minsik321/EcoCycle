import { describe, expect, it, vi } from 'vitest';
import type { Alarm, DeviceState, Me, PlantSummary, TankState } from '@ecocycle/shared';
import * as api from '../api';
import {
  alarmReceived,
  alarmsReplaced,
  connectionChanged,
  createAppStore,
  deviceSelected,
  devicesReceived,
  loginUser,
  logoutUser,
  plantReceived,
  sessionLost,
} from './index';
import {
  selectActiveAlarmCount,
  selectAlarmsForDevice,
  selectCan,
  selectCanCommand,
  selectIsDisconnected,
  selectOpenAlarms,
  selectTanks,
} from './selectors';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  login: vi.fn(),
  logout: vi.fn(),
  restoreSession: vi.fn(),
}));

const operator: Me = { id: 'operator', name: '작업자', role: 'operator', permissions: ['robot.control', 'alarm.ack'] };
const viewer: Me = { id: 'viewer', name: '열람자', role: 'viewer', permissions: [] };

const tank = (id: TankState['id'], fill: number, updatedAt: string): TankState => ({
  id,
  type: 'tank',
  section: 'A1',
  status: 'normal',
  fillPercent: fill,
  volumeM3: 1,
  capacityM3: 8,
  moisturePercent: 10,
  updatedAt,
});

const alarm = (id: string, state: Alarm['state'], ts: string, deviceId: Alarm['deviceId'] = 'tank-a1'): Alarm => ({
  id,
  level: 'caution',
  deviceId,
  message: '적재율 80% 초과',
  state,
  ts,
});

const summary = (fill: number, updatedAt: string): PlantSummary => ({
  averageMoisturePercent: 10,
  totalFillPercent: fill,
  status: 'normal',
  updatedAt,
});

async function loggedInStore(me: Me = operator) {
  vi.mocked(api.login).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: me });
  const store = createAppStore();
  await store.dispatch(loginUser({ id: me.id, password: 'x' }));
  return store;
}

describe('auth', () => {
  it('처음에는 세션을 확인하는 중(unknown)이다', () => {
    expect(createAppStore().getState().auth.status).toBe('unknown');
  });

  it('로그인하면 me와 권한이 들어온다', async () => {
    const store = await loggedInStore();
    expect(store.getState().auth).toMatchObject({ status: 'loggedIn', me: operator, loginPending: false, loginError: null });
  });

  it('로그인이 실패하면 오류(코드, 상태, 대기 시간)를 남기고 로그인되지 않는다', async () => {
    vi.mocked(api.login).mockRejectedValue(new api.ApiError(429, 'TOO_MANY_REQUESTS', '시도가 너무 많습니다.', 60));
    const store = createAppStore();
    await store.dispatch(loginUser({ id: 'operator', password: 'bad' }));
    expect(store.getState().auth.status).toBe('unknown');
    expect(store.getState().auth.loginError).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: '시도가 너무 많습니다.',
      status: 429,
      retryAfterSec: 60,
    });
  });

  it('로그아웃하면 모든 슬라이스가 초기화되고 loggedOut이 된다', async () => {
    vi.mocked(api.logout).mockResolvedValue(undefined);
    const store = await loggedInStore();
    store.dispatch(devicesReceived([tank('tank-a1', 50, '2026-10-13T05:00:00.000Z')]));
    store.dispatch(alarmReceived(alarm('al-1', 'active', '2026-10-13T05:00:00.000Z')));
    store.dispatch(connectionChanged({ status: 'online', lastReceivedAt: '2026-10-13T05:00:00.000Z' }));
    store.dispatch(deviceSelected('robot-1'));

    await store.dispatch(logoutUser());

    const s = store.getState();
    expect(s.auth).toMatchObject({ status: 'loggedOut', me: null });
    expect(s.devices.byId).toEqual({});
    expect(s.alarms.byId).toEqual({});
    expect(s.connection).toEqual({ status: 'offline', lastReceivedAt: null });
    expect(s.ui.selectedDeviceId).toBeNull();
  });

  it('서버 로그아웃 요청이 실패해도 기기에서는 로그아웃된다', async () => {
    vi.mocked(api.logout).mockRejectedValue(new api.ApiError(0, 'NETWORK_ERROR', ''));
    const store = await loggedInStore();
    await store.dispatch(logoutUser());
    expect(store.getState().auth.status).toBe('loggedOut');
  });

  it('토큰 갱신이 거부되어 세션을 잃으면 초기화되고 loggedOut이 된다', async () => {
    const store = await loggedInStore();
    store.dispatch(devicesReceived([tank('tank-a1', 50, '2026-10-13T05:00:00.000Z')]));
    store.dispatch(sessionLost());
    expect(store.getState().auth).toMatchObject({ status: 'loggedOut', me: null });
    expect(store.getState().devices.byId).toEqual({});
  });
});

describe('selectCan (권한 판단은 선택자 하나로)', () => {
  it('permissions 목록에 있는지만 본다', async () => {
    const store = await loggedInStore(operator);
    expect(selectCan('robot.control')(store.getState())).toBe(true);
    expect(selectCan('robot.manual')(store.getState())).toBe(false);
    expect(selectCanCommand('pause')(store.getState())).toBe(true);
    expect(selectCanCommand('set_mode')(store.getState())).toBe(false);
    expect(selectCanCommand('ack_alarm')(store.getState())).toBe(true);
  });

  it('role 이름이 아니라 permissions로 판단한다 (권한 종류가 바뀌어도 된다)', async () => {
    const custom: Me = { id: 'x', name: 'x', role: 'viewer', permissions: ['settings.write'] };
    const store = await loggedInStore(custom);
    expect(selectCanCommand('update_setting')(store.getState())).toBe(true);
    expect(selectCanCommand('start')(store.getState())).toBe(false);
  });

  it('로그인 전이나 열람자는 아무것도 할 수 없다', async () => {
    expect(selectCan('alarm.ack')(createAppStore().getState())).toBe(false);
    const store = await loggedInStore(viewer);
    expect(selectCanCommand('ack_alarm')(store.getState())).toBe(false);
  });
});

describe('devices, plant', () => {
  it('상태를 모아서 반영하고 선택자로 탱크만 순서대로 고른다', () => {
    const store = createAppStore();
    store.dispatch(
      devicesReceived([
        tank('tank-b1', 30, '2026-10-13T05:00:00.000Z'),
        tank('tank-a1', 72, '2026-10-13T05:00:00.000Z'),
      ]),
    );
    expect(selectTanks(store.getState()).map((t) => t.id)).toEqual(['tank-a1', 'tank-b1']);
  });

  it('더 오래된 값(늦게 도착한 REST 응답)은 최신 값을 덮어쓰지 않는다', () => {
    const store = createAppStore();
    store.dispatch(devicesReceived([tank('tank-a1', 80, '2026-10-13T05:00:10.000Z')]));
    store.dispatch(devicesReceived([tank('tank-a1', 70, '2026-10-13T05:00:05.000Z')]));
    expect((store.getState().devices.byId['tank-a1'] as TankState).fillPercent).toBe(80);

    store.dispatch(devicesReceived([tank('tank-a1', 81, '2026-10-13T05:00:10.000Z')])); // 같은 시각은 반영
    expect((store.getState().devices.byId['tank-a1'] as TankState).fillPercent).toBe(81);
  });

  it('요약도 더 오래된 값으로 덮어쓰지 않는다', () => {
    const store = createAppStore();
    store.dispatch(plantReceived(summary(60, '2026-10-13T05:00:10.000Z')));
    store.dispatch(plantReceived(summary(50, '2026-10-13T05:00:00.000Z')));
    expect(store.getState().plant.summary?.totalFillPercent).toBe(60);
  });

  it('서버가 보낸 status를 그대로 쓴다 (판정하지 않는다)', () => {
    const store = createAppStore();
    const d: DeviceState = { ...tank('tank-a1', 10, '2026-10-13T05:00:00.000Z'), status: 'alarm' };
    store.dispatch(devicesReceived([d]));
    expect(store.getState().devices.byId['tank-a1']?.status).toBe('alarm');
  });
});

describe('alarms', () => {
  it('열린 알람만 두고, 해제되면 지운다. 최신순으로 고른다', () => {
    const store = createAppStore();
    store.dispatch(alarmReceived(alarm('al-1', 'active', '2026-10-13T05:00:00.000Z', 'tank-a1')));
    store.dispatch(alarmReceived(alarm('al-2', 'active', '2026-10-13T05:01:00.000Z', 'tank-b2')));
    expect(selectOpenAlarms(store.getState()).map((a) => a.id)).toEqual(['al-2', 'al-1']);
    expect(selectActiveAlarmCount(store.getState())).toBe(2);
    expect(selectAlarmsForDevice('tank-a1')(store.getState()).map((a) => a.id)).toEqual(['al-1']);

    store.dispatch(alarmReceived(alarm('al-1', 'acknowledged', '2026-10-13T05:02:00.000Z')));
    expect(selectActiveAlarmCount(store.getState())).toBe(1);
    expect(selectOpenAlarms(store.getState())).toHaveLength(2); // 확인했어도 아직 열려 있다

    store.dispatch(alarmReceived(alarm('al-1', 'cleared', '2026-10-13T05:03:00.000Z')));
    expect(selectOpenAlarms(store.getState()).map((a) => a.id)).toEqual(['al-2']);
  });

  it('재동기화는 열린 알람 전체를 바꿔서 그동안 놓친 발생·해제를 맞춘다', () => {
    const store = createAppStore();
    store.dispatch(alarmReceived(alarm('old', 'active', '2026-10-13T05:00:00.000Z')));
    store.dispatch(alarmsReplaced([alarm('new', 'active', '2026-10-13T05:05:00.000Z'), alarm('gone', 'cleared', '2026-10-13T05:05:00.000Z')]));
    expect(Object.keys(store.getState().alarms.byId)).toEqual(['new']);
  });
});

describe('connection', () => {
  it('끊김과 마지막 수신 시각을 선택자로 판단한다 (컴포넌트에서 시간을 계산하지 않는다)', () => {
    const store = createAppStore();
    store.dispatch(connectionChanged({ status: 'connecting', lastReceivedAt: null }));
    expect(selectIsDisconnected(store.getState())).toBe(false); // 처음 연결 중은 끊김이 아니다
    store.dispatch(connectionChanged({ status: 'online', lastReceivedAt: '2026-10-13T05:00:00.000Z' }));
    expect(selectIsDisconnected(store.getState())).toBe(false);
    store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: '2026-10-13T05:00:20.000Z' }));
    expect(selectIsDisconnected(store.getState())).toBe(true);
    expect(store.getState().connection.lastReceivedAt).toBe('2026-10-13T05:00:20.000Z');
  });
});
