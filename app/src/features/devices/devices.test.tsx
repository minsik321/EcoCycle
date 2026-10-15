import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Batch, DeviceState, RobotJointsMessage } from '@ecocycle/shared';
import * as api from '../../api';
import { createJointBuffer } from '../../realtime';
import { connectionChanged, devicesReceived } from '../../store';
import { processSynced as processStateReceived } from '../../store/slices/process';
import * as realtimeClient from '../../store/realtimeClient';
import { ADMIN, NOW, OPERATOR, VIEWER, conveyorState, makeStore, renderWithStore, robotState } from '../../test/utils';
import { CompressorPage } from '../compressor';
import { ConveyorPage } from '../conveyor';
import { RobotPage } from '../robot';

// 로봇팔·압축기·컨베이어 기기 페이지 (DevicePage 틀): 맨 위 그림·상태, 주요 수치, 지금/다음, 조작 줄, 자세히(닫혀 있음).

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getHistory: vi.fn(),
  getPlantHistory: vi.fn(),
  getAlarms: vi.fn(),
  getRecords: vi.fn(),
  getRobotModel: vi.fn(),
  sendCommand: vi.fn(),
}));
vi.mock('../../store/realtimeClient', () => ({
  startRealtime: vi.fn(),
  stopRealtime: vi.fn(),
  setAppVisible: vi.fn(),
  acquireJoints: vi.fn(),
  getJointBuffer: vi.fn(),
}));

const release = vi.fn();
const compressorState = (over: Partial<Extract<DeviceState, { type: 'compressor' }>> = {}): DeviceState => ({
  id: 'compressor-1',
  type: 'compressor',
  status: 'normal',
  running: true,
  pressureMpa: 28.7,
  temperatureC: 42.3,
  cycleStage: 'pressing',
  updatedAt: NOW,
  ...over,
});

const batch = (id: string, stage: Batch['stage'], targetPressureMpa = 28.5): Batch => ({
  id,
  stage,
  mix: [
    { sectorId: 'tank-a1', percent: 60 },
    { sectorId: 'tank-b2', percent: 40 },
  ],
  avgMoisturePercent: 11.2,
  targetPressureMpa,
  stageTimes: {},
  updatedAt: NOW,
});

function jointsMessage(joints: number[], seq = 1): RobotJointsMessage {
  return {
    type: 'robot.joints',
    deviceId: 'robot-1',
    seq,
    ts: new Date().toISOString(),
    joints,
    gripper: { closed: true, holding: true },
    phase: 'move',
    targetTankId: 'tank-a1',
  };
}

