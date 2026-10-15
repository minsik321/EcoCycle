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
import { cctvToggled, connectionChanged, devicesReceived, vehicleReceived } from '../store';
import { NOW, conveyorState, renderWithStore, robotState, tankState } from '../test/utils';
import { LiveStudio } from './LiveStudio';
import type { StageProps } from './Stage';
import { SCENE_START, StudioView } from './StudioView';
import { Robot } from './actors/Robot';
import { demoData } from './demo/demoData';
import { Detail, PhoneSheet, TrackerBar } from './overlay/Panels';
import { cycleSteps } from './overlay/text';
import { Director } from './sim/director';
import { Pace } from './sim/pace';
import { STUDIO_PROFILES, deviceClass, studioTier } from './quality';
import type { StudioData } from './types';
import { EMPTY_DATA } from './types';
import { APRON, AREAS, BALE_REST, DEFAULT_VIEW, SCALE, TIER_DISTANCE, TRUCK, VIEWS, WIDE_VIEW, YARD, bayCenterZ, closeDistance, tierOf } from './world/layout';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ADMIN } from '../test/utils';

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
  stage: stageName,
  plate: sectorId ? '12가 3456' : null,
  companyName: sectorId ? '예시자원' : null,
  sectorId,
  stageTimes: { arrived: iso(T0), [stageName]: iso(atMs) },
  updatedAt: iso(atMs),
});

const bale = (id: string, stageName: Bale['stage'], createdMs = T0): Bale => ({ id, batchId: 'batch-1', stage: stageName, stageTimes: { created: iso(createdMs) }, updatedAt: iso(createdMs) });

const compressorState = (): DeviceState => ({ id: 'compressor-1', type: 'compressor', status: 'normal', running: true, pressureMpa: 27.9, temperatureC: 41.2, updatedAt: NOW });

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
  render(<StudioView data={EMPTY_DATA} jointSource={fixedSource()} tier="low" disconnected={false} lastReceivedAt={null} paused={false} example={false} onFailed={() => {}} />);
  await screen.findByTestId('stage');
  cleanup();
});

beforeEach(() => {
  stage.last = null;
});

