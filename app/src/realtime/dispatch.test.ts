import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm, DeviceState, PlantSummary, RobotJointsMessage, TankState } from '@ecocycle/shared';
import { createDispatcher } from './dispatch';
import { createJointBuffer } from './jointBuffer';
import type { RealtimeSink } from './types';

const tank = (fill: number, id: TankState['id'] = 'tank-a1'): TankState => ({
  id,
  type: 'tank',
  section: 'A1',
  status: 'normal',
  fillPercent: fill,
  volumeM3: 1,
  capacityM3: 8,
  moisturePercent: 10,
  updatedAt: '2026-10-13T05:00:00.000Z',
});

const summary = (fill: number): PlantSummary => ({
  averageMoisturePercent: 10,
  totalFillPercent: fill,
  status: 'normal',
  updatedAt: '2026-10-13T05:00:00.000Z',
});

const alarm: Alarm = {
  id: 'al-1',
  level: 'caution',
  deviceId: 'tank-a1',
  message: '적재율 80% 초과',
  state: 'active',
  ts: '2026-10-13T05:00:00.000Z',
};

function makeSink() {
  const sink: RealtimeSink = {
    onConnection: vi.fn(),
    onPlantSummary: vi.fn(),
    onDeviceStates: vi.fn(),
    onAlarm: vi.fn(),
    onCommandResult: vi.fn(),
    resync: vi.fn(async () => undefined),
  };
  return sink;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dispatcher', () => {
  it('device.state는 모아서 한 번에 보내고 같은 기기는 마지막 값만 남긴다', () => {
    const sink = makeSink();
    const d = createDispatcher({ sink, jointBuffer: createJointBuffer(), batchMs: 250 });

    d.handle({ type: 'device.state', state: tank(70) }, 0);
    d.handle({ type: 'device.state', state: tank(71) }, 0);
    d.handle({ type: 'device.state', state: tank(72, 'tank-a2') }, 0);
    expect(sink.onDeviceStates).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(sink.onDeviceStates).toHaveBeenCalledTimes(1);
    const states = vi.mocked(sink.onDeviceStates).mock.calls[0]![0] as DeviceState[];
    expect(states.map((s) => (s.type === 'tank' ? [s.id, s.fillPercent] : null))).toEqual([
      ['tank-a1', 71],
      ['tank-a2', 72],
    ]);
  });

  it('plant.summary도 모아서 마지막 값만 보낸다', () => {
    const sink = makeSink();
    const d = createDispatcher({ sink, jointBuffer: createJointBuffer(), batchMs: 250 });
    d.handle({ type: 'plant.summary', summary: summary(40) }, 0);
    d.handle({ type: 'plant.summary', summary: summary(41) }, 0);
    vi.advanceTimersByTime(250);
    expect(sink.onPlantSummary).toHaveBeenCalledTimes(1);
    expect(sink.onPlantSummary).toHaveBeenCalledWith(summary(41));
  });

  it('alarm과 command.result는 모으지 않고 바로 보낸다', () => {
    const sink = makeSink();
    const d = createDispatcher({ sink, jointBuffer: createJointBuffer() });
    d.handle({ type: 'alarm', alarm }, 0);
    d.handle({ type: 'command.result', commandId: 'cmd-1', status: 'rejected', reason: '작업 중' }, 0);
    expect(sink.onAlarm).toHaveBeenCalledWith(alarm);
    expect(sink.onCommandResult).toHaveBeenCalledWith({ commandId: 'cmd-1', status: 'rejected', reason: '작업 중' });
  });

  it('robot.joints는 store로 가지 않고 jointBuffer로만 간다', () => {
    const sink = makeSink();
    const buffer = createJointBuffer();
    const d = createDispatcher({ sink, jointBuffer: buffer });
    const msg: RobotJointsMessage = {
      type: 'robot.joints',
      deviceId: 'robot-1',
      seq: 1,
      ts: '2026-10-13T05:00:00.000Z',
      joints: [1, 2, 3, 4, 5, 6],
      gripper: { closed: false, holding: false },
      phase: 'idle',
      targetTankId: null,
    };
    d.handle(msg, Date.parse(msg.ts));
    vi.advanceTimersByTime(1000);
    expect(buffer.sample(Date.parse(msg.ts))!.joints).toEqual([1, 2, 3, 4, 5, 6]);
    for (const fn of Object.values(sink)) expect(fn).not.toHaveBeenCalled();
  });

  it('heartbeat는 아무 값도 내보내지 않는다', () => {
    const sink = makeSink();
    const d = createDispatcher({ sink, jointBuffer: createJointBuffer() });
    d.handle({ type: 'heartbeat', ts: '2026-10-13T05:00:00.000Z' }, 0);
    vi.advanceTimersByTime(1000);
    for (const fn of Object.values(sink)) expect(fn).not.toHaveBeenCalled();
  });

  it('flush하면 기다리지 않고 바로 보낸다', () => {
    const sink = makeSink();
    const d = createDispatcher({ sink, jointBuffer: createJointBuffer(), batchMs: 250 });
    d.handle({ type: 'device.state', state: tank(70) }, 0);
    d.flush();
    expect(sink.onDeviceStates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(sink.onDeviceStates).toHaveBeenCalledTimes(1);
  });

  it('dispose하면 모아 둔 값을 버린다', () => {
    const sink = makeSink();
    const d = createDispatcher({ sink, jointBuffer: createJointBuffer(), batchMs: 250 });
    d.handle({ type: 'device.state', state: tank(70) }, 0);
    d.dispose();
    vi.advanceTimersByTime(1000);
    expect(sink.onDeviceStates).not.toHaveBeenCalled();
  });
});