const openDetails = () => userEvent.click(screen.getByRole('button', { name: '자세히' }));
const tile = (label: string) => screen.getByRole('group', { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(realtimeClient.acquireJoints).mockReturnValue(release);
  vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(null);
  vi.mocked(api.getRobotModel).mockRejectedValue(new api.ApiError(503, 'X', ''));
  vi.mocked(api.getAlarms).mockResolvedValue([]);
  vi.mocked(api.getRecords).mockResolvedValue({ items: [], total: 7, page: 1, pageSize: 1 });
  vi.mocked(api.getPlantHistory).mockImplementation(async (q) => ({ metric: q.metric, interval: q.interval, from: q.from, to: q.to, points: [{ ts: q.from, value: 400 }, { ts: q.to, value: 412 }] }));
  vi.mocked(api.getHistory).mockImplementation(async (q) => ({
    deviceId: q.deviceId,
    metric: q.metric,
    interval: q.interval,
    from: q.from,
    to: q.to,
    points: [
      { ts: q.from, value: 10 },
      { ts: q.to, value: 20 },
    ],
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RobotPage', () => {
  it('그림 없이 머리 줄(이름·상태·지금 하는 일), 주요 수치 4칸(모드·현재 작업·이번 시간 집기·그리퍼)', async () => {
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState({ phase: 'move', targetTankId: 'tank-a2', gripper: { closed: true, holding: true } })] });
    expect(screen.getByRole('heading', { name: '로봇팔' })).toBeInTheDocument();
    expect(within(screen.getByLabelText('로봇팔 상태')).getByText('작동 중')).toBeInTheDocument();
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('섹터 A2 파지를 컨베이어로 옮기는 중');
    // 정보 없는 그림은 없다: 옆모습 그림이 없고 주요 수치가 폭 전체 격자에 놓인다
    expect(screen.queryByRole('img', { name: /옆모습/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('주요 수치')).toHaveClass('md:grid-cols-4');
    expect(tile('모드')).toHaveTextContent('자동');
    expect(tile('현재 작업')).toHaveTextContent('옮기는 중');
    expect(tile('그리퍼')).toHaveTextContent('잡고 있음');
    // 이번 시간 집기: 서버가 센 줄 수(total)를 그대로
    expect(await within(tile('이번 시간 집기')).findByText('7')).toBeInTheDocument();
    const query = vi.mocked(api.getRecords).mock.calls.find((c) => c[1].pageSize === 1)!;
    expect(query[0]).toBe('/robots/robot-1/picks/records');
    expect(query[1]).toMatchObject({ page: 1, pageSize: 1 });
    expect(new Date(query[1].from).getMinutes()).toBe(0);
  });

  it('새 집기가 기록되면(pickRecordsRevision) 이번 시간 집기를 다시 받는다', async () => {
    const { store } = renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    await within(tile('이번 시간 집기')).findByText('7');
    const before = vi.mocked(api.getRecords).mock.calls.filter((c) => c[1].pageSize === 1).length;
    vi.mocked(api.getRecords).mockResolvedValue({ items: [], total: 8, page: 1, pageSize: 1 });
    act(() => {
      store.dispatch(devicesReceived([robotState({ pickRecordsRevision: 1, updatedAt: '2026-10-13T05:00:05.000Z' })]));
    });
    expect(await within(tile('이번 시간 집기')).findByText('8')).toBeInTheDocument();
    expect(vi.mocked(api.getRecords).mock.calls.filter((c) => c[1].pageSize === 1).length).toBe(before + 1);
  });

  it('지금/다음은 서버 값으로: 작업 섹터 → 컨베이어, 섹터 지정이면 지정 섹터 차례', () => {
    const { store } = renderWithStore(<RobotPage />, {
      me: ADMIN,
      devices: [robotState({ mode: 'auto_pinned', pinnedSectors: ['tank-a1', 'tank-b1'], phase: 'pick', targetTankId: 'tank-a1' })],
    });
    act(() => {
      store.dispatch(processStateReceived({ vehicles: [], batches: [batch('batch-0413', 'mixing')], bales: [], updatedAt: NOW }));
    });
    const nowNext = screen.getByLabelText('지금과 다음');
    expect(nowNext).toHaveTextContent('섹터 A1 → 컨베이어 · 배치 #0413');
    expect(nowNext).toHaveTextContent('지정 섹터 A1·B1 차례로');
    expect(tile('모드')).toHaveTextContent('섹터 지정');
  });

  it('운전 모드(세 칸)는 맨 위 쪽에, 시작·정지는 조작 줄에. 비상정지처럼 보이는 버튼은 없다', () => {
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    const mode = screen.getByRole('region', { name: '운전 모드' });
    expect(within(mode).getAllByRole('radio')).toHaveLength(3);
    const bar = screen.getByRole('region', { name: '조작' });
    expect(within(bar).getByRole('button', { name: '일시정지' })).toBeEnabled();
    expect(within(bar).queryByRole('button', { name: '적용' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /비상/ })).not.toBeInTheDocument();
  });

  it('"자세히"는 처음에 닫혀 있고, 열면 진단(관리자)·설정·오류 로그와 안전 안내가 있다', async () => {
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    expect(screen.queryByLabelText('관절 값')).not.toBeInTheDocument();
    await openDetails();
    expect(screen.getByLabelText('관절 값')).toHaveTextContent('진단');
    expect(screen.getByLabelText('동작 속도')).toBeEnabled();
    expect(await screen.findByLabelText('오류 로그 (최근 7일)')).toBeInTheDocument();
    expect(screen.getByText(/안전 장치가 아닙니다/)).toBeInTheDocument();
  });

  it('작업자에게는 진단이 없고 설정을 바꿀 수 없다', async () => {
    renderWithStore(<RobotPage />, { me: OPERATOR, devices: [robotState()] });
    await openDetails();
    expect(screen.queryByLabelText('관절 값')).not.toBeInTheDocument();
    expect(screen.getByLabelText('동작 속도')).toBeDisabled();
    await screen.findByLabelText('오류 로그 (최근 7일)');
  });

  it('열람자는 조작 줄과 운전 모드가 없다', async () => {
    renderWithStore(<RobotPage />, { me: VIEWER, devices: [robotState()] });
    expect(screen.queryByRole('region', { name: '조작' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '운전 모드' })).not.toBeInTheDocument();
    expect(tile('모드')).toHaveTextContent('자동');
  });

  it('맨 아래에 사이클 통계(그대로)와 집기 기록이 있다', async () => {
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    expect(screen.getByLabelText('사이클 통계')).toHaveTextContent('서버가 값을 제공해야');
    expect(screen.getByRole('heading', { name: '집기 기록' })).toBeInTheDocument();
    await within(tile('이번 시간 집기')).findByText('7');
  });

  it('이 페이지에 있는 동안만 관절 값을 구독하고 나가면 해제한다', () => {
    const { unmount } = renderWithStore(<RobotPage />, { devices: [robotState()] });
    expect(realtimeClient.acquireJoints).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('진단: 관절 값을 받기 전에는 기다리는 중이라고 보여 준다', async () => {
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    await openDetails();
    expect(within(screen.getByLabelText('관절 값')).getByRole('status')).toHaveTextContent('관절 값을 기다리는 중');
  });

  it('진단: 관절 값을 모델의 순서·이름·범위대로 보여 준다 (받은 값을 그대로)', async () => {
    const buffer = createJointBuffer({ delaySec: 0 });
    buffer.push(jointsMessage([12.5, -45, 80.2, 0, 35.7, 90]), Date.now());
    vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(buffer);
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    await openDetails();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent('1. base');
    expect(rows[0]).toHaveTextContent('12.5°');
    expect(rows[0]).toHaveTextContent('-170° ~ 170°');
    expect(rows[1]).toHaveTextContent('-45.0°');
    expect(rows[5]).toHaveTextContent('90.0°');
    expect(within(table).getByRole('meter', { name: 'shoulder 범위 안 위치' })).toHaveAttribute('aria-valuenow', '-45');
  });

  it('진단: 서버의 로봇 모델이 있으면 그 관절 이름과 범위로 바뀐다', async () => {
    vi.mocked(api.getRobotModel).mockResolvedValue({
      deviceId: 'robot-1',
      axisCount: 2,
      joints: [
        { name: 'pan', minDeg: -90, maxDeg: 90, zeroDeg: 0 },
        { name: 'tilt', minDeg: 0, maxDeg: 45, zeroDeg: 0 },
      ],
      linkLengthsM: [0.5, 0.5],
    });
    const buffer = createJointBuffer({ delaySec: 0 });
    buffer.push(jointsMessage([10, 20]), Date.now());
    vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(buffer);
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    await openDetails();

    expect(await screen.findByText('2. tilt')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByText('1. base')).not.toBeInTheDocument();
  });

  it('연결이 끊기면 값은 "–", 상태는 연결 끊김, 진단 표는 마지막 값이라고 알린다', async () => {
    const buffer = createJointBuffer({ delaySec: 0 });
    buffer.push(jointsMessage([1, 2, 3, 4, 5, 6]), Date.now());
    vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(buffer);
    const { store } = renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    await openDetails();
    await screen.findByRole('table');
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    const hero = screen.getByLabelText('로봇팔 상태');
    expect(within(hero).getByText('연결 끊김')).toBeInTheDocument();
    expect(within(hero).getByText(/마지막 수신/)).toBeInTheDocument();
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('–');
    for (const label of ['모드', '현재 작업', '이번 시간 집기', '그리퍼']) expect(tile(label)).toHaveTextContent('–');
    expect(within(screen.getByLabelText('관절 값')).getByRole('status')).toHaveTextContent('마지막으로 받은 값입니다');
    expect(screen.getByRole('table')).toHaveClass('opacity-50');
  });

  it('진단: 연결은 되어 있는데 관절 값이 3초 넘게 안 오면 늦어진다고 알린다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const buffer = createJointBuffer({ delaySec: 0 });
    buffer.push(jointsMessage([1, 2, 3, 4, 5, 6]), Date.now());
    vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(buffer);
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState()] });
    await openDetails();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(within(screen.getByLabelText('관절 값')).getByRole('status')).toHaveTextContent('수신이 늦어지고');
  });

  it('상태를 받기 전에는 불러오는 중이다', () => {
    renderWithStore(<RobotPage />);
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('불러오는 중');
    expect(tile('모드')).toHaveTextContent('–');
  });
});

