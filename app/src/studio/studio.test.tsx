import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Group, Object3D } from 'three';
import { useEffect } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bale, Batch, DeviceId, DeviceState, Vehicle } from '@ecocycle/shared';
import { chainSpecFor } from './robot/chain';
import { fixedSource } from './robot/jointSource';
import type { JointSource } from './robot/jointSource';
import { baleReceived, cctvToggled, connectionChanged, devicesReceived, vehicleReceived } from '../store';
import { NOW, conveyorState, renderWithStore, robotState, tankState } from '../test/utils';
import { LiveStudio } from './LiveStudio';
import type { StageProps } from './Stage';
import { SCENE_START, StudioView } from './StudioView';
import { Robot } from './actors/Robot';
import { demoData } from './demo/demoData';
import { Detail, PhoneSheet, TABLE_COLLAPSED_KEY, Tables, TrackerBar } from './overlay/Panels';
import { cycleSteps } from './overlay/text';
import { Director } from './sim/director';
import { Pace } from './sim/pace';
import { STUDIO_PROFILES, deviceClass, studioTier } from './quality';
import type { RecordLink, StudioData } from './types';
import { EMPTY_DATA } from './types';
import { AREAS, DEFAULT_VIEW, EXIT_HOLD, HOLD, LOAD_TRUCK, SCALE_STOP, SCALE_STOP_EAST, TIER_DISTANCE, TIP, TOP_VIEW, VIEWS, WIDE_VIEW, YARD, closeDistance, tierOf, worldToPx, yardToWorld } from './world/layout';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { TopBar } from '../components/layout/TopBar';
import { ADMIN, OPERATOR, VIEWER } from '../test/utils';

// 스튜디오 탭의 고정 규칙을 점검한다: 연결이 끊기면 모든 움직임이 멈추고 "연결 끊김"과 마지막 수신 시각이 보인다,
// 화면이 숨겨지거나 CCTV가 열리면 그리기를 멈춘다, 움직임은 서버 단계만 따른다, 조작은 기존 컴포넌트만 쓴다.
// 테스트 환경에는 그래픽(WebGL)이 없어 3D 무대(Stage)는 가짜로 바꾸고, 넘기는 값과 그 위의 HTML을 본다.

const stage = vi.hoisted(() => ({ last: null as StageProps | null }));

vi.mock('./Stage', () => ({
  Stage: (props: StageProps) => {
    stage.last = props;
    // 실제 무대처럼 첫 장을 그렸다고 알린다 (준비 화면을 걷고 핀을 놓는다)
    const { onReady } = props;
    useEffect(() => onReady?.(), [onReady]);
    return <div data-testid="stage" />;
  },
}));

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getRobotModel: vi.fn(() => new Promise(() => {})),
  getPlantHistory: vi.fn(() => new Promise(() => {})),
}));

const T0 = Date.parse(NOW);
const iso = (ms: number) => new Date(ms).toISOString();

const vehicle = (id: string, stageName: Vehicle['stage'], sectorId: Vehicle['sectorId'] = null, atMs = T0): Vehicle => ({
  id,
  kind: 'inbound',
  baleIds: [],
  stage: stageName,
  plate: sectorId ? '12가 3456' : null,
  companyName: sectorId ? '예시자원' : null,
  sectorId,
  stageTimes: { arrived: iso(T0), [stageName]: iso(atMs) },
  updatedAt: iso(atMs),
});

const bale = (id: string, stageName: Bale['stage'], createdMs = T0): Bale => ({ id, batchId: 'batch-1', stage: stageName, vehicleId: null, stageTimes: { created: iso(createdMs) }, updatedAt: iso(createdMs) });

const compressorState = (): DeviceState => ({ id: 'compressor-1', type: 'compressor', status: 'normal', running: true, pressureMpa: 27.9, temperatureC: 41.2, cycleStage: 'pressing', updatedAt: NOW });

const input = (over: Partial<StudioData> = {}): StudioData => ({ ...EMPTY_DATA, ...over });

/** dt=1/30초씩 seconds초 동안 돌린다 */
function run(director: Director, seconds: number, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds * 30); i += 1) {
    director.step(1 / 30);
    each?.();
  }
}

// 3D 장면(StudioScene)은 lazy 조각이다. 한 번 받아 두면 이후 화면은 기다리지 않고 바로 무대를 그린다
beforeAll(async () => {
  // 여기서는 무대에 넘기는 값을 본다: 첫 값을 기다리지 않고 바로 올린다 (기다리는 동작은 loading.test.tsx)
  SCENE_START.waitMs = 0;
  render(<StudioView data={EMPTY_DATA} jointSource={fixedSource()} tier="low" disconnected={false} lastReceivedAt={null} paused={false} onFailed={() => {}} />);
  await screen.findByTestId('stage');
  cleanup();
});

beforeEach(() => {
  stage.last = null;
});

