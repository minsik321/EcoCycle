import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceState, RobotJointsMessage } from '@ecocycle/shared';
import * as api from '../../api';
import { createJointBuffer } from '../../realtime';
import { connectionChanged } from '../../store';
import * as realtimeClient from '../../store/realtimeClient';
import { ADMIN, NOW, OPERATOR, VIEWER, conveyorState, makeStore, renderWithStore, robotState } from '../../test/utils';
import { CompressorPage } from '../compressor';
import { ConveyorPage } from '../conveyor';
import { RobotPage } from '../robot';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getHistory: vi.fn(),
  getAlarms: vi.fn(),
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
const compressorState = (): DeviceState => ({
  id: 'compressor-1',
  type: 'compressor',
  status: 'normal',
  running: true,
  pressureMpa: 28.7,
  temperatureC: 42.3,
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(realtimeClient.acquireJoints).mockReturnValue(release);
  vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(null);
  vi.mocked(api.getRobotModel).mockRejectedValue(new api.ApiError(503, 'X', ''));
  vi.mocked(api.getAlarms).mockResolvedValue([]);
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
  it('현재 상태와 조작, 설정, 오류 로그, 사이클 통계 자리가 있다', async () => {
    renderWithStore(<RobotPage />, { me: ADMIN, devices: [robotState({ phase: 'move', targetTankId: 'tank-a2' })] });
    const status = screen.getByRole('region', { name: '현재 상태' });
    expect(within(status).getByText('자동')).toBeInTheDocument();
    expect(within(status).getByText('이동')).toBeInTheDocument();
    expect(within(status).getByText('탱크 A2')).toBeInTheDocument();

    const controls = screen.getByLabelText('조작');
    expect(within(controls).getByRole('button', { name: '수동 모드로 전환' })).toBeEnabled(); // 위험 조작은 기기 페이지에서만
    expect(within(controls).getByRole('button', { name: '일시정지' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /비상/ })).not.toBeInTheDocument();
    expect(screen.getByText(/안전 장치가 아닙니다/)).toBeInTheDocument();

    expect(screen.getByLabelText('동작 속도')).toBeInTheDocument();
    expect(await screen.findByLabelText('오류 로그 (최근 7일)')).toBeInTheDocument();
    expect(screen.getByLabelText('사이클 통계')).toHaveTextContent('서버가 값을 제공해야');
  });

  it('작업자는 위험 조작이 비활성이고 설정도 바꿀 수 없다', async () => {
    renderWithStore(<RobotPage />, { me: OPERATOR, devices: [robotState()] });
    expect(screen.getByRole('button', { name: '수동 모드로 전환' })).toBeDisabled();
    expect(screen.getByLabelText('동작 속도')).toBeDisabled();
    await screen.findByLabelText('오류 로그 (최근 7일)');
  });

  it('열람자는 조작 버튼이 없다', async () => {
    renderWithStore(<RobotPage />, { me: VIEWER, devices: [robotState()] });
    const controls = screen.getByLabelText('조작');
    expect(within(controls).queryByRole('button', { name: '일시정지' })).not.toBeInTheDocument();
    await screen.findByLabelText('오류 로그 (최근 7일)');
  });

  it('이 페이지에 있는 동안만 관절 값을 구독하고 나가면 해제한다', async () => {
    const { unmount } = renderWithStore(<RobotPage />, { devices: [robotState()] });
    expect(realtimeClient.acquireJoints).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('관절 값을 받기 전에는 기다리는 중이라고 보여 준다', () => {
    renderWithStore(<RobotPage />, { devices: [robotState()] });
    expect(within(screen.getByLabelText('관절 값')).getByRole('status')).toHaveTextContent('관절 값을 기다리는 중');
  });

  it('관절 값을 모델의 순서·이름·범위대로 보여 준다 (받은 값을 그대로)', async () => {
    const buffer = createJointBuffer({ delaySec: 0 });
    buffer.push(jointsMessage([12.5, -45, 80.2, 0, 35.7, 90]), Date.now());
    vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(buffer);
    renderWithStore(<RobotPage />, { devices: [robotState()] });

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent('1. base');
    expect(rows[0]).toHaveTextContent('12.5°');
    expect(rows[0]).toHaveTextContent('-170° ~ 170°');
    expect(rows[1]).toHaveTextContent('-45.0°');
    expect(rows[5]).toHaveTextContent('90.0°');
    expect(within(table).getByRole('meter', { name: 'shoulder 범위 안 위치' })).toHaveAttribute('aria-valuenow', '-45');
    expect(screen.getByText(/파지를 잡고 있음/, { selector: 'p' })).toBeInTheDocument();
  });

  it('서버의 로봇 모델이 있으면 그 관절 이름과 범위로 바뀐다', async () => {
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
    renderWithStore(<RobotPage />, { devices: [robotState()] });

    expect(await screen.findByText('2. tilt')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.queryByText('1. base')).not.toBeInTheDocument();
  });

  it('연결이 끊기면 마지막으로 받은 값이라고 알리고 흐리게 보여 준다', async () => {
    const buffer = createJointBuffer({ delaySec: 0 });
    buffer.push(jointsMessage([1, 2, 3, 4, 5, 6]), Date.now());
    vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(buffer);
    const { store } = renderWithStore(<RobotPage />, { devices: [robotState()] });
    await screen.findByRole('table');
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(within(screen.getByLabelText('관절 값')).getByRole('status')).toHaveTextContent('마지막으로 받은 값입니다');
    expect(screen.getByRole('table')).toHaveClass('opacity-50');
    expect(screen.getByText('연결 끊김', { selector: 'span' })).toBeInTheDocument();
  });

  it('연결은 되어 있는데 관절 값이 3초 넘게 안 오면 늦어진다고 알린다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const buffer = createJointBuffer({ delaySec: 0 });
    buffer.push(jointsMessage([1, 2, 3, 4, 5, 6]), Date.now());
    vi.mocked(realtimeClient.getJointBuffer).mockReturnValue(buffer);
    renderWithStore(<RobotPage />, { devices: [robotState()] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(within(screen.getByLabelText('관절 값')).getByRole('status')).toHaveTextContent('수신이 늦어지고');
  });

  it('상태를 받기 전에는 불러오는 중이다', async () => {
    renderWithStore(<RobotPage />);
    expect(screen.getByText('로봇 상태를 불러오는 중…')).toBeInTheDocument();
    await screen.findByLabelText('오류 로그 (최근 7일)');
  });
});

describe('ConveyorPage', () => {
  it('가동 상태와 적재 정도, 조작, 속도 설정, 이력, 알람 이력을 보여 준다', async () => {
    renderWithStore(<ConveyorPage />, { me: ADMIN, devices: [conveyorState()] });
    const status = screen.getByRole('region', { name: '현재 상태' });
    expect(within(status).getByText('가동')).toBeInTheDocument();
    expect(within(status).getByText('40%')).toBeInTheDocument();
    expect(within(screen.getByLabelText('조작')).getByRole('button', { name: '정지' })).toBeEnabled();
    expect(screen.getByLabelText('이송 속도')).toBeEnabled();
    await screen.findByRole('img');
    expect(vi.mocked(api.getHistory).mock.calls[0]![0]).toMatchObject({ deviceId: 'conveyor-z', metric: 'load' });
    expect(await screen.findByText('최근 7일간 알람이 없습니다.')).toBeInTheDocument();
  });

  it('설정 변경은 확인 단계를 거쳐 보낸다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue({ idempotencyKey: 'k', accepted: { commandId: 'cmd-1', status: 'accepted' } });
    renderWithStore(<ConveyorPage />, { me: ADMIN, devices: [conveyorState()] });
    await userEvent.type(screen.getByLabelText('이송 속도'), '80');
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));
    expect(api.sendCommand).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '변경' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![0]).toBe('conveyor-z');
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'update_setting', key: 'speedPercent', value: 80, confirm: true });
    await screen.findByRole('img');
  });

  it('연결이 끊기면 값을 마지막 값으로 보여 주고 조작을 막는다', async () => {
    const { store } = renderWithStore(<ConveyorPage />, { devices: [conveyorState()] });
    await screen.findByRole('img');
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(screen.getByText(/마지막으로 받은 값/)).toBeInTheDocument();
    expect(within(screen.getByLabelText('조작')).getByRole('button', { name: '정지' })).toBeDisabled();
    expect(screen.getAllByText('연결 끊김').length).toBeGreaterThan(0);
  });
});

