import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api';
import { commandResultReceived } from '../../store';
import { ADMIN, VIEWER, conveyorState, renderWithStore, robotState, tankState } from '../../test/utils';
import { AckAlarmButton } from './AckAlarmButton';
import { CommandResultToast } from './CommandResultToast';
import { DeviceControls } from './DeviceControls';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  sendCommand: vi.fn(),
  getCommand: vi.fn(),
}));

let nextId = 0;
beforeEach(() => {
  nextId = 0;
  vi.mocked(api.sendCommand).mockReset();
  vi.mocked(api.sendCommand).mockImplementation(async () => ({
    idempotencyKey: 'k',
    accepted: { commandId: `cmd-${++nextId}`, status: 'accepted' as const },
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

const buttonNames = () => screen.queryAllByRole('button').map((b) => b.textContent);
const finish = (store: ReturnType<typeof renderWithStore>['store'], commandId: string, status: 'completed' | 'rejected' | 'failed' = 'completed', reason: string | null = null) =>
  act(() => {
    store.dispatch(commandResultReceived({ commandId, status, reason }));
  });

describe('DeviceControls: 표시', () => {
  it('보낼 수 있는 권한이 하나도 없으면 아무것도 그리지 않는다 (열람자)', () => {
    const { container } = renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, {
      me: VIEWER,
      devices: [robotState()],
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('홈의 로봇은 시작·일시정지·재개·정지만 보이고 위험 조작은 없다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { devices: [robotState()] });
    expect(buttonNames()).toEqual(['시작', '일시정지', '재개', '정지']);
    for (const b of screen.getAllByRole('button')) expect(b).toBeEnabled();
  });

  it('컨베이어·압축기도 같은 컴포넌트로 같은 조작을 쓴다', () => {
    renderWithStore(<DeviceControls deviceId="conveyor-z" context="home" />, { devices: [conveyorState()] });
    expect(buttonNames()).toEqual(['시작', '일시정지', '재개', '정지']);
  });

  it('탱크에는 조작이 없다', () => {
    const { container } = renderWithStore(<DeviceControls deviceId="tank-a1" context="home" />, { devices: [tankState()], me: ADMIN });
    expect(container).toBeEmptyDOMElement();
  });

  it('기기 페이지에는 위험 조작이 더해지고, 권한이 없는 것은 비활성화하고 이유를 보여 준다 (작업자)', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="page" />, { devices: [robotState()] });
    expect(screen.getByRole('button', { name: '수동 모드로 전환' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '섹터 지정 집기' })).toBeDisabled();
    expect(screen.getAllByText('권한이 없습니다').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: '정지' })).toBeEnabled();
  });

  it('"비상정지"처럼 보이는 버튼은 없다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="page" />, { devices: [robotState()], me: ADMIN });
    expect(screen.queryByText(/비상/)).not.toBeInTheDocument();
  });

  it('연결이 끊기면 모두 비활성화하고 이유를 보여 준다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { devices: [robotState()], connection: 'offline' });
    expect(screen.getByRole('note')).toHaveTextContent('연결 끊김');
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });

  it('연결 중에도 조작할 수 없다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { devices: [robotState()], connection: 'connecting' });
    expect(screen.getByRole('note')).toHaveTextContent('연결하는 중');
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });

  it('기기가 offline이면 비활성화하고 이유를 보여 준다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { devices: [robotState({ status: 'offline' })] });
    expect(screen.getByRole('note')).toHaveTextContent('기기와 연결되어 있지 않습니다');
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });

  it('기기 상태를 아직 받지 못했으면 조작할 수 없다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="home" />);
    expect(screen.getByRole('note')).toHaveTextContent('불러오는 중');
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled();
  });
});

