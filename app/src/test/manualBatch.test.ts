// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RobotState, ServerMessage } from '@ecocycle/shared';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const process = await import('../../../mock-server/src/sim/process');
  const { devices } = await import('../../../mock-server/src/sim/state');
  const robot = await import('../../../mock-server/src/sim/robot');
  const { onMessage } = await import('../../../mock-server/src/sim/bus');
  const messages: ServerMessage[] = [];
  onMessage(message => messages.push(message));
  process.tickProcess();
  vi.advanceTimersByTime(4_000);
  process.tickProcess();
  const batchId = process.mixingBatchId()!;
  expect(batchId).toBeTruthy();
  const batch = () => process.processState().batches.find(b => b.id === batchId)!;
  return { process, devices, robot, messages, batchId, batch };
}

it('수동 집기는 기다리고 놓기 완료 시 실제 배합·수분·압력과 기록을 갱신한다', async () => {
  const { process, devices, robot, messages, batchId, batch } = await setup();
  const planned = batch();
  const state = devices['robot-1'] as RobotState;
  state.mode = 'manual';
  state.status = 'running';
  const advanceRobot = (seconds: number) => {
    for (let i = 0; i < seconds * 10; i++) {
      vi.advanceTimersByTime(100);
      robot.tickRobot();
    }
  };
  expect(robot.requestManualPick('sector-a', 'tester')).toBe(true);
  advanceRobot(20);
  expect(state.heldSectorId).toBe('sector-a');
  expect(batch().actualMix).toBeNull();
  expect(robot.requestManualPlace('tester')).toBe(true);
  advanceRobot(25);
  expect(state.heldSectorId).toBeNull();
  expect(batch().actualMix).toEqual([{ sectorId: 'sector-a', percent: 100 }]);
  expect(batch().mix).toEqual(planned.mix);
  expect(batch().pinChanges).toEqual([]);
  const sector = devices['sector-a'];
  if (sector.type !== 'tank') throw new Error('tank expected');
  expect(batch().avgMoisturePercent).toBe(sector.moisturePercent);
  const { PRESSURE_PER_MOISTURE_MPA, TARGET_PRESSURE_MPA } = await import('../../../mock-server/src/fixtures/process');
  const expected = planned.targetPressureMpa + PRESSURE_PER_MOISTURE_MPA * (sector.moisturePercent - planned.avgMoisturePercent);
  expect(batch().targetPressureMpa).toBe(Math.round(Math.min(TARGET_PRESSURE_MPA.max, Math.max(TARGET_PRESSURE_MPA.min, expected)) * 10) / 10);
  expect(messages.some(m => m.type === 'process.batch' && m.batch.id === batchId && m.batch.actualMix?.length === 1)).toBe(true);
  expect(process.liveBatchRecords().find(b => b.id === batchId)?.actualMix).toEqual(batch().actualMix);
});

it('수동 전후 자동 투입량도 포함하며 직접 설정한 압력은 유지한다', async () => {
  const { process, batchId, batch } = await setup();
  process.notePlaced('sector-a', batchId, 1);
  expect(batch().actualMix).toBeNull();
  expect(process.applyBatchCommand({ type: 'set_batch_pressure', batchId, targetPressureMpa: 28, confirm: true }, 'tester')).toBeUndefined();
  process.notePlaced('sector-c', batchId, 3, 'manual');
  expect(batch().actualMix).toEqual([{ sectorId: 'sector-a', percent: 25 }, { sectorId: 'sector-c', percent: 75 }]);
  process.notePlaced('sector-a', batchId, 2);
  expect(batch().actualMix).toEqual([{ sectorId: 'sector-a', percent: 50 }, { sectorId: 'sector-c', percent: 50 }]);
  expect(batch().targetPressureMpa).toBe(28);
  expect(process.notePlaced('sector-c', null, 1, 'manual')).toBeNull();
  expect(batch().actualMix).toHaveLength(2);
  process.notePlaced('sector-a', batchId, 1, 'manual');
  process.notePlaced('sector-c', batchId, 1, 'manual');
  const actual = batch().actualMix;
  for (let i = 0; i < 10; i++) {
    vi.advanceTimersByTime(1_000);
    process.tickProcess();
  }
  expect(batch().stage).toBe('completed');
  const { finishedBatchRecords } = await import('../../../mock-server/src/sim/records');
  const record = finishedBatchRecords().find(b => b.id === batchId)!;
  expect(record.actualMix).toEqual(actual);
  expect(process.baleDetail(record.baleIds[0]!)?.mix).toEqual(actual);
});
