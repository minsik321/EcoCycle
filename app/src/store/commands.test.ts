import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { commandResultReceived, createAppStore, sendDeviceCommand } from './index';
import { selectRecentCommands } from './selectors';
import { ADMIN, OPERATOR, VIEWER, makeStore } from '../test/utils';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  sendCommand: vi.fn(),
  getCommand: vi.fn(),
}));

const accepted = (commandId: string) => ({ idempotencyKey: 'k', accepted: { commandId, status: 'accepted' as const } });
const entryOf = (store: ReturnType<typeof createAppStore>, key: string) => store.getState().commands.byKey[key]!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api.sendCommand).mockReset();
  vi.mocked(api.getCommand).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sendDeviceCommand', () => {
  it('접수되면 accepted, WebSocket 결과가 오면 completed가 된다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue(accepted('cmd-1'));
    const store = makeStore({ me: ADMIN });

    const done = store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'pause' }, idempotencyKey: 'k1' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(entryOf(store, 'k1')).toMatchObject({ status: 'accepted', commandId: 'cmd-1', type: 'pause', deviceId: 'robot-1' });

    store.dispatch(commandResultReceived({ commandId: 'cmd-1', status: 'completed', reason: null }));
    await vi.advanceTimersByTimeAsync(200);
    await done;

    expect(entryOf(store, 'k1').status).toBe('completed');
    expect(api.getCommand).not.toHaveBeenCalled(); // WebSocket으로 받았으니 조회하지 않는다
    expect(api.sendCommand).toHaveBeenCalledWith('robot-1', { type: 'pause' }, { idempotencyKey: 'k1', permissions: ADMIN.permissions });
  });

  it('서버가 거부한 결과(rejected)와 이유를 그대로 둔다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue(accepted('cmd-2'));
    const store = makeStore({ me: ADMIN });
    const done = store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'pause' }, idempotencyKey: 'k2' }));
    await vi.advanceTimersByTimeAsync(0);
    store.dispatch(commandResultReceived({ commandId: 'cmd-2', status: 'rejected', reason: '작업 중입니다.' }));
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(entryOf(store, 'k2')).toMatchObject({ status: 'rejected', reason: '작업 중입니다.' });
  });

  it('HTTP 오류(403, 409, 422)는 보낸 즉시 거부로 기록하고 이유와 상태 코드를 남긴다', async () => {
    vi.mocked(api.sendCommand).mockRejectedValue(new api.ApiError(409, 'CONFLICT', '이미 작동 중입니다.'));
    const store = makeStore({ me: ADMIN });
    const key = await store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'start' }, idempotencyKey: 'k3' })).unwrap();
    expect(key).toBe('k3');
    expect(entryOf(store, 'k3')).toMatchObject({ status: 'rejected', reason: '이미 작동 중입니다.', httpStatus: 409, commandId: null });
  });

  it('네트워크 오류는 상태 코드 0으로 기록한다', async () => {
    vi.mocked(api.sendCommand).mockRejectedValue(new api.ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.'));
    const store = makeStore({ me: ADMIN });
    await store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'start' }, idempotencyKey: 'k4' }));
    expect(entryOf(store, 'k4')).toMatchObject({ status: 'rejected', httpStatus: 0 });
  });

  it('WebSocket 결과가 5초 안에 안 오면 GET /commands/{id}로 조회해서 맞춘다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue(accepted('cmd-5'));
    vi.mocked(api.getCommand)
      .mockResolvedValueOnce({ commandId: 'cmd-5', status: 'accepted', reason: null })
      .mockResolvedValueOnce({ commandId: 'cmd-5', status: 'completed', reason: null });
    const store = makeStore({ me: ADMIN });
    const done = store.dispatch(sendDeviceCommand({ deviceId: 'conveyor-z', command: { type: 'pause' }, idempotencyKey: 'k5' }));

    await vi.advanceTimersByTimeAsync(4_900);
    expect(api.getCommand).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(api.getCommand).toHaveBeenCalledTimes(1);
    expect(entryOf(store, 'k5').status).toBe('accepted'); // 아직 처리 중

    await vi.advanceTimersByTimeAsync(2_100);
    await done;
    expect(entryOf(store, 'k5').status).toBe('completed');
  });

  it('조회도 안 되고 결과가 끝내 없으면 확인 불가(unknown)로 표시한다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue(accepted('cmd-6'));
    vi.mocked(api.getCommand).mockRejectedValue(new api.ApiError(0, 'NETWORK_ERROR', ''));
    const store = makeStore({ me: ADMIN });
    const done = store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'pause' }, idempotencyKey: 'k6' }));
    await vi.advanceTimersByTimeAsync(5_000 + 60_000 + 3_000);
    await done;
    expect(entryOf(store, 'k6')).toMatchObject({ status: 'unknown' });
    expect(entryOf(store, 'k6').reason).toContain('확인하지 못했습니다');
  });

  it('202보다 WebSocket 결과가 먼저 도착해도 놓치지 않는다 (느린 네트워크)', async () => {
    let release!: () => void;
    vi.mocked(api.sendCommand).mockImplementation(
      () => new Promise((resolve) => (release = () => resolve(accepted('cmd-7')))),
    );
    const store = makeStore({ me: ADMIN });
    const done = store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'pause' }, idempotencyKey: 'k7' }));
    await vi.advanceTimersByTimeAsync(0);

    store.dispatch(commandResultReceived({ commandId: 'cmd-7', status: 'completed', reason: null })); // 먼저 도착
    release();
    await vi.advanceTimersByTimeAsync(200);
    await done;

    expect(entryOf(store, 'k7')).toMatchObject({ status: 'completed', commandId: 'cmd-7' });
    expect(store.getState().commands.earlyResults).toEqual({});
  });

  it('같은 키로 다시 보내면 항목을 새로 만들지 않고 이어서 쓴다', async () => {
    vi.mocked(api.sendCommand).mockRejectedValueOnce(new api.ApiError(0, 'NETWORK_ERROR', '연결 안 됨'));
    vi.mocked(api.sendCommand).mockResolvedValueOnce(accepted('cmd-8'));
    const store = makeStore({ me: ADMIN });
    await store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'pause' }, idempotencyKey: 'k8' }));
    expect(entryOf(store, 'k8').status).toBe('rejected');

    const done = store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'pause' }, idempotencyKey: 'k8' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(entryOf(store, 'k8')).toMatchObject({ status: 'accepted', commandId: 'cmd-8', reason: null, httpStatus: null });
    expect(store.getState().commands.order).toEqual(['k8']);
    store.dispatch(commandResultReceived({ commandId: 'cmd-8', status: 'completed', reason: null }));
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(api.sendCommand).toHaveBeenNthCalledWith(2, 'robot-1', { type: 'pause' }, { idempotencyKey: 'k8', permissions: ADMIN.permissions });
  });

  it('최근 명령은 최신순으로 고르고 30개까지만 보관한다', async () => {
    vi.mocked(api.sendCommand).mockRejectedValue(new api.ApiError(409, 'CONFLICT', 'x'));
    const store = makeStore({ me: ADMIN });
    for (let i = 1; i <= 35; i += 1) {
      await store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'start' }, idempotencyKey: `k-${i}` }));
    }
    const recent = selectRecentCommands(store.getState());
    expect(recent).toHaveLength(30);
    expect(recent[0]!.key).toBe('k-35');
    expect(recent.at(-1)!.key).toBe('k-6');
  });

  it('다른 사용자의 명령 결과는 내 항목에 영향을 주지 않는다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue(accepted('cmd-9'));
    const store = makeStore({ me: ADMIN });
    const done = store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'pause' }, idempotencyKey: 'k9' }));
    await vi.advanceTimersByTimeAsync(0);
    store.dispatch(commandResultReceived({ commandId: 'cmd-other', status: 'failed', reason: '남의 것' }));
    expect(entryOf(store, 'k9').status).toBe('accepted');
    store.dispatch(commandResultReceived({ commandId: 'cmd-9', status: 'completed', reason: null }));
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(entryOf(store, 'k9').status).toBe('completed');
  });
});