describe('Director: 서버 단계를 움직임으로 옮긴다', () => {
  it('트럭은 받은 단계만큼만 나아간다: 계중대 → 배정 섹터 → 하역 → 출차 대기 → 출차', () => {
    const d = new Director();
    d.sync(input({ vehicles: [vehicle('v1', 'arrived')] }), T0);
    const truck = d.trucks[0]!;
    expect(truck.active).toBe(true);
    expect(truck.x).toBeGreaterThan(SCALE.stopX + 5); // 정문 밖에서 들어온다

    run(d, 12);
    expect(truck.phase).toBe('atScale');
    expect(truck.x).toBeCloseTo(SCALE.stopX, 1);
    // 서버가 인식(배정 섹터)을 알려 주기 전에는 계중대에서 기다린다
    run(d, 10);
    expect(truck.phase).toBe('atScale');

    d.sync(input({ vehicles: [vehicle('v1', 'identified', 'tank-b1', T0 + 22_000)] }), T0 + 22_000);
    run(d, 25);
    expect(truck.phase).toBe('atBay');
    expect(truck.x).toBeCloseTo(TRUCK.parkX, 1);
    expect(truck.z).toBeCloseTo(bayCenterZ('tank-b1'), 1);
    expect(truck.bedTilt).toBe(0); // 하역 단계가 오기 전에는 적재함을 들지 않는다

    d.sync(input({ vehicles: [vehicle('v1', 'unloading', 'tank-b1', T0 + 50_000)] }), T0 + 50_000);
    run(d, 6);
    expect(truck.bedTilt).toBeCloseTo(1, 2);
    expect(truck.load).toBeLessThan(1);

    d.sync(input({ vehicles: [vehicle('v1', 'unloaded', 'tank-b1', T0 + 60_000)] }), T0 + 60_000);
    run(d, 14);
    expect(truck.phase).toBe('atExit');
    expect(truck.x).toBeCloseTo(APRON.exitX, 1);

    d.sync(input({ vehicles: [vehicle('v1', 'departed', 'tank-b1', T0 + 80_000)] }), T0 + 80_000);
    run(d, 20);
    expect(truck.active).toBe(false);
  });

  it('처음 본 차량이 이미 하역 중이면 들어오는 장면을 지어내지 않고 그 자리에 놓는다. 출차한 차량은 만들지 않는다', () => {
    const d = new Director();
    d.sync(input({ vehicles: [vehicle('v1', 'unloading', 'tank-a2', T0 - 60_000), vehicle('v0', 'departed', 'tank-a1', T0 - 300_000)] }), T0);
    const active = d.trucks.filter((t) => t.active);
    expect(active).toHaveLength(1);
    expect(active[0]!.phase).toBe('atBay');
    expect(active[0]!.z).toBeCloseTo(bayCenterZ('tank-a2'), 3);
    expect(active[0]!.bedTilt).toBe(1);
  });

  it('두 트럭이 같은 마당을 써도 서로 비켜 가서 겹치지 않는다', () => {
    const d = new Director();
    let minGap = Infinity;
    const watch = () => {
      const [a, b] = d.trucks;
      if (a!.active && b!.active) minGap = Math.min(minGap, Math.hypot(a!.x - b!.x, a!.z - b!.z));
    };
    // 첫 차는 하역을 마치고 나가려 하고, 둘째 차는 그 옆 칸으로 들어온다
    d.sync(input({ vehicles: [vehicle('v1', 'unloaded', 'tank-a2', T0 - 20_000), vehicle('v2', 'identified', 'tank-a1', T0 - 30_000)] }), T0);
    run(d, 40, watch);
    d.sync(input({ vehicles: [vehicle('v1', 'departed', 'tank-a2', T0 + 40_000), vehicle('v2', 'unloading', 'tank-a1', T0 + 40_000)] }), T0 + 40_000);
    run(d, 30, watch);

    expect(d.trucks[1]!.phase).toBe('atBay'); // 막혀서 멈춘 채로 끝나지 않는다
    expect(d.trucks[0]!.active).toBe(false);
    expect(minGap).toBeGreaterThan(TRUCK.width + 0.3);
  });

  it('베일은 배출 → 지게차 적치 → (출하 단계가 오면) 지게차가 싣고 화면 밖으로 나간다', () => {
    const d = new Director();
    d.sync(input({ bales: [bale('BL-1', 'created')] }), T0);
    const sim = d.bales.find((b) => b.active)!;
    expect(sim.state).toBe('ejecting');

    run(d, 4);
    expect(sim.state === 'chute' || sim.state === 'carried').toBe(true);
    if (sim.state === 'chute') expect(sim.z).toBeCloseTo(BALE_REST[2], 2);

    run(d, 30);
    expect(sim.state).toBe('stack');
    expect(sim.z).toBeCloseTo(YARD.slotZ, 3);
    // 출하 단계가 오기 전에는 그대로 둔다
    run(d, 20);
    expect(sim.state).toBe('stack');

    d.sync(input({ bales: [{ ...bale('BL-1', 'shipped'), stageTimes: { created: iso(T0), shipped: iso(T0 + 60_000) } }] }), T0 + 60_000);
    run(d, 40);
    expect(sim.active).toBe(false);
    // 다시 받아도 되살리지 않는다
    d.sync(input({ bales: [{ ...bale('BL-1', 'shipped') }] }), T0 + 120_000);
    expect(d.bales.some((b) => b.active)).toBe(false);
  });

  it('섹터 더미는 서버 적재율을 따라가고, 압축 연출은 압축 중인 배치와 압축기 가동이 함께일 때만 돈다', () => {
    const d = new Director();
    const batch: Batch = { id: 'b1', stage: 'compressing', mix: [{ sectorId: 'tank-a1', percent: 100 }], avgMoisturePercent: 11, targetPressureMpa: 28, stageTimes: {}, updatedAt: NOW };
    d.sync(input({ devices: { 'tank-a1': tankState(), 'compressor-1': compressorState() }, batches: [batch] }), T0);
    expect(d.fill['tank-a1']).toBe(72.4); // 처음 받은 값은 바로 보여 준다
    run(d, 1);
    expect(d.pressing).toBe(true);
    expect(d.ram).toBeGreaterThan(0);

    d.sync(input({ devices: { 'tank-a1': tankState(), 'compressor-1': compressorState() }, batches: [{ ...batch, stage: 'completed' }] }), T0 + 9000);
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

    const snapshot = () => JSON.stringify({ t: d.t, trucks: d.trucks.map((t) => [t.x, t.z, t.wheel]), fork: [d.forklift.x, d.forklift.z, d.forklift.heading], belt: d.beltOffset, bales: d.bales.map((b) => [b.x, b.z]), workers: d.workers.map((w) => [w.x, w.z, w.stride]) });
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
    <StudioView data={demoData(T0, 30)} jointSource={fixedSource()} tier="high" disconnected={false} lastReceivedAt={NOW} paused={false} example={false} onFailed={() => {}} {...over} />
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
    expect(screen.getByLabelText('섹터 A1 연결 끊김')).toBeInTheDocument();
    expect(screen.getByText('시스템 연결 끊김')).toBeInTheDocument();
    expect(screen.getAllByText('마지막 값')).toHaveLength(3);
    // 공정 추적도 진행 중인 것처럼 보이지 않는다
    expect(within(screen.getByRole('region', { name: '공정 추적' })).queryByText('진행 중')).not.toBeInTheDocument();
  });

  it('끊긴 동안 들어온(것처럼 보이는) 값으로는 새 움직임을 시작하지 않는다', () => {
    const { rerender } = render(view({ data: input(), disconnected: true }));
    rerender(view({ data: input({ vehicles: [vehicle('v9', 'arrived')] }), disconnected: true }));
    expect(stage.last?.director.trucks.some((t) => t.active)).toBe(false);
    // 복구되면 받은 상태를 반영한다
    rerender(view({ data: input({ vehicles: [vehicle('v9', 'identified', 'tank-a1')] }), disconnected: false }));
    expect(stage.last?.director.trucks.filter((t) => t.active)).toHaveLength(1);
  });

  it('예시 값이면 "예시 데이터"라고 표시한다', () => {
    const { rerender } = render(view({ example: true }));
    expect(screen.getByText('예시 데이터')).toBeInTheDocument();
    rerender(view({ example: false }));
    expect(screen.queryByText('예시 데이터')).not.toBeInTheDocument();
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
    act(() => void store.dispatch(vehicleReceived(vehicle('veh-7', 'identified', 'tank-a1', Date.now()))));
    expect(screen.getByLabelText('차량 12가 3456 인식 완료')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '공정 기록' })).getByText('예시자원')).toBeInTheDocument();
    expect(stage.last?.director.trucks.filter((t) => t.active)).toHaveLength(1);
  });

  it('기기를 고르면 기존 홈용 조작과 기기 페이지 링크만 나온다 (위험 조작·비상정지 모양 버튼 없음)', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore(<LiveStudio onFailed={() => {}} />, { devices });
    act(() => void store.dispatch(devicesReceived(devices)));
    await user.click(screen.getByLabelText(/로봇팔 이동, 작동 중/));

    const panel = screen.getByRole('complementary', { name: '로봇팔 상세' });
    expect(within(panel).getByRole('button', { name: '일시정지' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: '상세 보기' })).toHaveAttribute('href', '/robot');
    // 수동 모드 전환·섹터 지정 집기·설정 변경은 기기 페이지에만 있다
    expect(within(panel).queryByRole('button', { name: /모드로 전환/ })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /집기/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/비상/)).not.toBeInTheDocument();
  });
});

