// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ServerMessage, Vehicle, VehicleRecord } from '@ecocycle/shared';
import { VEHICLE_STAGES_BY_KIND } from '@ecocycle/shared';

// 모의 서버 차량 흐름 (명세 6절 "공정 흐름"·"공정 기록", decisions 2026-11-25 "출차 계근·상차 차량…"):
// 하역·상차 뒤 출차 계근(weighing_out, 24초)을 거쳐서만 출차, 상차 차량의 실은 베일과 베일 vehicleId, 종류별 무게 순서.

const FIXTURES = '../../../mock-server/src/fixtures/process';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.doUnmock(FIXTURES);
  vi.useRealTimers();
});

/**
 * 모의 서버 공정 흐름을 불러온다. `everyInbound`로 상차 차량 주기를 좁히고,
 * 지난 베일 채우기를 한 대에 1개·곧바로 오게 해 시작할 때 적치 베일이 남지 않게 한다(실을 베일이 없는 경우를 재현).
 */
async function load(options: { everyInbound?: [number, number]; emptyYard?: boolean } = {}) {
  vi.doMock(FIXTURES, async (importOriginal) => {
    const original = await importOriginal<typeof import('../../../mock-server/src/fixtures/process')>();
    return {
      ...original,
      ...(options.everyInbound ? { OUTBOUND_EVERY_INBOUND: options.everyInbound } : {}),
      ...(options.emptyYard ? { OUTBOUND_HISTORY: { balesPerVehicle: [1, 1], arriveAfterMin: [0, 0] } } : {}),
    };
  });
  const fixtures = await import('../../../mock-server/src/fixtures/process');
  const process = await import('../../../mock-server/src/sim/process');
  const records = await import('../../../mock-server/src/sim/records');
  const unloads = await import('../../../mock-server/src/sim/unloads');
  const robot = await import('../../../mock-server/src/sim/robot');
  const { onMessage } = await import('../../../mock-server/src/sim/bus');
  const messages: ServerMessage[] = [];
  onMessage((m) => messages.push(m));
  /** 차량 id → 받은 차례대로의 상태 */
  const history = () => {
    const byId = new Map<string, Vehicle[]>();
    for (const m of messages) if (m.type === 'process.vehicle') byId.set(m.vehicle.id, [...(byId.get(m.vehicle.id) ?? []), m.vehicle]);
    return byId;
  };
  /** 초 단위로 돌린다. withRobot이면 로봇(0.1초)도 돌려 배치·베일이 생긴다 */
  const run = (seconds: number, withRobot = false) => {
    for (let s = 0; s < seconds; s += 1) {
      if (withRobot) {
        for (let i = 0; i < 10; i += 1) {
          vi.advanceTimersByTime(100);
          robot.tickRobot();
        }
      } else vi.advanceTimersByTime(1000);
      process.tickProcess();
    }
  };
  const vehicleRecord = (id: string): VehicleRecord | undefined =>
    [...records.finishedVehicleRecords(), ...process.liveVehicleRecords()].find((r) => r.id === id);
  return { fixtures, process, records, unloads, messages, history, run, vehicleRecord };
}

const stagesOf = (list: Vehicle[]) => list.map((v) => v.stage).filter((stage, i, all) => all[i - 1] !== stage);

it('하역·상차가 끝나면 출차 계근(weighing_out, 24초)을 거쳐서만 출차한다', async () => {
  const { fixtures, history, run } = await load({ everyInbound: [1, 1] });
  expect(fixtures.VEHICLE_TIMING_SEC.weighOut).toBe(24);
  run(15 * 60);
  const departed = [...history().values()].filter((list) => list.at(-1)?.stage === 'departed');
  const kinds = new Set(departed.map((list) => list[0]?.kind));
  expect(kinds).toEqual(new Set(['inbound', 'outbound']));
  for (const list of departed) {
    const last = list.at(-1) as Vehicle;
    // 단계 순서가 종류별 순서와 같다 (unloaded/loaded → departed 직행 없음)
    expect(stagesOf(list)).toEqual(VEHICLE_STAGES_BY_KIND[last.kind]);
    const weighSec = (Date.parse(last.stageTimes.departed ?? '') - Date.parse(last.stageTimes.weighing_out ?? '')) / 1000;
    expect(weighSec).toBeGreaterThanOrEqual(fixtures.VEHICLE_TIMING_SEC.weighOut);
    if (last.kind === 'outbound') expect(last.sectorId).toBeNull();
    else expect(last.sectorId).not.toBeNull();
  }
});