describe('Director: 서버 단계를 움직임으로 옮긴다', () => {
  it('트럭은 받은 단계만큼만 나아간다: 경사로 → 후진으로 계근대(인식까지 기다림, 번호판 인식 장면) → 배정 더미 앞 → 하역 → 출차 계근(앞으로 올라 다시 잼) → 후진으로 내려와 같은 경사로로 출차', () => {
    const d = new Director();
    d.sync(input({ vehicles: [vehicle('v1', 'arrived')] }), T0);
    const truck = d.trucks[0]!;
    expect(truck.active).toBe(true);
    // 동쪽 도로의 북쪽(사진 위 끝, 낮은 도로)에서 들어온다
    expect(worldToPx(truck.x, truck.z)[1]).toBeLessThan(10);
    run(d, 0.1);
    expect(truck.y).toBeLessThan(-1);
    const phases: string[] = [];
    const note = () => {
      if (truck.active && phases[phases.length - 1] !== truck.phase) phases.push(truck.phase);
    };

    run(d, 24, note);
    expect(truck.phase).toBe('atScale');
    expect(phases).toContain('reverseIn');
    // 후진으로 올라와 서쪽을 보고 선다 (계근대 동쪽 끝은 옹벽)
    expect(truck.x).toBeCloseTo(SCALE_STOP.x, 1);
    expect(truck.z).toBeCloseTo(SCALE_STOP.z, 1);
    expect(Math.cos(truck.heading - SCALE_STOP.heading)).toBeGreaterThan(0.99);
    // 번호판 인식 장면: 인식 전이라 번호판은 없다 (지어내지 않는다)
    expect(d.plateScan.active).toBe(true);
    expect(d.plateScan.plate).toBeNull();
    // 서버가 인식(배정 섹터)을 알려 주기 전에는 계근대에서 기다린다
    run(d, 10);
    expect(truck.phase).toBe('atScale');

    d.sync(input({ vehicles: [vehicle('v1', 'identified', 'sector-c', T0 + 34_000)] }), T0 + 34_000);
    run(d, 0.5);
    expect(d.plateScan.plate).toBe('12가 3456');
    run(d, 25, note);
    expect(truck.phase).toBe('atTip');
    expect(truck.x).toBeCloseTo(TIP['sector-c'].x, 1);
    expect(truck.z).toBeCloseTo(TIP['sector-c'].z, 1);
    expect(truck.bedTilt).toBe(0); // 하역 단계가 오기 전에는 적재함을 들지 않는다
    expect(d.plateScan.active).toBe(false);

    d.sync(input({ vehicles: [vehicle('v1', 'unloading', 'sector-c', T0 + 60_000)] }), T0 + 60_000);
    run(d, 6);
    expect(truck.bedTilt).toBeCloseTo(1, 2);
    expect(truck.load).toBeLessThan(1);

    // 하역이 끝나도 바로 나가지 않는다: 출차 계근 단계가 올 때까지 더미 앞에서 기다린다
    d.sync(input({ vehicles: [vehicle('v1', 'unloaded', 'sector-c', T0 + 70_000)] }), T0 + 70_000);
    run(d, 10);
    expect(truck.phase).toBe('atTip');
    expect(truck.bedTilt).toBeLessThan(0.02);

    // 출차 계근: 앞으로 계근대에 올라 동쪽을 보고 다시 잰다 (번호판 인식 장면 "출차 계근")
    d.sync(input({ vehicles: [vehicle('v1', 'weighing_out', 'sector-c', T0 + 80_000)] }), T0 + 80_000);
    let weighed: { x: number; z: number; heading: number } | null = null;
    let scanOut = false;
    run(d, 40, () => {
      note();
      if (truck.phase === 'atScale2' && !weighed) weighed = { x: truck.x, z: truck.z, heading: truck.heading };
      if (truck.phase === 'atScale2' && d.plateScan.active && d.plateScan.out) scanOut = true;
    });
    expect(weighed!.x).toBeCloseTo(SCALE_STOP_EAST.x, 1);
    expect(weighed!.z).toBeCloseTo(SCALE_STOP_EAST.z, 1);
    expect(Math.cos(weighed!.heading - SCALE_STOP_EAST.heading)).toBeGreaterThan(0.99);
    expect(scanOut).toBe(true);
    // 잰 뒤에도 출차(departed)가 올 때까지 계근대 위에서 기다린다 (아직 회사 안, 출차 계근 중). 출입문 앞 대기 자리에 서지 않는다 (S2p)
    expect(truck.phase).toBe('atScale2');
    expect(truck.active).toBe(true);
    expect(truck.x).toBeCloseTo(SCALE_STOP_EAST.x, 1);
    expect(truck.z).toBeCloseTo(SCALE_STOP_EAST.z, 1);
    expect(phases.filter((p) => p === 'reverseIn' || p === 'reverseOut')).toEqual(['reverseIn']);

    // 출차(departed): 회사 밖이다(표의 "차량 N"에 세지 않는다). 그 자리에서 사라지지 않고(S2i #7) 경사로를 내려가
    // 도로를 따라 사진 남서쪽 밖 도로 끝까지 달려 나간 뒤 빠진다. 한 걸음 사이에 자리·방향이 튀지 않는다(S2i #6)
    d.sync(input({ vehicles: [vehicle('v1', 'departed', 'sector-c', T0 + 120_000)] }), T0 + 120_000);
    expect(d.truckCount()).toBe(0);
    expect(truck.active).toBe(true);
    let lastPx: readonly [number, number] = worldToPx(truck.x, truck.z);
    let maxY = -Infinity;
    let prev = { x: truck.x, z: truck.z, heading: truck.heading };
    let nearHold = Infinity;
    run(d, 60, () => {
      if (!truck.active) return;
      note();
      nearHold = Math.min(nearHold, Math.hypot(truck.x - EXIT_HOLD.x, truck.z - EXIT_HOLD.z));
      expect(Math.hypot(truck.x - prev.x, truck.z - prev.z)).toBeLessThan(0.5);
      expect(Math.abs(Math.atan2(Math.sin(truck.heading - prev.heading), Math.cos(truck.heading - prev.heading)))).toBeLessThan(0.25);
      prev = { x: truck.x, z: truck.z, heading: truck.heading };
      lastPx = worldToPx(truck.x, truck.z);
      maxY = Math.max(maxY, lastPx[1]);
    });
    // 출차를 받으면 후진으로 서쪽에 내려와 경사로 위 출차 대기 자리를 서지 않고 지나 도로로 나간다 (S2p)
    expect(phases.filter((p) => p === 'reverseIn' || p === 'reverseOut')).toEqual(['reverseIn', 'reverseOut']);
    expect(phases).toContain('leave');
    expect(phases).not.toContain('exitHold');
    expect(nearHold).toBeLessThan(0.3);
    expect(truck.active).toBe(false);
    // 사진(616px) 밖 남서쪽 도로 끝에서 빠졌다
    expect(maxY).toBeGreaterThan(800);
    expect(lastPx[0]).toBeLessThan(120);
  });

  it('처음 본 차량이 이미 하역 중이면 들어오는 장면을 지어내지 않고 그 자리에 놓는다. 출차한 차량은 만들지 않는다', () => {
    const d = new Director();
    d.sync(input({ vehicles: [vehicle('v1', 'unloading', 'sector-a', T0 - 60_000), vehicle('v0', 'departed', 'sector-a', T0 - 300_000)] }), T0);
    const active = d.trucks.filter((t) => t.active);
    expect(active).toHaveLength(1);
    expect(active[0]!.phase).toBe('atTip');
    expect(active[0]!.x).toBeCloseTo(TIP['sector-a'].x, 3);
    expect(active[0]!.z).toBeCloseTo(TIP['sector-a'].z, 3);
    expect(active[0]!.bedTilt).toBe(1);
  });

  it('같은 섹터로 가는 두 트럭은 더미 앞을 번갈아 쓰고, 겹치지 않는다', () => {
    const d = new Director();
    let overlaps = 0;
    // 첫 차는 하역을 마치고 다시 재러 가려 하고, 둘째 차는 같은 섹터로 배정되어 계근대에 있다
    d.sync(input({ vehicles: [vehicle('v1', 'unloaded', 'sector-a', T0 - 20_000), vehicle('v2', 'identified', 'sector-a', T0 - 30_000)] }), T0);
    run(d, 40, () => void (overlaps += d.truckOverlaps()));
    d.sync(input({ vehicles: [vehicle('v1', 'departed', 'sector-a', T0 + 40_000), vehicle('v2', 'unloading', 'sector-a', T0 + 40_000)] }), T0 + 40_000);
    run(d, 40, () => void (overlaps += d.truckOverlaps()));

    expect(d.trucks[1]!.phase).toBe('atTip'); // 막혀서 멈춘 채로 끝나지 않는다
    run(d, 40, () => void (overlaps += d.truckOverlaps()));
    expect(d.trucks[0]!.active).toBe(false); // 출차한 차는 도로로 달려 나간 뒤 빠졌다
    expect(overlaps).toBe(0);
  });

  it('베일은 배출 → 받침대에서 밀려 끝으로 → 저울에 두 개 겹쳐 잼 → 남동 칸에 한 쌍으로 적치 → (출하 단계가 오면) 북서에서 하나가 빠진다', () => {
    const d = new Director();
    const feed = (n: number, shipped = 0): Bale[] =>
      Array.from({ length: n }, (_, i) =>
        i < shipped ? { ...bale(`BL-${i}`, 'shipped', T0 + i * 5000), stageTimes: { created: iso(T0 + i * 5000), shipped: iso(T0 + 300_000) } } : bale(`BL-${i}`, 'created', T0 + i * 5000),
      );
    d.sync(input({ bales: feed(1) }), T0);
    run(d, 0.1);
    const first = d.bales.find((b) => b.active && b.id === 'BL-0')!;
    expect(first.state).toBe('ejecting');
    run(d, 4);
    expect(first.state).toBe('stand');
    // 받침대 끝(0번)에 닿기 전에는 지게차가 집지 않는다: 새 베일이 밀어낸다 (롤러 없음)
    for (let n = 2; n <= 4; n += 1) {
      d.sync(input({ bales: feed(n) }), T0 + (n - 1) * 5000);
      run(d, 5);
    }
    run(d, 60);
    // 두 개가 저울에서 한 번에 재어졌고 남동 칸에 한 쌍으로 쌓였다
    expect(d.yard.stats.weighed).toBeGreaterThanOrEqual(1);
    expect(d.yard.stats.stored).toBe(d.yard.stats.weighed * 2);
    expect(first.state).toBe('stack');
    expect(first.z).toBeCloseTo(YARD.slotZ, 3);
    const before = d.yard.audit();
    // 출하: 남동의 베일은 그대로(이름 없는 재고가 됨), 북서에서 하나가 빠진다
    d.sync(input({ bales: feed(4, 1) }), T0 + 300_000);
    const after = d.yard.audit();
    expect(after.seStacked).toBe(before.seStacked);
    expect(after.nwStacked).toBe(before.nwStacked - 1);
    expect(d.bales.some((b) => b.active && b.id === 'BL-0')).toBe(false);
    // 다시 받아도 되살리지 않는다
    d.sync(input({ bales: feed(4, 1) }), T0 + 301_000);
    expect(d.bales.some((b) => b.active && b.id === 'BL-0')).toBe(false);
  });

  it('상차 차량(서버 kind outbound, 25톤 카고)은 계근 → 상차 자리에서 옆판을 내리고 지게차가 북서에서 하나씩 싣는다 → 마지막 베일 뒤 출차 계근 → 출차', () => {
    const d = new Director();
    const out = (stageName: Vehicle['stage'], baleIds: string[], at: number): Vehicle => ({ ...vehicle('o1', stageName, null, at), kind: 'outbound', baleIds, plate: stageName === 'arrived' ? null : '82바 1047', companyName: stageName === 'arrived' ? null : '예시제지' });
    const shipped = (ids: string[], at: number): Bale[] => ids.map((id) => ({ ...bale(id, 'shipped', T0 - 600_000), vehicleId: 'o1', stageTimes: { created: iso(T0 - 600_000), shipped: iso(at) } }));
    d.sync(input({ vehicles: [out('arrived', [], T0)] }), T0);
    const truck = d.trucks.find((t) => t.active)!;
    expect(truck.outbound).toBe(true);
    run(d, 24);
    expect(truck.phase).toBe('atScale');
    d.sync(input({ vehicles: [out('identified', [], T0 + 30_000)] }), T0 + 30_000);
    run(d, 20);
    expect(truck.phase).toBe('loading');
    expect(truck.x).toBeCloseTo(HOLD.x, 1);
    expect(truck.z).toBeCloseTo(HOLD.z, 1);
    const nw0 = d.yard.audit().nwStacked;
    const ids = ['L1', 'L2', 'L3'];
    for (let i = 1; i <= ids.length; i += 1) {
      const at = T0 + 50_000 + i * 9000;
      d.sync(input({ vehicles: [out('loading', ids.slice(0, i), at)], bales: [...shipped(ids.slice(0, i), at), bale('X', 'created', T0 - 900_000)] }), at);
      run(d, 9);
    }
    run(d, 70);
    expect(truck.sides).toBeGreaterThan(0.9);
    expect(d.bales.filter((b) => b.active && b.state === 'loaded')).toHaveLength(3);
    expect(d.yard.audit().nwStacked).toBe(nw0 - 3);
    d.sync(input({ vehicles: [out('weighing_out', ids, T0 + 200_000)], bales: shipped(ids, T0 + 80_000) }), T0 + 200_000);
    const seen: string[] = [];
    const track = () => {
      if (seen[seen.length - 1] !== truck.phase) seen.push(truck.phase);
    };
    for (let k = 0; k < 60 && truck.phase !== 'atScale2'; k += 1) run(d, 1, track);
    run(d, 10, track);
    // 잰 뒤 출차(departed)를 계근대 위에서 기다린다 (S2p: 출입문 앞에 서지 않는다)
    expect(seen).toContain('atScale2');
    expect(truck.phase).toBe('atScale2');
    // 실린 베일은 상차 자리를 떠난 차를 따라간다 (적재함 위)
    for (const b of d.bales.filter((x) => x.active && x.state === 'loaded')) {
      const w = { x: 0, z: 0 };
      yardToWorld(b.x, b.z, w);
      expect(Math.hypot(w.x - truck.x, w.z - truck.z)).toBeLessThan(LOAD_TRUCK.length / 2);
    }
    d.sync(input({ vehicles: [out('departed', ids, T0 + 260_000)], bales: shipped(ids, T0 + 80_000) }), T0 + 260_000);
    // 출차: 도로로 달려 나간 뒤 빠진다
    expect(d.truckCount()).toBe(0);
    run(d, 40);
    expect(truck.active).toBe(false);
    // 실린 베일은 차가 나가면 사라진다
    expect(d.bales.some((b) => b.active && b.state === 'loaded')).toBe(false);
    expect(d.yard.stats.loadedOut).toBe(3);
  });

  it('섹터 더미는 서버 적재율을 따라가고, 압축 연출은 압축 중인 배치와 압축기 가동이 함께일 때만 돈다', () => {
    const d = new Director();
    const batch: Batch = { id: 'b1', stage: 'compressing', mix: [{ sectorId: 'sector-a', percent: 100 }], actualMix: null, pinning: null, pinChanges: [], avgMoisturePercent: 11, targetPressureMpa: 28, stageTimes: {}, updatedAt: NOW };
    d.sync(input({ devices: { 'sector-a': tankState(), 'compressor-1': compressorState() }, batches: [batch] }), T0);
    expect(d.fill['sector-a']).toBe(72.4); // 처음 받은 값은 바로 보여 준다
    run(d, 1);
    expect(d.pressing).toBe(true);
    expect(d.ram).toBeGreaterThan(0);

    d.sync(input({ devices: { 'sector-a': tankState(), 'compressor-1': compressorState() }, batches: [{ ...batch, stage: 'completed' }] }), T0 + 9000);
    run(d, 3);
    expect(d.pressing).toBe(false);
    expect(d.ram).toBeLessThan(0.01);
  });
});