describe('ConveyorPage', () => {
  it('벨트 그림 없이 주요 수치(가동·적재 정도·압축기로 가는 중), 조작 줄', async () => {
    renderWithStore(<ConveyorPage />, { me: ADMIN, devices: [conveyorState()] });
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('압축기로 2덩어리 이송 중');
    expect(screen.queryByRole('img', { name: /컨베이어 그림/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('주요 수치')).toHaveClass('md:grid-cols-3');
    expect(tile('가동')).toHaveTextContent('가동');
    expect(tile('적재 정도')).toHaveTextContent('40%');
    expect(tile('압축기로 가는 중')).toHaveTextContent('2덩어리');
    expect(within(screen.getByRole('region', { name: '조작' })).getByRole('button', { name: '정지' })).toBeEnabled();
    // 적재 정도 추이선: 최근 24시간 1시간 간격
    await vi.waitFor(() => expect(api.getHistory).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'conveyor-z', metric: 'load', interval: '1h' }), expect.anything()));
  });

  it('멈추면 가동은 정지, 하는 일은 정지 상태', () => {
    renderWithStore(<ConveyorPage />, { devices: [{ ...conveyorState(), running: false } as DeviceState] });
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('정지 상태입니다');
    expect(tile('가동')).toHaveTextContent('정지');
  });

  it('지금/다음은 배합 중인 배치와 다음 배치', () => {
    const { store } = renderWithStore(<ConveyorPage />, { devices: [conveyorState()] });
    act(() => {
      store.dispatch(processStateReceived({ vehicles: [], batches: [batch('batch-0413', 'mixing'), batch('batch-0414', 'planned')], bales: [], updatedAt: NOW }));
    });
    const nowNext = screen.getByLabelText('지금과 다음');
    expect(nowNext).toHaveTextContent('배치 #0413 파지를 압축기로 이송');
    expect(nowNext).toHaveTextContent('배치 #0414 (A1 60% · B2 40%)');
  });

  it('이력 그래프·속도 설정·알람 이력은 "자세히" 안에 있고 열 때 요청한다', async () => {
    renderWithStore(<ConveyorPage />, { me: ADMIN, devices: [conveyorState()] });
    expect(screen.queryByLabelText('이송 속도')).not.toBeInTheDocument();
    await openDetails();
    expect(screen.getByLabelText('이송 속도')).toBeEnabled();
    await vi.waitFor(() => expect(api.getHistory).toHaveBeenCalledWith(expect.objectContaining({ metric: 'load', interval: '10m' }), expect.anything()));
    expect(await screen.findByText('최근 7일간 알람이 없습니다.')).toBeInTheDocument();
  });

  it('설정 변경은 확인 단계를 거쳐 보낸다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue({ idempotencyKey: 'k', accepted: { commandId: 'cmd-1', status: 'accepted' } });
    renderWithStore(<ConveyorPage />, { me: ADMIN, devices: [conveyorState()] });
    await openDetails();
    await userEvent.type(screen.getByLabelText('이송 속도'), '80');
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));
    expect(api.sendCommand).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '변경' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![0]).toBe('conveyor-z');
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'update_setting', key: 'speedPercent', value: 80, confirm: true });
  });

  it('연결이 끊기면 값은 "–"이고 조작을 막는다', () => {
    const { store } = renderWithStore(<ConveyorPage />, { me: OPERATOR, devices: [conveyorState()] });
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(within(screen.getByLabelText('컨베이어 Section Z 상태')).getByText('연결 끊김')).toBeInTheDocument();
    expect(within(screen.getByLabelText('컨베이어 Section Z 상태')).getByText(/마지막 수신/)).toBeInTheDocument();
    for (const label of ['가동', '적재 정도', '압축기로 가는 중']) expect(tile(label)).toHaveTextContent('–');
    expect(within(screen.getByRole('region', { name: '조작' })).getByRole('button', { name: '정지' })).toBeDisabled();
  });
});