it('입고는 총중량 먼저, 상차는 공차 먼저 재고 출차 계근 뒤에 나머지와 순중량(= 총중량 − 공차)이 생긴다', async () => {
  const { history, run, vehicleRecord } = await load({ everyInbound: [1, 1] });
  const seen = new Map<string, VehicleRecord[]>();
  for (let s = 0; s < 15 * 60; s += 1) {
    run(1);
    for (const [id, list] of history()) {
      if (list.at(-1)?.stage === 'departed' && seen.get(id)?.at(-1)?.status === 'departed') continue;
      const record = vehicleRecord(id);
      if (record) seen.set(id, [...(seen.get(id) ?? []), record]);
    }
  }
  const checked = new Set<string>();
  for (const list of seen.values()) {
    const final = list.at(-1) as VehicleRecord;
    if (final.status !== 'departed') continue;
    checked.add(final.kind);
    for (const before of list.filter((r) => r.status !== 'departed')) {
      expect(before.netT).toBeNull();
      expect(before.departedAt).toBeNull();
      if (before.kind === 'inbound') {
        expect(before.grossT).toEqual(expect.any(Number));
        expect(before.tareT).toBeNull();
      } else {
        expect(before.tareT).toEqual(expect.any(Number));
        expect(before.grossT).toBeNull();
      }
    }
    expect(final.grossT).toEqual(expect.any(Number));
    expect(final.tareT).toEqual(expect.any(Number));
    expect(final.netT).toBeCloseTo((final.grossT as number) - (final.tareT as number), 2);
    expect(final.departedAt).toBe(final.stageTimes.departed);
  }
  expect(checked).toEqual(new Set(['inbound', 'outbound']));
});

it('상차 차량은 적치 베일을 하나씩 실어 shipped + vehicleId를 붙이고, baleIds와 베일 vehicleId가 일치한다', async () => {
  const { process, history, run, vehicleRecord } = await load({ everyInbound: [1, 1] });
  run(20 * 60, true);
  const outbound = [...history().values()].map((list) => list.at(-1) as Vehicle).filter((v) => v.kind === 'outbound' && v.stage === 'departed');
  const loaded = outbound.filter((v) => v.baleIds.length > 0);
  expect(loaded.length).toBeGreaterThan(0);
  for (const vehicle of outbound) {
    expect(vehicleRecord(vehicle.id)?.baleIds).toEqual(vehicle.baleIds);
    for (const id of vehicle.baleIds) {
      const bale = process.baleDetail(id);
      expect(bale?.stage).toBe('shipped');
      expect(bale?.vehicleId).toBe(vehicle.id);
      expect(process.baleRecords().find((r) => r.id === id)?.vehicleId).toBe(vehicle.id);
    }
  }
  // 반대 방향: shipped 베일은 모두 그 vehicleId 차량의 baleIds에 있고, 적치 베일은 vehicleId가 없다
  for (const record of process.baleRecords()) {
    if (record.stage === 'created') expect(record.vehicleId).toBeNull();
    else expect(vehicleRecord(record.vehicleId as string)?.baleIds).toContain(record.id);
  }
  // 하나씩 싣는다: 실을 때마다 차량 메시지의 baleIds가 1개씩 는다
  const steps = history().get(loaded[0]!.id)!.map((v) => v.baleIds.length);
  for (let i = 1; i < steps.length; i += 1) expect(steps[i]! - steps[i - 1]!).toBeLessThanOrEqual(1);
});