describe('연결 끊김: 모든 움직임이 멈춘다', () => {
  it('끊기면 월드 시계가 멈춰 트럭·지게차·벨트·작업자가 제자리에 있고, 복구되면 다시 흐른다', () => {
    const d = new Director();
    d.sync(input({ devices: { 'conveyor-z': conveyorState() }, vehicles: [vehicle('v1', 'arrived')], bales: [bale('BL-1', 'created')] }), T0);
    const pace = new Pace(d, { needsFrame: () => false }, 30);
    let now = 0;
    const beats = (n: number, frozen: boolean) => {
      let drawn = 0;
      for (let i = 0; i < n; i += 1) {
        now += 1000 / 60;
        if (pace.advance(now, frozen)) drawn += 1;
      }
      return drawn;
    };
    beats(120, false);
    expect(d.t).toBeGreaterThan(1.5);

    const snapshot = () => JSON.stringify({ t: d.t, trucks: d.trucks.map((t) => [t.x, t.z, t.wheel]), fork: d.forklifts.map((f) => [f.x, f.z, f.heading]), belt: d.beltOffset, bales: d.bales.map((b) => [b.x, b.z]), workers: d.workers.map((w) => [w.x, w.z, w.stride]) });
    const before = snapshot();
    // 끊긴 동안: 시계가 멈추고, 움직인 것이 없으니 그리지도 않는다 (첫 박자는 끊긴 순간의 한 장)
    expect(beats(180, true)).toBeLessThanOrEqual(1);
    expect(snapshot()).toBe(before);

    expect(beats(60, false)).toBeGreaterThan(20);
    expect(snapshot()).not.toBe(before);
  });

  it('필요할 때만 그린다: 상한(초당 30)을 넘지 않고, 아무것도 움직이지 않으면 그리지 않는다', () => {
    const still = { step: () => undefined, motionKey: () => 1 };
    let wake = false;
    const pace = new Pace(still, { needsFrame: () => wake }, 30);
    let now = 0;
    let drawn = 0;
    for (let i = 0; i < 60; i += 1) {
      now += 1000 / 60;
      if (pace.advance(now, false)) drawn += 1;
    }
    expect(drawn).toBe(1); // 처음 한 장뿐
    wake = true;
    drawn = 0;
    for (let i = 0; i < 120; i += 1) {
      now += 1000 / 60;
      if (pace.advance(now, false)) drawn += 1;
    }
    expect(drawn).toBeGreaterThanOrEqual(58);
    expect(drawn).toBeLessThanOrEqual(61);
  });

  it('로봇팔은 끊긴 동안 관절 값을 새로 읽지 않고, 놓기 연출(컨베이어 뭉치)도 만들지 않는다', async () => {
    const d = new Director();
    const state = { joints: [40, 30, -20, 0, 10, 0], holding: true };
    const source: JointSource = {
      kind: 'fixed',
      read(_now, out) {
        out.joints.length = state.joints.length;
        state.joints.forEach((v, i) => (out.joints[i] = v));
        out.gripper.closed = state.holding;
        out.gripper.holding = state.holding;
        out.phase = 'place';
        return true;
      },
    };
    const spec = chainSpecFor();
    const renderer = await ReactThreeTestRenderer.create(<Robot spec={spec} source={source} frozen={false} director={d} onSelect={() => {}} />);
    await renderer.advanceFrames(2, 1 / 30);
    const root = renderer.scene.children[0]!.instance as Object3D;
    const base = (root.children[1] as Group).children[0] as Group;
    expect(base.rotation.y).toBeCloseTo((40 * Math.PI) / 180, 6);

    await renderer.update(<Robot spec={spec} source={source} frozen director={d} onSelect={() => {}} />);
    state.joints = [120, 0, 0, 0, 0, 0];
    state.holding = false;
    await renderer.advanceFrames(5, 1 / 30);
    expect(base.rotation.y).toBeCloseTo((40 * Math.PI) / 180, 6);
    expect(d.lumps.some((l) => l.active)).toBe(false);

    // 복구되면 받은 값을 다시 그리고, 그때 놓은 것은 뭉치가 된다
    await renderer.update(<Robot spec={spec} source={source} frozen={false} director={d} onSelect={() => {}} />);
    await renderer.advanceFrames(2, 1 / 30);
    expect(base.rotation.y).toBeCloseTo((120 * Math.PI) / 180, 6);
    expect(d.lumps.filter((l) => l.active)).toHaveLength(1);
  });

  const view = (over: Partial<Parameters<typeof StudioView>[0]> = {}) => (
    <StudioView data={demoData(T0, 30)} jointSource={fixedSource()} tier="high" disconnected={false} lastReceivedAt={NOW} paused={false} onFailed={() => {}} {...over} />
  );

  it('"연결 끊김"과 마지막 수신 시각을 보여 주고, 무대를 멈추게 하고, 핀은 마지막 값을 감춘다', () => {
    const { rerender } = render(view());
    expect(stage.last?.frozen).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/압축기 .*MPa, 정상/)).toBeInTheDocument();

    rerender(view({ disconnected: true }));
    expect(stage.last?.frozen).toBe(true);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('연결 끊김')).toBeInTheDocument();
    expect(within(alert).getByText(/모든 움직임을 멈췄습니다/)).toBeInTheDocument();
    expect(alert.querySelector('time')).toHaveAttribute('datetime', NOW);
    expect(screen.getByLabelText('압축기 연결 끊김')).toBeInTheDocument();
    expect(screen.getByLabelText('섹터 A 연결 끊김')).toBeInTheDocument();
    expect(screen.getByText('시스템 연결 끊김')).toBeInTheDocument();
    for (const label of ['오늘 생산 베일', '평균 수분', '압축기 가동률']) {
      const kpi = within(screen.getByRole('region', { name: label }));
      expect(kpi.getByText('연결 끊김')).toBeInTheDocument();
      expect(kpi.getByText('–')).toBeInTheDocument();
    }
    // 공정 추적도 진행 중인 것처럼 보이지 않는다
    expect(within(screen.getByRole('region', { name: '공정 추적' })).queryByText('진행 중')).not.toBeInTheDocument();
  });

  it('끊긴 동안 들어온(것처럼 보이는) 값으로는 새 움직임을 시작하지 않는다', () => {
    const { rerender } = render(view({ data: input(), disconnected: true }));
    rerender(view({ data: input({ vehicles: [vehicle('v9', 'arrived')] }), disconnected: true }));
    expect(stage.last?.director.trucks.some((t) => t.active)).toBe(false);
    // 복구되면 받은 상태를 반영한다
    rerender(view({ data: input({ vehicles: [vehicle('v9', 'identified', 'sector-a')] }), disconnected: false }));
    expect(stage.last?.director.trucks.filter((t) => t.active)).toHaveLength(1);
  });

  it('상단 바는 앱 쪽이 넘겨 준 것(앱 전체의 상단 바)을 3D 위에 그린다. 예시 값이면 "예시 데이터"', () => {
    const { unmount } = renderWithStore(view({ topBar: <TopBar overlay className="st-topbar" example live={{ disconnected: false, lastReceivedAt: NOW }} /> }));
    const bar = document.querySelector<HTMLElement>('[data-topbar="overlay"]')!;
    expect(bar.closest('.st-root')).not.toBeNull();
    expect(bar).toHaveTextContent('예시 데이터');
    expect(within(bar).getByRole('status')).toHaveTextContent('연결됨');
    unmount();
    renderWithStore(view({ topBar: <TopBar overlay className="st-topbar" example={false} live={{ disconnected: true, lastReceivedAt: NOW }} /> }));
    expect(document.querySelector('[data-topbar]')).not.toHaveTextContent('예시');
    expect(within(document.querySelector<HTMLElement>('[data-topbar]')!).getByRole('status')).toHaveTextContent('연결 끊김');
  });

  it('장면에서 찾기(검색)는 없다. 지역 전환은 상단 바 밖, 지도 도구 곁에 있다', () => {
    render(view());
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByRole('button', { name: /^지역:/ }).closest('.st-area-dock')).not.toBeNull();
  });

  it('표에서 장면에 없는 대상(출하된 베일)을 누르면 카메라는 그대로 두고 기록 팝업만 연다', async () => {
    // S2f 맞춤: 차량 탭은 회사 안 차량만 보여 주므로(명세 3절) 출차한 차량 줄 대신 출하된 베일 줄로 본다
    const user = userEvent.setup();
    const openRecord = vi.fn();
    const gone: Vehicle = { ...vehicle('v-gone', 'departed', 'sector-a'), plate: '34나 7788' };
    render(view({ data: input({ vehicles: [gone, vehicle('v1', 'unloading', 'sector-c')], bales: [{ ...bale('BL-0901', 'shipped'), vehicleId: 'v-out' }] }), openRecord }));
    const table = screen.getByRole('region', { name: '공정 기록' });
    expect(within(table).queryByText('34나 7788')).toBeNull();
    await user.click(within(table).getByRole('tab', { name: /^베일/ }));
    await user.click(within(table).getByText('0901', { exact: false }));
    expect(openRecord).toHaveBeenCalledWith({ kind: 'bale', id: 'BL-0901' });
    expect(stage.last?.routeKeys.current).toEqual([]);
    // 장면에 있는 차량은 지금처럼 고른다 (카메라가 다가가고 상세)
    await user.click(within(table).getByRole('tab', { name: /^차량/ }));
    await user.click(within(table).getByText('12가 3456'));
    expect(openRecord).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('complementary', { name: '차량 상세' })).toBeInTheDocument();
    expect(stage.last?.routeKeys.current).toEqual(['veh:v1']);
  });
});