describe('DeviceControls: 낮은 위험 조작 보내기', () => {
  it('누르면 명령을 보내고, 처리 중에는 비활성화되어 중복으로 보내지 않는다', async () => {
    const { store } = renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { devices: [robotState()] });

    await userEvent.click(screen.getByRole('button', { name: '일시정지' }));
    expect(api.sendCommand).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.sendCommand).mock.calls[0]![0]).toBe('robot-1');
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'pause' });

    const busy = await screen.findByRole('button', { name: '일시정지 처리 중' });
    expect(busy).toBeDisabled();
    await userEvent.click(busy);
    expect(api.sendCommand).toHaveBeenCalledTimes(1);

    finish(store, 'cmd-1');
    expect(await screen.findByRole('button', { name: '일시정지' })).toBeEnabled();
  });

  it('다른 조작은 처리 중인 조작과 상관없이 누를 수 있다', async () => {
    const { store } = renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { devices: [robotState()] });
    await userEvent.click(screen.getByRole('button', { name: '일시정지' }));
    await screen.findByRole('button', { name: '일시정지 처리 중' });
    expect(screen.getByRole('button', { name: '정지' })).toBeEnabled();
    finish(store, 'cmd-1');
  });
});

describe('DeviceControls: 위험 조작은 확인 단계를 거친다', () => {
  it('모드 전환: 확인하기 전에는 보내지 않고, 취소하면 보내지 않는다', async () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="page" />, { devices: [robotState()], me: ADMIN });

    await userEvent.click(screen.getByRole('button', { name: '수동 모드로 전환' }));
    const dialog = screen.getByRole('dialog', { name: '모드 전환' });
    expect(within(dialog).getByText(/자동 → 수동/)).toBeInTheDocument();
    expect(api.sendCommand).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus();

    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it('모드 전환: 확인하면 confirm: true로 보낸다', async () => {
    const { store } = renderWithStore(<DeviceControls deviceId="robot-1" context="page" />, { devices: [robotState()], me: ADMIN });
    await userEvent.click(screen.getByRole('button', { name: '수동 모드로 전환' }));
    await userEvent.click(screen.getByRole('button', { name: '실행' }));

    expect(api.sendCommand).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'set_mode', mode: 'manual', confirm: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await screen.findByRole('button', { name: '수동 모드로 전환 처리 중' });
    finish(store, 'cmd-1');
  });

  it('수동 모드이면 "자동 모드로 전환"이 보이고 자동으로 보낸다', async () => {
    const { store } = renderWithStore(<DeviceControls deviceId="robot-1" context="page" />, {
      devices: [robotState({ mode: 'manual' })],
      me: ADMIN,
    });
    await userEvent.click(screen.getByRole('button', { name: '자동 모드로 전환' }));
    await userEvent.click(screen.getByRole('button', { name: '실행' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'set_mode', mode: 'auto', confirm: true });
    await screen.findByRole('button', { name: '자동 모드로 전환 처리 중' });
    finish(store, 'cmd-1');
  });

  it('섹터 지정 집기는 자동 모드에서는 비활성화되고 이유를 보여 준다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="page" />, { devices: [robotState()], me: ADMIN });
    expect(screen.getByRole('button', { name: '섹터 지정 집기' })).toBeDisabled();
    expect(screen.getByText('수동 모드에서만 사용할 수 있습니다')).toBeInTheDocument();
  });

  it('수동 모드에서 탱크를 골라 확인하면 그 탱크로 confirm: true를 보낸다', async () => {
    const { store } = renderWithStore(<DeviceControls deviceId="robot-1" context="page" />, {
      devices: [robotState({ mode: 'manual' })],
      me: ADMIN,
    });
    await userEvent.selectOptions(screen.getByLabelText('집을 섹터'), 'tank-b1');
    await userEvent.click(screen.getByRole('button', { name: '섹터 지정 집기' }));
    const dialog = screen.getByRole('dialog', { name: '섹터 지정 집기' });
    expect(within(dialog).getByText(/섹터 B1/)).toBeInTheDocument();
    expect(api.sendCommand).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: '실행' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'pick_from', tankId: 'tank-b1', confirm: true });
    await screen.findByRole('button', { name: '섹터 지정 집기 처리 중' });
    finish(store, 'cmd-1');
  });

  it('홈에는 위험 조작 버튼 자체가 없다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { devices: [robotState()], me: ADMIN });
    expect(screen.queryByText(/모드로 전환/)).not.toBeInTheDocument();
    expect(screen.queryByText('섹터 지정 집기')).not.toBeInTheDocument();
  });
});