describe('CompressorPage', () => {
  it('압력 칸이 지금 압력 vs 지금 배치의 목표를 작은 게이지로 보여 주고 그림은 없다', () => {
    const { store } = renderWithStore(<CompressorPage />, { me: ADMIN, devices: [compressorState()] });
    act(() => {
      store.dispatch(processStateReceived({ vehicles: [], batches: [batch('batch-0412', 'compressing', 28.5), batch('batch-0413', 'mixing', 27.8)], bales: [], updatedAt: NOW }));
    });
    expect(screen.queryByRole('img', { name: /압축기 그림/ })).not.toBeInTheDocument();
    // 같은 숫자를 두 번 쓰지 않는다: 값은 칸에 한 번(28.7 / 28.5)이고 게이지는 막대와 목표 눈금뿐
    expect(screen.getAllByText('28.7')).toHaveLength(1);
    const gauge = within(tile('압력')).getByTestId('tile-gauge');
    expect(gauge.children).toHaveLength(2);
    expect((gauge.children[0] as HTMLElement).style.width).toBe('82%');
    expect((gauge.children[1] as HTMLElement).style.left).toBe('81%');
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('배치 #0412 압축 중 · 목표 28.5 MPa');
  });

  it('주요 수치: 압력(/ 목표), 온도, 오늘 베일, 사이클 단계', async () => {
    const { store } = renderWithStore(<CompressorPage />, { me: ADMIN, devices: [compressorState({ cycleStage: 'ejecting' })] });
    act(() => {
      store.dispatch(processStateReceived({ vehicles: [], batches: [batch('batch-0412', 'compressing', 28.5)], bales: [], updatedAt: NOW }));
    });
    expect(tile('압력')).toHaveTextContent('28.7MPa/ 28.5');
    expect(tile('온도')).toHaveTextContent('42.3°C');
    expect(tile('사이클 단계')).toHaveTextContent('결속·배출');
    // 오늘 베일은 공장 요약 값, 추이선은 요약 이력
    expect(tile('오늘 베일')).toHaveTextContent('–');
    await vi.waitFor(() => expect(api.getPlantHistory).toHaveBeenCalledWith(expect.objectContaining({ metric: 'balesToday' }), expect.anything()));
  });

  it('지금/다음: 지금 배치와 배치·베일 화면 링크, 다음 배치', () => {
    const { store } = renderWithStore(<CompressorPage />, { devices: [compressorState()] });
    act(() => {
      store.dispatch(processStateReceived({ vehicles: [], batches: [batch('batch-0413', 'mixing', 27.8), batch('batch-0412', 'compressing', 28.5)], bales: [], updatedAt: NOW }));
    });
    const nowNext = screen.getByLabelText('지금과 다음');
    expect(nowNext).toHaveTextContent('배치 #0412 · A1 60% · B2 40% · 목표 28.5 MPa');
    expect(within(nowNext).getByRole('link', { name: '배치·베일에서 보기' })).toHaveAttribute('href', '/records/batches');
    expect(nowNext).toHaveTextContent('배치 #0413');
  });

  it('이력 그래프(압력·온도)·설정·점검 이력은 "자세히" 안에 있다', async () => {
    renderWithStore(<CompressorPage />, { me: ADMIN, devices: [compressorState()] });
    expect(screen.queryByLabelText('압력 상한')).not.toBeInTheDocument();
    await openDetails();
    await vi.waitFor(() => expect(api.getHistory).toHaveBeenCalledWith(expect.objectContaining({ metric: 'pressure', interval: '10m' }), expect.anything()));
    expect(screen.getByRole('button', { name: '압력' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '온도' }));
    await vi.waitFor(() => expect(vi.mocked(api.getHistory).mock.calls.at(-1)![0]).toMatchObject({ metric: 'temperature', interval: '10m' }));
    expect(screen.getByLabelText('압력 상한')).toBeInTheDocument();
    expect(screen.getByLabelText('점검 이력')).toHaveTextContent('서버가 값을 제공해야');
  });

  it('연결이 끊기면 압력 게이지 막대와 주요 수치는 "–"', () => {
    const { store } = renderWithStore(<CompressorPage />, { devices: [compressorState()] });
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(within(tile('압력')).getByTestId('tile-gauge').children).toHaveLength(0);
    for (const label of ['압력', '온도', '오늘 베일', '사이클 단계']) expect(tile(label)).toHaveTextContent('–');
  });

  it('멈췄으면 사이클 단계는 "정지"', () => {
    renderWithStore(<CompressorPage />, { devices: [compressorState({ running: false })] });
    expect(tile('사이클 단계')).toHaveTextContent('정지');
  });
});

describe('라우터 없이도 훅이 깨지지 않는다', () => {
  it('store만 있는 환경에서 RobotPage를 그릴 수 있다', async () => {
    const store = makeStore({ devices: [robotState()] });
    render(
      <Provider store={store}>
        <MemoryRouter>
          <RobotPage />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByRole('heading', { name: '로봇팔' })).toBeInTheDocument();
    await within(screen.getByRole('group', { name: '이번 시간 집기' })).findByText('7');
  });
});