describe('LiveStudio: 기존 store·조작 컴포넌트에 연결한다', () => {
  const devices = [tankState(), robotState({ phase: 'move' }), conveyorState(), compressorState()];

  it('CCTV가 열리면 그리기를 멈추고, 연결이 끊기면 무대를 멈추고 마지막 수신 시각을 보여 준다', () => {
    const { store } = renderWithStore(<LiveStudio onFailed={() => {}} />, { devices });
    expect(stage.last?.paused).toBe(false);
    expect(stage.last?.frozen).toBe(false);

    act(() => void store.dispatch(cctvToggled(true)));
    expect(stage.last?.paused).toBe(true);
    act(() => void store.dispatch(cctvToggled(false)));
    expect(stage.last?.paused).toBe(false);

    act(() => void store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW })));
    expect(stage.last?.frozen).toBe(true);
    expect(screen.getByRole('alert').querySelector('time')).toHaveAttribute('datetime', NOW);
  });

  it('store의 공정 값(차량)을 그대로 표와 핀에 보여 주고 연출 감독에게 넘긴다', () => {
    const { store } = renderWithStore(<LiveStudio onFailed={() => {}} />, { devices });
    act(() => void store.dispatch(vehicleReceived(vehicle('veh-7', 'identified', 'sector-a', Date.now()))));
    expect(screen.getByLabelText('차량 12가 3456 인식 완료')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '공정 기록' })).getByText('예시자원')).toBeInTheDocument();
    expect(stage.last?.director.trucks.filter((t) => t.active)).toHaveLength(1);
  });

  it('기기를 고르면 기존 홈용 조작과 기기 페이지 링크만 나온다: 운전 모드 권한이 없으면(작업자) 상태만 보이고 조작은 없다', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore(<LiveStudio onFailed={() => {}} />, { devices, me: OPERATOR });
    act(() => void store.dispatch(devicesReceived(devices)));
    await user.click(screen.getByLabelText(/로봇팔 이동, 작동 중/));

    const panel = screen.getByRole('complementary', { name: '로봇팔 상세' });
    expect(within(panel).getByRole('button', { name: '일시정지' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: '상세 보기' })).toHaveAttribute('href', '/robot');
    // 권한(robot.manual)이 없으면 운전 모드 조작을 그리지 않는다. 모드는 상세 행에서 본다
    expect(within(panel).queryByRole('region', { name: '운전 모드' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /적용|집기|놓기/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(panel).getByText('모드')).toBeInTheDocument();
    expect(screen.queryByText(/비상/)).not.toBeInTheDocument();
  });

  it('열람자에게도 로봇 패널은 상태(모드·들고 있는 섹터)만 보이고 조작은 없다', async () => {
    const user = userEvent.setup();
    const held = [tankState(), robotState({ mode: 'manual', heldSectorId: 'sector-a', gripper: { closed: true, holding: true } }), conveyorState(), compressorState()];
    const { store } = renderWithStore(<LiveStudio onFailed={() => {}} />, { devices: held, me: VIEWER });
    act(() => void store.dispatch(devicesReceived(held)));
    await user.click(screen.getByLabelText(/로봇팔 대기, 작동 중/));
    const panel = screen.getByRole('complementary', { name: '로봇팔 상세' });
    expect(within(panel).getByText('A에서 집음 · 놓기 대기')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /적용|집기|놓기|일시정지/ })).not.toBeInTheDocument();
  });

  it('관리자가 로봇을 고르면 기기 페이지와 같은 운전 모드 조작(모드·섹터 지정·집기/놓기)이 패널에 들어간다', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore(<LiveStudio onFailed={() => {}} />, { devices, me: ADMIN });
    act(() => void store.dispatch(devicesReceived(devices)));
    await user.click(screen.getByLabelText(/로봇팔 이동, 작동 중/));
    const panel = screen.getByRole('complementary', { name: '로봇팔 상세' });
    const mode = within(panel).getByRole('region', { name: '운전 모드' });
    expect(within(mode).getAllByRole('radio').map((r) => r.firstChild?.textContent)).toEqual(['자동', '자동 · 섹터 지정', '수동']);
    await user.click(within(mode).getAllByRole('radio')[1]!);
    expect(within(mode).getByRole('button', { name: '섹터 A' })).toBeInTheDocument();
    await user.click(within(mode).getAllByRole('radio')[2]!);
    expect(within(mode).getByRole('button', { name: '집기' })).toBeDisabled();
    expect(within(mode).getByRole('button', { name: '컨베이어에 놓기' })).toBeDisabled();
    // 확인 단계는 같은 ConfirmDialog
    await user.click(within(mode).getByRole('button', { name: '적용' }));
    expect(screen.getByRole('dialog', { name: '모드 전환' })).toBeInTheDocument();
  });
});