describe('CompressorPage', () => {
  it('압력·온도 그래프, 설정, 점검 이력 자리가 있다', async () => {
    renderWithStore(<CompressorPage />, { me: ADMIN, devices: [compressorState()] });
    const status = screen.getByRole('region', { name: '현재 상태' });
    expect(within(status).getByText('28.7 MPa')).toBeInTheDocument();
    expect(within(status).getByText('42.3 °C')).toBeInTheDocument();

    await screen.findByRole('img');
    expect(vi.mocked(api.getHistory).mock.calls[0]![0]).toMatchObject({ deviceId: 'compressor-1', metric: 'pressure' });
    expect(screen.getByRole('button', { name: '압력' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '온도' })).toBeInTheDocument();
    expect(screen.getByLabelText('압력 상한')).toBeInTheDocument();
    expect(screen.getByLabelText('점검 이력')).toHaveTextContent('서버가 값을 제공해야');
  });

  it('온도로 바꾸면 온도 이력을 요청한다', async () => {
    renderWithStore(<CompressorPage />, { devices: [compressorState()] });
    await screen.findByRole('img');
    await userEvent.click(screen.getByRole('button', { name: '온도' }));
    await vi.waitFor(() => expect(vi.mocked(api.getHistory).mock.calls.at(-1)![0]).toMatchObject({ metric: 'temperature' }));
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
    await screen.findByLabelText('오류 로그 (최근 7일)');
  });
});
