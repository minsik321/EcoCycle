import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm, DeviceState, PlantSummary } from '@ecocycle/shared';
import * as api from '../api';
import { createAppStore } from './index';
import { createStoreSink } from './realtimeSink';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getPlantSummary: vi.fn(),
  getDevices: vi.fn(),
  getAlarms: vi.fn(),
}));

const summary: PlantSummary = {
  averageMoisturePercent: 11,
  totalFillPercent: 50,
  status: 'normal',
  updatedAt: '2026-10-13T05:00:00.000Z',
};
const device: DeviceState = {
  id: 'conveyor-z',
  type: 'conveyor',
  status: 'normal',
  running: true,
  loadPercent: 40,
  updatedAt: '2026-10-13T05:00:00.000Z',
};
const alarm = (id: string, state: Alarm['state']): Alarm => ({
  id,
  level: 'caution',
  deviceId: 'tank-a1',
  message: 'm',
  state,
  ts: '2026-10-13T05:00:00.000Z',
});

beforeEach(() => {
  vi.mocked(api.getPlantSummary).mockResolvedValue(summary);
  vi.mocked(api.getDevices).mockResolvedValue([device]);
  vi.mocked(api.getAlarms).mockImplementation(async (q) =>
    q?.state === 'active' ? [alarm('a1', 'active')] : q?.state === 'acknowledged' ? [alarm('a2', 'acknowledged')] : [],
  );
});

describe('store sink', () => {
  it('realtime이 내보내는 값을 슬라이스에 넣는다', () => {
    const store = createAppStore();
    const sink = createStoreSink(store.dispatch);

    sink.onConnection({ status: 'online', lastReceivedAt: '2026-10-13T05:00:00.000Z' });
    sink.onPlantSummary(summary);
    sink.onDeviceStates([device]);
    sink.onAlarm(alarm('a9', 'active'));

    const s = store.getState();
    expect(s.connection.status).toBe('online');
    expect(s.plant.summary).toEqual(summary);
    expect(s.devices.byId['conveyor-z']).toEqual(device);
    expect(Object.keys(s.alarms.byId)).toEqual(['a9']);
  });

  it('resync는 REST로 요약·기기·열린 알람(active와 acknowledged)을 한 번에 맞춘다', async () => {
    const store = createAppStore();
    const sink = createStoreSink(store.dispatch);
    sink.onAlarm(alarm('stale', 'active')); // 연결이 끊긴 동안 해제된 알람

    await sink.resync();

    const s = store.getState();
    expect(s.plant.summary).toEqual(summary);
    expect(s.devices.byId['conveyor-z']).toEqual(device);
    expect(Object.keys(s.alarms.byId).sort()).toEqual(['a1', 'a2']);
    expect(api.getAlarms).toHaveBeenCalledWith({ state: 'active' });
    expect(api.getAlarms).toHaveBeenCalledWith({ state: 'acknowledged' });
  });

  it('REST가 실패하면 reject해서 realtime이 다시 시도하게 하고 store는 그대로 둔다', async () => {
    vi.mocked(api.getDevices).mockRejectedValue(new api.ApiError(503, 'X', ''));
    const store = createAppStore();
    const sink = createStoreSink(store.dispatch);
    await expect(sink.resync()).rejects.toBeInstanceOf(api.ApiError);
    expect(store.getState().plant.summary).toBeNull();
  });
});