describe('공정 추적: 서버 단계를 여섯 칸에 옮겨 적는다', () => {
  it('지금 그 단계에 있는 대상이 있는 칸만 진행 중이다', () => {
    const batch: Batch = { id: 'batch-0412', stage: 'compressing', mix: [{ sectorId: 'tank-a1', percent: 40 }, { sectorId: 'tank-b1', percent: 60 }], avgMoisturePercent: 11, targetPressureMpa: 28.4, stageTimes: { compressing: NOW }, updatedAt: NOW };
    const steps = cycleSteps({ vehicles: [vehicle('v1', 'identified', 'tank-a2')], batches: [batch], bales: [] });
    expect(steps.map((s) => s.label)).toEqual(['입고', '차량 인식', '하역', '배합', '압축', '출하']);
    expect(steps.filter((s) => s.active).map((s) => s.key)).toEqual(['identify', 'press']);
    expect(steps[1]!.detail).toBe('12가 3456 · 예시자원');
    expect(steps[4]!.detail).toBe('목표 28.4 MPa');
    expect(steps[5]!.detail).toBeNull();
  });
});

describe('참고 화면에 맞춘 화면 구성', () => {
  const view = (over: Partial<Parameters<typeof StudioView>[0]> = {}) => (
    <StudioView data={demoData(T0, 30)} jointSource={fixedSource()} tier="high" disconnected={false} lastReceivedAt={NOW} paused={false} example={false} onFailed={() => {}} {...over} />
  );

  it('카메라 거리는 세 단계다: 부지 전체(wide) > 구역(mid, 기본) > 대상(close)', () => {
    expect(VIEWS.filter((v) => v.tier === 'wide')).toEqual([WIDE_VIEW]);
    expect(AREAS.every((v) => v.tier === 'mid')).toBe(true);
    expect(DEFAULT_VIEW.tier).toBe('mid');
    expect(tierOf(WIDE_VIEW.distance)).toBe('wide');
    AREAS.forEach((area) => expect(tierOf(area.distance)).toBe('mid'));
    ['veh:v1', 'forklift', 'bale:b1', 'dev:compressor-1', 'dev:robot-1', 'dev:tank-a1'].forEach((key) => expect(tierOf(closeDistance(key))).toBe('close'));
    expect(TIER_DISTANCE.wide).toBeGreaterThan(TIER_DISTANCE.mid);
    expect(TIER_DISTANCE.mid).toBeGreaterThan(TIER_DISTANCE.close);
  });

  it('경로 점선은 고른 차량에만 그리고, 대상을 고르면 그 위에 작은 이름표가 뜬다', async () => {
    const user = userEvent.setup();
    const data = input({ vehicles: [vehicle('v1', 'identified', 'tank-a1')] });
    render(view({ data }));
    expect(stage.last?.routeKeys.current).toEqual([]);
    const pin = screen.getByLabelText('차량 12가 3456 인식 완료');
    await user.click(pin);
    expect(stage.last?.routeKeys.current).toEqual(['veh:v1']);
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    expect(within(pin).getByText(/12가 3456/)).toBeInTheDocument();
  });

  it('상세 패널은 4~5줄만 바로 보이고 나머지는 "자세히" 안에 있다', async () => {
    const user = userEvent.setup();
    render(view({ data: input({ vehicles: [vehicle('v1', 'unloading', 'tank-b1')] }) }));
    await user.click(screen.getByLabelText('차량 12가 3456 하역 중'));
    const panel = screen.getByRole('complementary', { name: '차량 상세' });
    const visibleRows = [...panel.querySelectorAll('dl.st-rows > div')].filter((row) => !row.closest('details'));
    expect(visibleRows.length).toBeLessThanOrEqual(5);
    expect(within(panel).getByText('자세히')).toBeInTheDocument();
    expect(within(panel).getByText('출차')).toBeInTheDocument(); // 접혀 있어도 내용은 있다
  });

  it('검색으로 번호판을 찾아 고른다', async () => {
    const user = userEvent.setup();
    render(view({ data: input({ vehicles: [vehicle('v1', 'identified', 'tank-a1')] }) }));
    await user.type(screen.getByRole('searchbox', { name: '장면에서 찾기' }), '3456');
    await user.click(screen.getByRole('option', { name: /12가 3456/ }));
    expect(screen.getByRole('complementary', { name: '차량 상세' })).toBeInTheDocument();
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
    const bar = document.querySelector<HTMLElement>('.st-top')!;
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

  it('기본은 폰 low · 태블릿 standard · 데스크톱 high이고, 측정값은 한 단계까지만 반영한다', () => {
    expect(studioTier('phone', null, null)).toBe('low');
    expect(studioTier('tablet', null, null)).toBe('standard');
    expect(studioTier('desktop', null, null)).toBe('high');
    expect(studioTier('phone', 'high', null)).toBe('standard');
    expect(studioTier('desktop', 'low', null)).toBe('standard');
    expect(studioTier('tablet', 'low', null)).toBe('low');
    expect(studioTier('tablet', 'standard', null)).toBe('standard');
  });

  it('사용자가 직접 고른 단계는 그대로 따른다', () => {
    expect(studioTier('phone', null, 'high')).toBe('high');
    expect(studioTier('desktop', 'high', 'low')).toBe('low');
  });

  it('low는 후처리·실시간 그림자·패널 흐림 없이, standard·low는 초당 30으로 묶는다', () => {
    expect(STUDIO_PROFILES.low).toMatchObject({ maxDpr: 1, post: false, shadowMap: 0, ao: 'baked', bloom: false, tiltShift: false, panelBlur: 'none', maxFps: 30 });
    expect(STUDIO_PROFILES.standard).toMatchObject({ maxDpr: 1.5, ao: 'n8ao-half', shadowMap: 2048, tiltShift: false, panelBlur: 'main', maxFps: 30 });
    expect(STUDIO_PROFILES.high.shadowMap).toBeLessThanOrEqual(2048);
  });

  it('화면은 단계를 data-tier로 적어 패널 흐림이 단계를 따른다', () => {
    const { container } = render(<StudioView data={demoData(T0, 30)} jointSource={fixedSource()} tier="low" disconnected={false} lastReceivedAt={NOW} paused={false} example={false} onFailed={() => {}} />);
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
    render(<PhoneSheet data={demoData(T0, 30)} disconnected={false} selection="dev:tank-b2" onSelect={onSelect} />);
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
    const { rerender } = render(<Detail data={data} disconnected={false} selection="dev:tank-a1" onSelect={() => {}} collapsible />);
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