it('실을 적치 베일이 없으면 maxWait(60초)만큼 기다렸다가 0개로 상차를 마치고 출차 계근을 거쳐 출차한다', async () => {
  const { fixtures, process, history, run, vehicleRecord } = await load({ everyInbound: [0, 0], emptyYard: true });
  expect(process.baleRecords().filter((b) => b.stage === 'created')).toEqual([]);
  run(4 * 60);
  const first = [...history().values()].find((list) => list[0]?.kind === 'outbound') as Vehicle[];
  const last = first.at(-1) as Vehicle;
  expect(last.stage).toBe('departed');
  expect(last.baleIds).toEqual([]);
  expect(stagesOf(first)).toEqual(VEHICLE_STAGES_BY_KIND.outbound);
  const waited = (Date.parse(last.stageTimes.loaded ?? '') - Date.parse(last.stageTimes.loading ?? '')) / 1000;
  expect(waited).toBeGreaterThanOrEqual(fixtures.OUTBOUND_TIMING_SEC.maxWait);
  const record = vehicleRecord(last.id) as VehicleRecord;
  expect(record.netT).toBe(0);
  expect(record.grossT).toBe(record.tareT);
});

it('하역 기록은 입고 차량만 남긴다', async () => {
  const { history, run, unloads } = await load({ everyInbound: [1, 1] });
  run(15 * 60);
  const departed = [...history().values()].map((list) => list.at(-1) as Vehicle).filter((v) => v.stage === 'departed');
  const all = [...unloads.unloadRecords('sector-a'), ...unloads.unloadRecords('sector-c')];
  for (const v of departed) expect(all.some((r) => r.vehicleId === v.id)).toBe(v.kind === 'inbound');
});

it('지난 30일치 기록에 상차 차량이 섞이고, 그 baleIds의 베일은 shipped + 같은 vehicleId다', async () => {
  const { process, records } = await load();
  const history = records.finishedVehicleRecords();
  const outbound = history.filter((r) => r.kind === 'outbound');
  const inbound = history.filter((r) => r.kind === 'inbound');
  expect(outbound.length).toBeGreaterThan(30);
  // 입고 3~4대에 상차 1대 꼴 (지난 기록은 베일 수를 따르므로 넓게 본다)
  expect(inbound.length / outbound.length).toBeGreaterThan(2);
  expect(inbound.length / outbound.length).toBeLessThan(8);
  const oldest = Math.min(...outbound.map((r) => Date.parse(r.arrivedAt)));
  expect(Date.now() - oldest).toBeGreaterThan(29 * 24 * 3_600_000);
  for (const r of outbound) {
    expect(r.status).toBe('departed');
    expect(r.sectorId).toBeNull();
    expect(r.baleIds.length).toBeGreaterThan(0);
    expect(r.stageTimes.weighing_out).toBeDefined();
    expect(r.netT).toBeCloseTo((r.grossT as number) - (r.tareT as number), 2);
    for (const id of r.baleIds) {
      expect(process.baleDetail(id)).toMatchObject({ stage: 'shipped', vehicleId: r.id });
    }
  }
  for (const r of inbound) {
    expect(r.baleIds).toEqual([]);
    expect(r.stageTimes.weighing_out).toBeDefined();
  }
});

it('사건 이름이 차량 단계에 대응한다 (load.* → loading/loaded, weigh.out → weighing_out)', async () => {
  const { VEHICLE_EVENT_STAGES } = await import('@ecocycle/shared');
  expect(VEHICLE_EVENT_STAGES).toMatchObject({
    'unload.started': 'unloading',
    'unload.completed': 'unloaded',
    'load.started': 'loading',
    'load.completed': 'loaded',
    'weigh.out': 'weighing_out',
  });
});