describe('sendDeviceCommand: 권한 없는 명령은 서버에 보내지 않는다', () => {
  it.each([
    ['열람자의 일시정지', VIEWER, { type: 'pause' } as const],
    ['작업자의 모드 전환', OPERATOR, { type: 'set_mode', mode: 'manual', confirm: true } as const],
    ['작업자의 배치 건너뛰기', OPERATOR, { type: 'skip_batch', batchId: 'b-1', reason: 'x', confirm: true } as const],
  ])('%s: fetch 없이 거부(403)로 기록한다', async (_name, me, command) => {
    // api는 진짜 sendCommand를 쓰고 fetch만 센다
    const actual = await vi.importActual<typeof import('../api')>('../api');
    vi.mocked(api.sendCommand).mockImplementation(actual.sendCommand);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const store = makeStore({ me });
      const key = await store.dispatch(sendDeviceCommand({ deviceId: 'compressor-1', command })).unwrap();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(entryOf(store, key)).toMatchObject({ status: 'rejected', httpStatus: 403, reason: '이 조작을 할 권한이 없습니다.' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('로그인 전(권한 없음)에도 보내지 않는다', async () => {
    const store = makeStore({ me: null });
    await store.dispatch(sendDeviceCommand({ deviceId: 'robot-1', command: { type: 'pause' }, idempotencyKey: 'k-anon' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![2]).toMatchObject({ permissions: [] });
  });
});
