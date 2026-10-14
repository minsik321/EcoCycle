import ReactThreeTestRenderer from '@react-three/test-renderer';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Group, Object3D } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bale, Batch, DeviceId, DeviceState, Vehicle } from '@ecocycle/shared';
import { chainSpecFor } from '../scene/robot/chain';
import { fixedSource } from '../scene/robot/jointSource';
import type { JointSource } from '../scene/robot/jointSource';
import { cctvToggled, connectionChanged, devicesReceived, vehicleReceived } from '../store';
import { NOW, conveyorState, renderWithStore, robotState, tankState } from '../test/utils';
import { LiveStudio } from './LiveStudio';
import type { StageProps } from './Stage';
import { StudioView } from './StudioView';
import { Robot } from './actors/Robot';
import { demoData } from './demo/demoData';
import { cycleSteps } from './overlay/text';
import { Director } from './sim/director';
import { Sim } from './three/Fx';
import type { StudioData } from './types';
import { EMPTY_DATA } from './types';
import { APRON, BALE_REST, SCALE, TRUCK, YARD, bayCenterZ } from './world/layout';

// 스튜디오 탭의 고정 규칙을 점검한다: 연결이 끊기면 모든 움직임이 멈추고 "연결 끊김"과 마지막 수신 시각이 보인다,
// 화면이 숨겨지거나 CCTV가 열리면 그리기를 멈춘다, 움직임은 서버 단계만 따른다, 조작은 기존 컴포넌트만 쓴다.
// 테스트 환경에는 그래픽(WebGL)이 없어 3D 무대(Stage)는 가짜로 바꾸고, 넘기는 값과 그 위의 HTML을 본다.

const stage = vi.hoisted(() => ({ last: null as StageProps | null }));

vi.mock('./Stage', () => ({
  Stage: (props: StageProps) => {
    stage.last = props;
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
  it('끊기면 월드 시계가 멈춰 트럭·지게차·벨트·작업자가 제자리에 있고, 복구되면 다시 흐른다', async () => {
    const d = new Director();
    d.sync(input({ devices: { 'conveyor-z': conveyorState() }, vehicles: [vehicle('v1', 'arrived')], bales: [bale('BL-1', 'created')] }), T0);
    const renderer = await ReactThreeTestRenderer.create(<Sim director={d} frozen={false} />);
    await renderer.advanceFrames(60, 1 / 30);
    expect(d.t).toBeGreaterThan(1.5);

    const snapshot = () => JSON.stringify({ t: d.t, trucks: d.trucks.map((t) => [t.x, t.z, t.wheel]), fork: [d.forklift.x, d.forklift.z, d.forklift.heading], belt: d.beltOffset, bales: d.bales.map((b) => [b.x, b.z]), workers: d.workers.map((w) => [w.x, w.z, w.stride]) });
    const before = snapshot();
    await renderer.update(<Sim director={d} frozen />);
    await renderer.advanceFrames(90, 1 / 30);
    expect(snapshot()).toBe(before);

    await renderer.update(<Sim director={d} frozen={false} />);
    await renderer.advanceFrames(30, 1 / 30);
    expect(snapshot()).not.toBe(before);
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
    <StudioView data={demoData(T0, 30)} jointSource={fixedSource()} disconnected={false} lastReceivedAt={NOW} paused={false} example={false} onFailed={() => {}} {...over} />
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
    expect(screen.getByLabelText('탱크 A1 연결 끊김')).toBeInTheDocument();
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
    // 수동 모드 전환·탱크 지정 집기·설정 변경은 기기 페이지에만 있다
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

/** 기기 ID 형식이 맞는지 컴파일 때 확인 (핀 key는 `dev:<기기 ID>`) */
const _deviceKey: `dev:${DeviceId}` = 'dev:compressor-1';
void _deviceKey;