describe('공정 추적: 서버 단계를 여섯 칸에 옮겨 적는다', () => {
  it('지금 그 단계에 있는 대상이 있는 칸만 진행 중이다', () => {
    const batch: Batch = { id: 'batch-0412', stage: 'compressing', mix: [{ sectorId: 'sector-a', percent: 40 }, { sectorId: 'sector-c', percent: 60 }], actualMix: null, pinning: null, pinChanges: [], avgMoisturePercent: 11, targetPressureMpa: 28.4, stageTimes: { compressing: NOW }, updatedAt: NOW };
    const steps = cycleSteps({ vehicles: [vehicle('v1', 'identified', 'sector-a')], batches: [batch], bales: [] });
    expect(steps.map((s) => s.label)).toEqual(['입고', '차량 인식', '하역', '배합', '압축', '출하']);
    expect(steps.filter((s) => s.active).map((s) => s.key)).toEqual(['identify', 'press']);
    expect(steps[1]!.detail).toBe('12가 3456 · 예시자원');
    expect(steps[4]!.detail).toBe('목표 28.4 MPa');
    expect(steps[5]!.detail).toBeNull();
  });
});

describe('참고 화면에 맞춘 화면 구성', () => {
  const view = (over: Partial<Parameters<typeof StudioView>[0]> = {}) => (
    <StudioView data={demoData(T0, 30)} jointSource={fixedSource()} tier="high" disconnected={false} lastReceivedAt={NOW} paused={false} onFailed={() => {}} {...over} />
  );

  it('카메라 거리는 세 단계다: 부지 전체(wide) > 구역(mid, 기본) > 대상(close)', () => {
    expect(VIEWS.filter((v) => v.tier === 'wide')).toEqual([WIDE_VIEW, TOP_VIEW]);
    expect(AREAS.every((v) => v.tier === 'mid')).toBe(true);
    expect(DEFAULT_VIEW.tier).toBe('mid');
    expect(tierOf(WIDE_VIEW.distance)).toBe('wide');
    AREAS.forEach((area) => expect(tierOf(area.distance)).toBe('mid'));
    ['veh:v1', 'forklift', 'bale:b1', 'dev:compressor-1', 'dev:robot-1', 'dev:sector-a'].forEach((key) => expect(tierOf(closeDistance(key))).toBe('close'));
    expect(TIER_DISTANCE.wide).toBeGreaterThan(TIER_DISTANCE.mid);
    expect(TIER_DISTANCE.mid).toBeGreaterThan(TIER_DISTANCE.close);
  });

  it('경로 점선은 고른 차량에만 그리고, 대상을 고르면 그 위에 작은 이름표가 뜬다', async () => {
    const user = userEvent.setup();
    const data = input({ vehicles: [vehicle('v1', 'identified', 'sector-a')] });
    render(view({ data }));
    expect(stage.last?.routeKeys.current).toEqual([]);
    const pin = screen.getByLabelText('차량 12가 3456 인식 완료');
    await user.click(pin);
    expect(stage.last?.routeKeys.current).toEqual(['veh:v1']);
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    expect(within(pin).getByText(/12가 3456/)).toBeInTheDocument();
  });

  it('장면 핀·패널에 "예시" 표시가 없다(앱의 "예시 데이터" 표시는 상단 바가 맡는다). 번호판 인식 핀은 입력 칸 없이 서버 번호판만 적는다', () => {
    render(view({ data: input({ vehicles: [vehicle('v1', 'identified', 'sector-a')] }) }));
    const pins = document.querySelector('.st-pins')!;
    // (회사 이름 "예시자원"은 시험용 서버 값이다) 서버 값이 없는 "예시" 핀(상차 예시, 고정 재고 예시)은 없다
    expect(pins.querySelector('.st-pin-example, [aria-label$="예시"]')).toBeNull();
    expect(pins.textContent).not.toMatch(/고정 재고|상차 차량\s*예시/);
    const scan = screen.getByLabelText('번호판 인식');
    expect(scan.querySelector('input')).toBeNull();
    expect(scan.textContent).toMatch(/인식 중/);
  });

  it('상세 패널은 4~5줄만 바로 보이고 나머지는 "자세히" 안에 있다', async () => {
    const user = userEvent.setup();
    render(view({ data: input({ vehicles: [vehicle('v1', 'unloading', 'sector-c')] }) }));
    await user.click(screen.getByLabelText('차량 12가 3456 하역 중'));
    const panel = screen.getByRole('complementary', { name: '차량 상세' });
    const visibleRows = [...panel.querySelectorAll('dl.st-rows > div')].filter((row) => !row.closest('details'));
    expect(visibleRows.length).toBeLessThanOrEqual(5);
    expect(within(panel).getByText('자세히')).toBeInTheDocument();
    expect(within(panel).getByText('출차')).toBeInTheDocument(); // 접혀 있어도 내용은 있다
  });

  it('홈에서 열면 앱의 상단 바를 넘겨받아 상단 바 하나만 남고(알람·사용자·로그아웃·CCTV는 그 바에), 화면 이동은 앱의 주 메뉴 하나로 한다', async () => {
    const user = userEvent.setup();
    renderWithStore(
      <Routes>
        <Route element={<AppShell headerExtra={<button type="button">CCTV</button>} />}>
          <Route index element={<LiveStudio onFailed={() => {}} />} />
        </Route>
      </Routes>,
      { devices: [tankState(), robotState(), conveyorState()], me: ADMIN },
    );
    // 주 메뉴는 다른 화면과 같은 것 하나이고 아이콘만 남게 접혀 있다. 스튜디오 상단 바에는 따로 메뉴가 없다
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(nav).toHaveAttribute('data-collapsed', 'true');
    expect(within(nav).getByRole('link', { name: '설정' })).toHaveAttribute('href', '/settings');
    expect(within(nav).getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    // 앱 상단 바(로고·로그아웃 버튼)는 없고 스튜디오 상단 바 하나뿐이다
    expect(screen.getAllByText('EcoCycle')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument();
    // 3D 위의 바는 다른 화면과 같은 상단 바(components/layout/TopBar)를 떠 있는 모양으로 그린 것이다
    const bar = document.querySelector<HTMLElement>('[data-topbar="overlay"]')!;
    expect(bar.closest('.st-root')).not.toBeNull();
    expect(within(bar).getByRole('link', { name: /알람 보기/ })).toHaveAttribute('href', '/alarms');
    expect(within(bar).getByRole('button', { name: 'CCTV' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: '메뉴' })).not.toBeInTheDocument();
    await user.click(within(bar).getByRole('button', { name: new RegExp(ADMIN.name) }));
    expect(within(bar).getByRole('menuitem', { name: '로그아웃' })).toBeInTheDocument();
  });
});

/** 기기 ID 형식이 맞는지 컴파일 때 확인 (핀 key는 `dev:<기기 ID>`) */
const _deviceKey: `dev:${DeviceId}` = 'dev:compressor-1';
void _deviceKey;

describe('화질 단계: 휴대폰 먼저 (고정 규칙 6)', () => {
  const hints = (width: number, height: number, coarse = false, gpu = '') => ({ width, height, coarse, gpu });

  it('기기 종류: 390×844는 폰, 820×1180은 태블릿, 1440×900은 데스크톱', () => {
    expect(deviceClass(hints(390, 844, true))).toBe('phone');
    expect(deviceClass(hints(844, 390, true))).toBe('phone');
    expect(deviceClass(hints(820, 1180))).toBe('tablet');
    expect(deviceClass(hints(1280, 800, true))).toBe('tablet');
    expect(deviceClass(hints(1280, 800, false, 'Mali-G78'))).toBe('tablet');
    expect(deviceClass(hints(1440, 900))).toBe('desktop');
  });

  it('기본은 모든 기기에서 high이고, 측정값이 낮으면 그 단계로 내린다', () => {
    expect(studioTier(null, null)).toBe('high');
    expect(studioTier('high', null)).toBe('high');
    expect(studioTier('standard', null)).toBe('standard');
    expect(studioTier('low', null)).toBe('low');
  });

  it('사용자가 직접 고른 단계는 그대로 따른다', () => {
    expect(studioTier(null, 'low')).toBe('low');
    expect(studioTier('high', 'low')).toBe('low');
    expect(studioTier('low', 'high')).toBe('high');
  });

  it('low는 후처리·실시간 그림자·패널 흐림 없이, standard·low는 초당 30으로 묶는다', () => {
    expect(STUDIO_PROFILES.low).toMatchObject({ maxDpr: 1, post: false, shadowMap: 0, ao: 'baked', bloom: false, tiltShift: false, panelBlur: 'none', maxFps: 30 });
    expect(STUDIO_PROFILES.standard).toMatchObject({ maxDpr: 1.5, ao: 'n8ao-half', shadowMap: 2048, tiltShift: false, panelBlur: 'main', maxFps: 30 });
    expect(STUDIO_PROFILES.high.shadowMap).toBeLessThanOrEqual(2048);
  });

  it('화면은 단계를 data-tier로 적어 패널 흐림이 단계를 따른다', () => {
    const { container } = render(<StudioView data={demoData(T0, 30)} jointSource={fixedSource()} tier="low" disconnected={false} lastReceivedAt={NOW} paused={false} onFailed={() => {}} />);
    expect(container.querySelector('.st-root')?.getAttribute('data-tier')).toBe('low');
    expect(stage.last?.tier).toBe('low');
  });
});

describe('폰 배치: 아래 시트', () => {
  it('처음에는 접혀 공정 막대(지금 단계 이름)와 요약 한 줄만 보이고, 펼치면 배치 · 차량 · 섹터 · 베일 탭이 나온다', async () => {
    const user = userEvent.setup();
    render(<PhoneSheet data={demoData(T0, 30)} disconnected={false} selection={null} onSelect={() => {}} />);
    expect(screen.getByRole('group', { name: /^공정 추적/ })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '공정 정보 종류' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '공정 정보 펼치기' }));
    const tabs = within(screen.getByRole('tablist', { name: '공정 정보 종류' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent?.replace(/\s*\d+$/, ''))).toEqual(['배치', '차량', '섹터', '베일']);
  });

  it('대상을 고르면 펼쳐서 그 상세를 보여 주고, 닫기는 고르기를 푼다', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PhoneSheet data={demoData(T0, 30)} disconnected={false} selection="dev:sector-c" onSelect={onSelect} />);
    const detail = screen.getByRole('complementary', { name: /상세/ });
    await user.click(within(detail).getByRole('button', { name: '상세 패널 닫기' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('연결이 끊기면 공정 막대가 "연결 끊김"으로 읽힌다', () => {
    render(<TrackerBar data={demoData(T0, 30)} disconnected />);
    expect(screen.getByRole('group', { name: /연결 끊김/ })).toBeInTheDocument();
  });
});

describe('세로 태블릿: 배치 요약 칩', () => {
  it('아무것도 고르지 않았으면 배치 번호 · 배합 · 현재 압력 한 줄로 접혀 있고, 누르면 펼치고 다시 접을 수 있다', async () => {
    const user = userEvent.setup();
    const data = demoData(T0, 30);
    render(<Detail data={data} disconnected={false} selection={null} onSelect={() => {}} collapsible />);
    const chip = screen.getByRole('button', { name: /^지금 배치 .*, 펼치기$/ });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    expect(chip).toHaveTextContent(/MPa/);
    expect(screen.queryByRole('complementary', { name: '공정 요약' })).toBeNull();
    await user.click(chip);
    expect(screen.getByRole('complementary', { name: '공정 요약' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '지금 배치 접기' }));
    expect(screen.getByRole('button', { name: /, 펼치기$/ })).toBeInTheDocument();
  });

  it('대상을 고르면 접힌 칩 대신 그 상세를 보여 주고, 끊기면 칩의 현재 압력은 "–"', () => {
    const data = demoData(T0, 30);
    const { rerender } = render(<Detail data={data} disconnected={false} selection="dev:sector-a" onSelect={() => {}} collapsible />);
    expect(screen.getByRole('complementary', { name: /상세/ })).toBeInTheDocument();
    rerender(<Detail data={data} disconnected selection={null} onSelect={() => {}} collapsible />);
    expect(screen.getByRole('button', { name: /, 펼치기$/ })).toHaveTextContent(/–/);
    expect(screen.getByRole('button', { name: /, 펼치기$/ })).not.toHaveTextContent(/MPa/);
  });

  it('넓은 화면(collapsible 없음)에서는 처음부터 펼쳐 둔다', () => {
    render(<Detail data={demoData(T0, 30)} disconnected={false} selection={null} onSelect={() => {}} />);
    expect(screen.getByRole('complementary', { name: '공정 요약' })).toBeInTheDocument();
  });
});

describe('공정 기록 링크 (앱이 주소를 그려 넘긴다)', () => {
  // 링크 그리기는 앱(LiveStudio)의 일이라 여기서는 대상과 모양을 글로 적는 가짜를 쓴다
  const recordLink: RecordLink = (target, label, className) => (
    <a className={className} href={`#${target.kind}:${'tab' in target ? target.tab : target.id}`}>
      {label}
    </a>
  );

  it('차량 표(넓은 화면·세로 태블릿)는 머리에 "기록 보기", 배치·베일 탭도 같고(베일은 공정 기록의 베일 탭) 섹터 탭에는 없다', async () => {
    const user = userEvent.setup();
    render(<Tables data={demoData(T0, 30)} disconnected={false} selection={null} onSelect={() => {}} recordLink={recordLink} />);
    expect(screen.getByRole('link', { name: '기록 보기' })).toHaveAttribute('href', '#list:vehicles');
    await user.click(screen.getByRole('tab', { name: /^배치/ }));
    expect(screen.getByRole('link', { name: '기록 보기' })).toHaveAttribute('href', '#list:batches');
    await user.click(screen.getByRole('tab', { name: /^섹터/ }));
    expect(screen.queryByRole('link', { name: '기록 보기' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: /^베일/ }));
    expect(screen.getByRole('link', { name: '기록 보기' })).toHaveAttribute('href', '#list:bales');
  });

  it('고른 차량의 상세에는 "이 차량 기록", 고른 베일의 상세와 지금 배치 요약에는 "이 배치 상세"', () => {
    const data = demoData(T0, 30);
    const vehicleId = data.vehicles.find((v) => v.stage !== 'departed')!.id;
    const { rerender } = render(<Detail data={data} disconnected={false} selection={`veh:${vehicleId}`} onSelect={() => {}} recordLink={recordLink} />);
    expect(screen.getByRole('link', { name: '이 차량 기록' })).toHaveAttribute('href', `#vehicle:${vehicleId}`);

    const bale: Bale = { id: 'BL-20261013-0412', batchId: 'batch-0412', stage: 'created', vehicleId: null, stageTimes: { created: NOW }, updatedAt: NOW };
    rerender(<Detail data={{ ...data, bales: [bale] }} disconnected={false} selection={`bale:${bale.id}`} onSelect={() => {}} recordLink={recordLink} />);
    expect(screen.getByRole('link', { name: '이 배치 상세' })).toHaveAttribute('href', `#batch:${bale.batchId}`);

    const current = data.batches.find((b) => b.stage !== 'completed')!;
    rerender(<Detail data={data} disconnected={false} selection={null} onSelect={() => {}} recordLink={recordLink} />);
    expect(screen.getByRole('link', { name: '이 배치 상세' })).toHaveAttribute('href', `#batch:${current.id}`);
  });

  it('폰 시트: 배치·차량·베일 탭에 "기록 보기", 섹터 탭에는 없다. 링크를 넘기지 않으면(시연 화면) 어디에도 없다', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<PhoneSheet data={demoData(T0, 30)} disconnected={false} selection={null} onSelect={() => {}} recordLink={recordLink} />);
    await user.click(screen.getByRole('button', { name: '공정 정보 펼치기' }));
    await user.click(screen.getByRole('tab', { name: /^차량/ }));
    expect(screen.getByRole('link', { name: '기록 보기' })).toHaveAttribute('href', '#list:vehicles');
    await user.click(screen.getByRole('tab', { name: /^배치/ }));
    expect(screen.getByRole('link', { name: '기록 보기' })).toHaveAttribute('href', '#list:batches');
    await user.click(screen.getByRole('tab', { name: /^섹터/ }));
    expect(screen.queryByRole('link', { name: '기록 보기' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: /^베일/ }));
    expect(screen.getByRole('link', { name: '기록 보기' })).toHaveAttribute('href', '#list:bales');
    unmount();

    render(<PhoneSheet data={demoData(T0, 30)} disconnected={false} selection={null} onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: '공정 정보 펼치기' }));
    await user.click(screen.getByRole('tab', { name: /^차량/ }));
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('표: 접기·펼치기와 장면에 없는 대상', () => {
  beforeEach(() => localStorage.clear());

  it('접기 단추로 요약 한 줄까지 접고, 접은 상태를 기기에 기억한다', async () => {
    const user = userEvent.setup();
    const data = demoData(T0, 30);
    const { unmount } = render(<Tables data={data} disconnected={false} selection={null} onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: '공정 기록 표 접기' }));
    expect(screen.queryByRole('tablist', { name: '기록 종류' })).toBeNull();
    const summary = screen.getByRole('button', { name: /공정 기록 표 펼치기/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    const onSite = data.vehicles.filter((v) => v.stage !== 'departed').length;
    expect(summary).toHaveTextContent(`차량 ${onSite}대`);
    expect(localStorage.getItem(TABLE_COLLAPSED_KEY)).toBe('1');
    unmount();

    // 다시 열어도 접혀 있다. 펼치면 기억도 지운다
    render(<Tables data={data} disconnected={false} selection={null} onSelect={() => {}} />);
    await user.click(screen.getByRole('button', { name: /공정 기록 표 펼치기/ }));
    expect(screen.getByRole('tablist', { name: '기록 종류' })).toBeInTheDocument();
    expect(localStorage.getItem(TABLE_COLLAPSED_KEY)).toBeNull();
  });

  it('배치 줄과 출하된 베일 줄은 팝업을 열고, 적치 중인 베일은 장면에서 고른다. 여는 함수가 없으면(시연 화면) 누를 수 없다', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const openRecord = vi.fn();
    const batch = { ...demoData(T0, 30).batches[0]!, id: 'batch-0777' };
    const data = input({ batches: [batch], bales: [bale('BL-1', 'shipped'), bale('BL-2', 'created')] });
    const { unmount } = render(<Tables data={data} disconnected={false} selection={null} onSelect={onSelect} openRecord={openRecord} />);
    await user.click(screen.getByRole('tab', { name: /^배치/ }));
    await user.click(screen.getByText('0777', { exact: false }));
    expect(openRecord).toHaveBeenLastCalledWith({ kind: 'batch', id: 'batch-0777' });
    await user.click(screen.getByRole('tab', { name: /^베일/ }));
    const rows = screen.getAllByRole('row');
    await user.click(rows.find((r) => r.textContent?.includes('출하'))!);
    expect(openRecord).toHaveBeenLastCalledWith({ kind: 'bale', id: 'BL-1' });
    // 키보드로도 연다
    rows.find((r) => r.textContent?.includes('출하'))!.focus();
    await user.keyboard('{Enter}');
    expect(openRecord).toHaveBeenCalledTimes(3);
    await user.click(rows.find((r) => r.textContent?.includes('적치'))!);
    expect(onSelect).toHaveBeenCalledWith('bale:BL-2');
    expect(openRecord).toHaveBeenCalledTimes(3);
    unmount();

    render(<Tables data={data} disconnected={false} selection={null} onSelect={onSelect} />);
    await user.click(screen.getByRole('tab', { name: /^배치/ }));
    expect(screen.getAllByRole('row').every((r) => !r.hasAttribute('tabindex'))).toBe(true);
  });

  it('3D 홈(LiveStudio)에서는 장면에 없는 베일 줄이 그 베일의 기록 팝업 주소를 연다 (출차한 차량은 차량 탭에 없다)', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore(
      <Routes>
        <Route index element={<LiveStudio onFailed={() => {}} />} />
        <Route path="/records/bales/:id" element={<p>베일 기록 팝업 주소</p>} />
      </Routes>,
      { devices: [tankState(), robotState(), conveyorState()], me: ADMIN },
    );
    act(() => {
      store.dispatch(vehicleReceived({ ...vehicle('v-gone', 'departed', 'sector-a'), plate: '34나 7788' }));
      store.dispatch(baleReceived({ ...bale('BL-0902', 'shipped'), vehicleId: 'v-out' }));
    });
    const table = screen.getByRole('region', { name: '공정 기록' });
    expect(within(table).queryByText('34나 7788')).toBeNull();
    await user.click(within(table).getByRole('tab', { name: /^베일/ }));
    await user.click(within(table).getByText('0902', { exact: false }));
    expect(screen.getByText('베일 기록 팝업 주소')).toBeInTheDocument();
  });
});