describe('AckAlarmButton', () => {
  it('권한이 있으면 그 기기의 경로로 알람 확인을 보낸다', async () => {
    const { store } = renderWithStore(<AckAlarmButton deviceId="tank-a1" alarmId="al-3301" />);
    await userEvent.click(screen.getByRole('button', { name: '알람 확인' }));
    expect(api.sendCommand).toHaveBeenCalledWith('tank-a1', { type: 'ack_alarm', alarmId: 'al-3301' }, expect.anything());
    await screen.findByRole('button', { name: '알람 확인 처리 중' });
    finish(store, 'cmd-1');
  });

  it('권한이 없으면 아무것도 그리지 않는다', () => {
    const { container } = renderWithStore(<AckAlarmButton deviceId="tank-a1" alarmId="al-1" />, { me: VIEWER });
    expect(container).toBeEmptyDOMElement();
  });

  it('연결이 끊기면 비활성화한다', () => {
    renderWithStore(<AckAlarmButton deviceId="tank-a1" alarmId="al-1" />, { connection: 'offline' });
    expect(screen.getByRole('button', { name: '알람 확인' })).toBeDisabled();
  });
});

describe('CommandResultToast', () => {
  it('보낸 명령이 없으면 아무것도 그리지 않는다', () => {
    const { container } = renderWithStore(<CommandResultToast />);
    expect(container).toBeEmptyDOMElement();
  });

  it('접수 → 완료 과정을 홈에서도 보여 준다', async () => {
    const { store } = renderWithStore(
      <>
        <DeviceControls deviceId="robot-1" context="home" />
        <CommandResultToast />
      </>,
      { devices: [robotState()] },
    );
    await userEvent.click(screen.getByRole('button', { name: '정지' }));
    const toast = await screen.findByText('로봇팔 · 정지');
    expect(toast.closest('[role="status"]')).toHaveTextContent('접수됨 · 처리 중');

    finish(store, 'cmd-1');
    expect(await screen.findByText('완료')).toBeInTheDocument();
  });

  it('거부와 실패는 이유와 함께 보여 준다', async () => {
    const { store } = renderWithStore(
      <>
        <DeviceControls deviceId="conveyor-z" context="home" />
        <CommandResultToast />
      </>,
      { devices: [conveyorState()] },
    );
    await userEvent.click(screen.getByRole('button', { name: '정지' }));
    await screen.findByText('접수됨 · 처리 중');
    finish(store, 'cmd-1', 'rejected', '작업 중이라 거부했습니다.');
    expect(await screen.findByText('거부됨')).toBeInTheDocument();
    expect(screen.getByText('작업 중이라 거부했습니다.')).toBeInTheDocument();
  });

  it('서버가 HTTP로 거부하면(409 등) 이유를 보여 준다', async () => {
    vi.mocked(api.sendCommand).mockRejectedValue(new api.ApiError(409, 'CONFLICT', '이미 작동 중입니다.'));
    renderWithStore(
      <>
        <DeviceControls deviceId="robot-1" context="home" />
        <CommandResultToast />
      </>,
      { devices: [robotState()] },
    );
    await userEvent.click(screen.getByRole('button', { name: '시작' }));
    expect(await screen.findByText('이미 작동 중입니다.')).toBeInTheDocument();
    expect(screen.getByText('거부됨')).toBeInTheDocument();
  });

  it('끝난 결과는 잠시 뒤 사라지고 직접 닫을 수도 있다', async () => {
    const { store } = renderWithStore(
      <>
        <DeviceControls deviceId="robot-1" context="home" />
        <CommandResultToast />
      </>,
      { devices: [robotState()] },
    );
    await userEvent.click(screen.getByRole('button', { name: '정지' }));
    await screen.findByText('접수됨 · 처리 중');

    vi.useFakeTimers();
    finish(store, 'cmd-1');
    expect(screen.getByText('완료')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5_900);
    });
    expect(screen.getByText('완료')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText('완료')).not.toBeInTheDocument();
  });

  it('닫기 버튼으로 끝난 결과를 치울 수 있고, 처리 중인 것에는 닫기가 없다', async () => {
    const { store } = renderWithStore(
      <>
        <DeviceControls deviceId="robot-1" context="home" />
        <CommandResultToast />
      </>,
      { devices: [robotState()] },
    );
    await userEvent.click(screen.getByRole('button', { name: '정지' }));
    await screen.findByText('접수됨 · 처리 중');
    expect(screen.queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();

    finish(store, 'cmd-1');
    await userEvent.click(await screen.findByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByText('완료')).not.toBeInTheDocument();
  });
});
