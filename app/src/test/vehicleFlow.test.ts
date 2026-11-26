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
 * 모의 서버 공정 흐름을 불러온다. `callAt`으로 상차 차량을 부르는 적치 기준(OUTBOUND_CALL.callAboveYardBales, 이 수를 넘으면 부름)을 바꾸고
 * (-1이면 상차 차량이 없을 때마다 부름), `emptyYard`면 시작 적치(seedYardBales)를 0으로·지난 베일 채우기를 한 대에 1개·곧바로 오게 해
 * 시작할 때 적치 베일이 남지 않게 한다(실을 베일이 없는 경우를 재현).
 */
async function load(options: { callAt?: number; emptyYard?: boolean } = {}) {
  vi.doMock(FIXTURES, async (importOriginal) => {
    const original = await importOriginal<typeof import('../../../mock-server/src/fixtures/process')>();
    return {
      ...original,
      OUTBOUND_CALL: {
        ...original.OUTBOUND_CALL,
        ...(options.callAt !== undefined ? { callAboveYardBales: options.callAt } : {}),
        ...(options.emptyYard ? { seedYardBales: 0 } : {}),
      },
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

it('번호판·회사는 계근대에서 인식(identified)한 뒤에만 오고, 도착(arrived) 때는 null이다 (S2l)', async () => {
  const { fixtures, history, run } = await load({ callAt: -1 });
  run(10 * 60);
  const lists = [...history().values()];
  expect(lists.length).toBeGreaterThan(1);
  for (const list of lists) {
    for (const v of list.filter((x) => x.stage === 'arrived')) {
      expect(v.plate).toBeNull();
      expect(v.companyName).toBeNull();
      expect(v.sectorId).toBeNull();
    }
    const identified = list.find((x) => x.stage === 'identified');
    if (!identified) continue;
    expect(identified.plate).not.toBeNull();
    expect(identified.companyName).not.toBeNull();
    const waitSec = (Date.parse(identified.stageTimes.identified ?? '') - Date.parse(identified.stageTimes.arrived ?? '')) / 1000;
    // 3D에서 입구 → 계근대까지 실제 축척으로 약 15초 + 읽는 장면 (app/src/studio/sim/plate.test.ts가 장면 시간과 견준다)
    expect(waitSec).toBeGreaterThanOrEqual(fixtures.VEHICLE_TIMING_SEC.identify);
    expect(fixtures.VEHICLE_TIMING_SEC.identify).toBeGreaterThanOrEqual(16);
  }
});

it('하역·상차가 끝나면 출차 계근(weighing_out, 24초)을 거쳐서만 출차한다', async () => {
  const { fixtures, history, run } = await load({ callAt: -1 });
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
  const { history, run, vehicleRecord } = await load({ callAt: -1 });
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
  const { process, history, run, vehicleRecord } = await load({ callAt: -1 });
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
  const { fixtures, process, history, run, vehicleRecord } = await load({ callAt: -1, emptyYard: true });
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
  const { history, run, unloads } = await load({ callAt: -1 });
  run(15 * 60);
  const departed = [...history().values()].map((list) => list.at(-1) as Vehicle).filter((v) => v.stage === 'departed');
  const all = [...unloads.unloadRecords('sector-a'), ...unloads.unloadRecords('sector-c')];
  for (const v of departed) expect(all.some((r) => r.vehicleId === v.id)).toBe(v.kind === 'inbound');
});

it('지난 30일치 기록에 상차 차량(한 대 20개)이 섞이고, 그 baleIds의 베일은 shipped + 같은 vehicleId다', async () => {
  const { fixtures, process, records } = await load();
  const history = records.finishedVehicleRecords();
  const outbound = history.filter((r) => r.kind === 'outbound');
  const inbound = history.filter((r) => r.kind === 'inbound');
  // 상차 차량 한 대가 베일 OUTBOUND_CALL.balesPerTruck(20)개를 싣는다: 30일치에 여러 대, 입고보다는 적다
  expect(outbound.length).toBeGreaterThan(5);
  expect(inbound.length).toBeGreaterThan(outbound.length);
  // 시작 적치(seedYardBales) 앞에 남는 베일이 한 대 분량보다 적으면 가장 최근 차만 있는 만큼 싣는다
  const byTime = [...outbound].sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  for (const r of byTime.slice(0, -1)) expect(r.baleIds.length).toBe(fixtures.OUTBOUND_CALL.balesPerTruck);
  expect(byTime.at(-1)!.baleIds.length).toBeLessThanOrEqual(fixtures.OUTBOUND_CALL.balesPerTruck);
  const oldest = Math.min(...outbound.map((r) => Date.parse(r.arrivedAt)));
  // 첫 차는 베일 20개가 쌓인 뒤에 온다
  expect(Date.now() - oldest).toBeGreaterThan(26 * 24 * 3_600_000);
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

it('시뮬레이션의 차량 사건이 단계에 대응한다: 상차 시작 → 상차 완료 → 출차 계근 (load.* → loading/loaded, weigh.out → weighing_out)', async () => {
  const { process, history, run } = await load({ callAt: -1 });
  const { VEHICLE_EVENT_STAGES } = await import('@ecocycle/shared');
  const events = new Map<string, Array<{ event: string; stage: Vehicle['stage'] }>>();
  const stop = process.onVehicleEvent((event, vehicle) => {
    events.set(vehicle.id, [...(events.get(vehicle.id) ?? []), { event, stage: vehicle.stage }]);
  });
  run(15 * 60);
  stop();
  const departed = [...history().values()].map((list) => list.at(-1) as Vehicle).filter((v) => v.stage === 'departed');
  const outbound = departed.filter((v) => v.kind === 'outbound');
  const inbound = departed.filter((v) => v.kind === 'inbound');
  expect(outbound.length).toBeGreaterThan(0);
  expect(inbound.length).toBeGreaterThan(0);
  for (const v of departed) {
    const list = events.get(v.id) ?? [];
    // 사건이 일어난 뒤 차량의 단계 = 그 사건 이름이 정한 단계
    for (const { event, stage } of list) expect(stage).toBe(VEHICLE_EVENT_STAGES[event as keyof typeof VEHICLE_EVENT_STAGES]);
    expect(list.map((e) => e.event)).toEqual(
      v.kind === 'outbound'
        ? ['vehicle.arrived', 'vehicle.identified', 'load.started', 'load.completed', 'weigh.out']
        : ['vehicle.arrived', 'vehicle.identified', 'unload.started', 'unload.completed', 'weigh.out'],
    );
    // 사건마다 그 단계에 들어선 시각이 찍혔고, 마지막 사건(weigh.out) 뒤에야 출차한다
    for (const { stage } of list) expect(v.stageTimes[stage]).toBeDefined();
    expect(Date.parse(v.stageTimes.departed ?? '')).toBeGreaterThan(Date.parse(v.stageTimes.weighing_out ?? ''));
  }
});

it('모의 서버는 3D 바탕 재고 칸 수만큼 적치 베일을 가진 채 시작하고, 상차 호출 기준은 3D 북서 줄 칸 수와 같다 (S2q ⚠ B41)', async () => {
  const { YARD_CALL_ABOVE_BALES, YARD_FLOW, YARD_SEED_BALES } = await import('../config/yard');
  const { fixtures, process } = await load();
  expect(YARD_SEED_BALES).toBe((YARD_FLOW.nwStartColumns + YARD_FLOW.seStartColumns) * YARD_FLOW.levels);
  expect(YARD_CALL_ABOVE_BALES).toBe(YARD_FLOW.nwColumns * YARD_FLOW.levels);
  expect(fixtures.OUTBOUND_CALL.seedYardBales).toBe(YARD_SEED_BALES);
  expect(fixtures.OUTBOUND_CALL.callAboveYardBales).toBe(YARD_CALL_ABOVE_BALES);
  expect(process.baleRecords().filter((b) => b.stage === 'created')).toHaveLength(YARD_SEED_BALES);
  // GET /process/state의 bales에 적치 베일이 모두 들어 있다(진행 중 + 출하 최근 20건): 3D가 서버 베일로 마당을 채운다
  const listed = process.processState().bales;
  expect(listed.filter((b) => b.stage === 'created')).toHaveLength(YARD_SEED_BALES);
  expect(listed.filter((b) => b.stage !== 'created').length).toBeLessThanOrEqual(fixtures.RECENT_LIMIT);
});

it('시작 직후 첫 차는 상차 차량이고, 20개를 싣고 나간 뒤에는 적치가 북서 줄 칸 수를 넘을 때만 다음 상차 차량을 부른다 (S2q)', async () => {
  const { fixtures, process, messages, history, run } = await load();
  const yardCount = () => process.baleRecords().filter((b) => b.stage === 'created').length;
  const calledAt: number[] = [];
  const known = new Set<string>();
  const checkNew = (before: number) => {
    for (const m of messages) {
      if (m.type !== 'process.vehicle' || m.vehicle.kind !== 'outbound' || known.has(m.vehicle.id)) continue;
      known.add(m.vehicle.id);
      calledAt.push(before);
    }
  };
  let firstKind: string | undefined;
  for (let s = 0; s < 60 * 60; s += 1) {
    const before = yardCount();
    run(1, true);
    firstKind ??= messages.find((m) => m.type === 'process.vehicle')?.vehicle.kind;
    checkNew(before);
  }
  expect(firstKind).toBe('outbound');
  expect(calledAt.length).toBeGreaterThanOrEqual(2);
  // 부른 때의 적치는 언제나 기준(36)을 넘는다
  for (const n of calledAt) expect(n).toBeGreaterThan(fixtures.OUTBOUND_CALL.callAboveYardBales);
  // 나간 상차 차량은 20개씩 실었다 (적치가 넉넉하므로)
  const departed = [...history().values()].map((list) => list.at(-1) as Vehicle).filter((v) => v.kind === 'outbound' && v.stage === 'departed');
  expect(departed.length).toBeGreaterThan(0);
  for (const v of departed) expect(v.baleIds).toHaveLength(fixtures.OUTBOUND_CALL.balesPerTruck);
});

it('적치가 기준 아래로 내려가면 상차 차량을 부르지 않는다 (S2q)', async () => {
  const { fixtures, process, messages, run } = await load({ callAt: 1000 });
  run(20 * 60, true);
  expect(messages.some((m) => m.type === 'process.vehicle' && m.vehicle.kind === 'outbound')).toBe(false);
  expect(process.baleRecords().filter((b) => b.stage === 'created').length).toBeGreaterThan(fixtures.OUTBOUND_CALL.seedYardBales);
});

it('압축기가 계속 베일을 만들어도 적치는 3D 마당 칸(YARD_CAPACITY)을 넘지 않는다: 적치가 북서 줄 칸 수를 넘으면 상차 차량(한 번에 한 대, 20개까지)을 부른다 (S2l·S2q, 2시간)', async () => {
  const { YARD_CAPACITY } = await import('../config/yard');
  const { fixtures, process, history, run } = await load();
  const { balesPerTruck, seedYardBales } = fixtures.OUTBOUND_CALL;
  expect(seedYardBales).toBeLessThanOrEqual(YARD_CAPACITY);
  const yardCount = () => process.baleRecords().filter((b) => b.stage === 'created').length;
  let maxYard = yardCount();
  let made = 0;
  const seen = new Set(process.baleRecords().map((b) => b.id));
  for (let minute = 0; minute < 120; minute += 1) {
    run(60, true);
    for (const b of process.baleRecords()) if (!seen.has(b.id)) (seen.add(b.id), (made += 1));
    maxYard = Math.max(maxYard, yardCount());
    // 상차 차량은 한 번에 한 대
    expect(process.processState().vehicles.filter((v) => v.kind === 'outbound' && v.stage !== 'departed').length).toBeLessThanOrEqual(1);
  }
  expect(made).toBeGreaterThan(balesPerTruck);
  expect(maxYard).toBeLessThanOrEqual(YARD_CAPACITY);
  const outbound = [...history().values()].filter((list) => list[0]?.kind === 'outbound');
  expect(outbound.length).toBeGreaterThan(0);
  for (const list of outbound) {
    const last = list.at(-1) as Vehicle;
    expect(last.baleIds.length).toBeLessThanOrEqual(balesPerTruck);
    if (!last.stageTimes.loaded) continue;
    // 상차 단계는 실은 베일 수 × 베일당 시간보다 짧지 않다 (3D 지게차가 마저 싣게)
    const loadingSec = (Date.parse(last.stageTimes.loaded) - Date.parse(last.stageTimes.loading ?? '')) / 1000;
    expect(loadingSec).toBeGreaterThanOrEqual(last.baleIds.length * fixtures.OUTBOUND_TIMING_SEC.loadEach);
  }
});
