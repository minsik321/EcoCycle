import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api';
import { commandResultReceived, devicesReceived } from '../../store';
import { ADMIN, OPERATOR, VIEWER, conveyorState, renderWithStore, robotState, tankState } from '../../test/utils';
import { AckAlarmButton } from './AckAlarmButton';
import { CommandResultToast } from './CommandResultToast';
import { DeviceControls } from './DeviceControls';
import { RobotModeControl } from './RobotModeControl';

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

  it('기기 페이지의 버튼 묶음도 버튼 하나로 보내는 조작만 둔다 (모드 전환·수동 집기는 운전 모드, 설정은 설정 폼)', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="page" />, { devices: [robotState()], me: ADMIN });
    expect(buttonNames()).toEqual(['시작', '일시정지', '재개', '정지']);
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

describe('RobotModeControl: 세 칸 하나와 확인 단계', () => {
  const card = () => screen.getByRole('region', { name: '운전 모드' });
  const radio = (name: string) => within(card()).getAllByRole('radio').find((r) => r.firstChild?.textContent === name)!;

  it('세 칸(자동 | 자동 · 섹터 지정 | 수동)이 한 줄이고 서버 모드에 "지금"이 붙는다', () => {
    renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN });
    const radios = within(card()).getAllByRole('radio');
    expect(radios.map((r) => r.firstChild?.textContent)).toEqual(['자동', '자동 · 섹터 지정', '수동']);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[0]).toHaveTextContent('지금');
    // 지금 모드는 적용할 것이 없다
    expect(within(card()).getByRole('button', { name: '적용' })).toBeDisabled();
    expect(within(card()).getByText(/적용: 바꾼 것이 없습니다/)).toBeInTheDocument();
  });

  it('"적용"은 줄 하나를 차지하지 않는다: 폰은 섹터 칩 줄의 마지막 칩, 자동·수동은 안내 글 오른쪽', async () => {
    renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN });
    const apply = () => within(card()).getByRole('button', { name: '적용' });
    // 안내 글과 같은 줄
    expect(apply().parentElement).toContainElement(within(card()).getByText(/배합 중인 배치의 배합비/));
    await userEvent.click(radio('자동 · 섹터 지정'));
    // 섹터 칩 넷 + 적용 = 다섯 칸 한 줄
    const chips = within(card()).getByRole('button', { name: '섹터 A1' }).parentElement!;
    expect(chips).toContainElement(apply());
    expect(within(chips).getAllByRole('button')).toHaveLength(5);
  });

  it('태블릿·데스크톱은 "적용"이 세 칸 오른쪽에 붙는다', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN });
      const row = within(card()).getByRole('radiogroup').parentElement!;
      expect(row).toContainElement(within(card()).getByRole('button', { name: '적용' }));
    } finally {
      window.matchMedia = original;
    }
  });

  it('칸을 고르는 것은 초안이라 명령을 보내지 않는다. 좌우 화살표로도 옮긴다', async () => {
    renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN });
    await userEvent.click(radio('수동'));
    expect(radio('수동')).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(radio('자동 · 섹터 지정')).toHaveAttribute('aria-checked', 'true');
    expect(radio('자동 · 섹터 지정')).toHaveFocus();
    expect(api.sendCommand).not.toHaveBeenCalled();
  });

  it('작업자(위험 조작 권한 없음)에게는 보이지만 비활성이고 이유를 보여 준다', async () => {
    renderWithStore(<RobotModeControl />, { devices: [robotState({ mode: 'manual' })] });
    expect(within(card()).getByRole('button', { name: '집기' })).toBeDisabled();
    expect(within(card()).getByText(/집기·놓기: 권한이 없습니다/)).toBeInTheDocument();
    await userEvent.click(radio('자동'));
    expect(within(card()).getByRole('button', { name: '적용' })).toBeDisabled();
  });

  it('열람자에게는 그리지 않는다', () => {
    const { container } = renderWithStore(<RobotModeControl />, { devices: [robotState()], me: VIEWER });
    expect(container).toBeEmptyDOMElement();
  });

  it('연결이 끊기면 명령 버튼을 모두 막고 이유를 보여 준다', async () => {
    renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN, connection: 'offline' });
    expect(within(card()).getByRole('note')).toHaveTextContent('연결 끊김');
    await userEvent.click(radio('수동'));
    for (const b of within(card()).getAllByRole('button')) expect(b).toBeDisabled();
  });

  it('자동 · 섹터 지정: 섹터 칩(여러 개)과 적용 하나. 빈 선택은 막고, 확인 후에만 서버 순서로 보낸다', async () => {
    const { store } = renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN });
    await userEvent.click(radio('자동 · 섹터 지정'));
    expect(within(card()).getByRole('button', { name: '적용' })).toBeDisabled();
    expect(within(card()).getByText(/섹터를 1개 이상 고르세요/)).toBeInTheDocument();
    await userEvent.click(within(card()).getByRole('button', { name: '섹터 B1' }));
    await userEvent.click(within(card()).getByRole('button', { name: '섹터 A1' }));
    expect(within(card()).getByRole('button', { name: '섹터 A1' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(card()).getByRole('button', { name: '적용' }));
    const dialog = screen.getByRole('dialog', { name: '모드 전환' });
    expect(within(dialog).getByText(/자동 → 자동 · 섹터 지정 \(섹터 A1, 섹터 B1\)/)).toBeInTheDocument();
    expect(api.sendCommand).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(api.sendCommand).not.toHaveBeenCalled();
    await userEvent.click(within(card()).getByRole('button', { name: '적용' }));
    await userEvent.click(screen.getByRole('button', { name: '실행' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'set_mode', mode: 'auto_pinned', pinnedSectors: ['tank-a1', 'tank-b1'], confirm: true });
    await within(card()).findByRole('button', { name: '적용 중' });
    finish(store, 'cmd-1');
  });

  it('지정 모드에서는 적용된 섹터를 칩에 표시하고, 같은 섹터면 적용할 것이 없다', async () => {
    renderWithStore(<RobotModeControl />, { devices: [robotState({ mode: 'auto_pinned', pinnedSectors: ['tank-b2'] })], me: ADMIN });
    expect(radio('자동 · 섹터 지정')).toHaveAttribute('aria-checked', 'true');
    expect(within(card()).getByRole('button', { name: '섹터 B2 (적용됨)' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card()).getByRole('button', { name: '적용' })).toBeDisabled();
    await userEvent.click(within(card()).getByRole('button', { name: '섹터 A2' }));
    expect(within(card()).getByRole('button', { name: '적용' })).toBeEnabled();
  });

  it('지정 모드에서 자동으로 돌아가는 것은 지정 없는 명령이다', async () => {
    const { store } = renderWithStore(<RobotModeControl />, { devices: [robotState({ mode: 'auto_pinned', pinnedSectors: ['tank-b2'] })], me: ADMIN });
    await userEvent.click(radio('자동'));
    await userEvent.click(within(card()).getByRole('button', { name: '적용' }));
    expect(within(screen.getByRole('dialog')).getByText(/자동 · 섹터 지정 → 자동/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '실행' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'set_mode', mode: 'auto', confirm: true });
    finish(store, 'cmd-1');
  });

  it('수동: 지금 수동이 아니면 적용으로 바꾸고, 집기는 수동이 적용된 뒤에만 누를 수 있다', async () => {
    const { store } = renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN });
    await userEvent.click(radio('수동'));
    expect(within(card()).getByRole('button', { name: '집기' })).toBeDisabled();
    expect(within(card()).getByText(/수동 모드가 적용된 뒤 집을 수 있습니다/)).toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: '컨베이어에 놓기' })).toBeDisabled();
    await userEvent.click(within(card()).getByRole('button', { name: '적용' }));
    await userEvent.click(screen.getByRole('button', { name: '실행' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'set_mode', mode: 'manual', confirm: true });
    finish(store, 'cmd-1');
  });

  it('수동 모드에서는 "집을 섹터"와 "집기"가 한 줄이고, 확인하면 그 섹터로 confirm: true를 보낸다', async () => {
    const { store } = renderWithStore(<RobotModeControl />, { devices: [robotState({ mode: 'manual' })], me: ADMIN });
    // 지금 모드가 수동이면 바꾼 것이 없어 적용은 비활성
    expect(within(card()).getByRole('button', { name: '적용' })).toBeDisabled();
    expect(within(card()).getByRole('status', { name: '수동 집기 상태' })).toHaveTextContent('빈 손');
    // 들고 있지 않으면 놓기는 비활성
    expect(within(card()).getByRole('button', { name: '컨베이어에 놓기' })).toBeDisabled();
    expect(within(card()).getByText(/놓기: 먼저 집기를 하세요/)).toBeInTheDocument();
    const select = within(card()).getByLabelText('집을 섹터');
    expect(select.parentElement).toContainElement(within(card()).getByRole('button', { name: '집기' }));
    await userEvent.selectOptions(select, 'tank-b1');
    await userEvent.click(within(card()).getByRole('button', { name: '집기' }));
    const dialog = screen.getByRole('dialog', { name: '집기' });
    expect(within(dialog).getByText(/섹터 B1/)).toBeInTheDocument();
    expect(api.sendCommand).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '실행' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'pick_from', tankId: 'tank-b1', confirm: true });
    await within(card()).findByRole('button', { name: '집기 처리 중' });
    finish(store, 'cmd-1');
  });

  it('집어 든 동안: "A1에서 집음 · 놓기 대기", 집기는 막히고 놓기만 된다. 모드 전환도 놓은 뒤에', async () => {
    const { store } = renderWithStore(<RobotModeControl />, {
      devices: [robotState({ mode: 'manual', heldSectorId: 'tank-a1', gripper: { closed: true, holding: true } })],
      me: ADMIN,
    });
    expect(within(card()).getByRole('status', { name: '수동 집기 상태' })).toHaveTextContent('A1에서 집음 · 놓기 대기');
    expect(within(card()).getByRole('button', { name: '집기' })).toBeDisabled();
    expect(within(card()).getByText(/집기: 먼저 컨베이어에 놓으세요/)).toBeInTheDocument();
    // 모드를 바꿀 수 없다(들고 있는 것이 어디로 갈지 모른다)
    await userEvent.click(radio('자동'));
    expect(within(card()).getByRole('button', { name: '적용' })).toBeDisabled();
    expect(within(card()).getByText(/집어 든 파지를 먼저 컨베이어에 놓으세요/)).toBeInTheDocument();
    await userEvent.click(radio('수동'));
    const place = within(card()).getByRole('button', { name: '컨베이어에 놓기' });
    expect(place).toBeEnabled();
    await userEvent.click(place);
    const dialog = screen.getByRole('dialog', { name: '컨베이어에 놓기' });
    expect(within(dialog).getByText(/섹터 A1에서 집은 파지/)).toBeInTheDocument();
    expect(api.sendCommand).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: '실행' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'place_on_conveyor', confirm: true });
    await within(card()).findByRole('button', { name: '컨베이어에 놓기 처리 중' });
    finish(store, 'cmd-1');
  });

  it('작업 중(집는 중)에는 집기·놓기 둘 다 기다린다', () => {
    renderWithStore(<RobotModeControl />, { devices: [robotState({ mode: 'manual', phase: 'pick', targetTankId: 'tank-b2' })], me: ADMIN });
    expect(within(card()).getByRole('status', { name: '수동 집기 상태' })).toHaveTextContent('B2에서 집는 중');
    expect(within(card()).getByRole('button', { name: '집기' })).toBeDisabled();
    expect(within(card()).getByRole('button', { name: '컨베이어에 놓기' })).toBeDisabled();
  });

  it('로봇 명령 결과를 보여 준다: 적용 대기 → 적용됨, 거부되면 거부됨', async () => {
    const { store } = renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN });
    expect(within(card()).queryByRole('status', { name: '로봇 명령 결과' })).not.toBeInTheDocument();
    await userEvent.click(radio('수동'));
    await userEvent.click(within(card()).getByRole('button', { name: '적용' }));
    await userEvent.click(screen.getByRole('button', { name: '실행' }));
    expect(await within(card()).findByRole('status', { name: '로봇 명령 결과' })).toHaveTextContent('적용 대기');
    finish(store, 'cmd-1');
    expect(within(card()).getByRole('status', { name: '로봇 명령 결과' })).toHaveTextContent('모드 전환');
    expect(within(card()).getByRole('status', { name: '로봇 명령 결과' })).toHaveTextContent('적용됨');

    await userEvent.click(within(card()).getByRole('button', { name: '적용' }));
    await userEvent.click(screen.getByRole('button', { name: '실행' }));
    await within(card()).findByText('적용 대기');
    finish(store, 'cmd-2', 'rejected', '진행 중인 사이클이 있습니다');
    expect(within(card()).getByRole('status', { name: '로봇 명령 결과' })).toHaveTextContent('거부됨');
  });

  it('3D 홈 패널(variant="panel")도 같은 조작을 카드 틀 없이 그린다', () => {
    renderWithStore(<RobotModeControl variant="panel" />, { devices: [robotState()], me: ADMIN });
    expect(within(card()).getAllByRole('radio')).toHaveLength(3);
    expect(within(card()).getByRole('heading', { name: '운전 모드' })).toBeInTheDocument();
  });

  it('3D 홈 패널은 이 조작의 권한이 없으면(작업자·열람자) 그리지 않는다', () => {
    for (const me of [OPERATOR, VIEWER]) {
      const { container, unmount } = renderWithStore(<RobotModeControl variant="panel" />, { devices: [robotState()], me });
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('서버 모드가 바뀌면 초안을 서버 값으로 되돌린다', async () => {
    const { store } = renderWithStore(<RobotModeControl />, { devices: [robotState()], me: ADMIN });
    await userEvent.click(radio('자동 · 섹터 지정'));
    await userEvent.click(within(card()).getByRole('button', { name: '섹터 A2' }));
    act(() => {
      store.dispatch(devicesReceived([robotState({ mode: 'manual', updatedAt: '2026-10-13T05:00:05.000Z' })]));
    });
    expect(radio('수동')).toHaveAttribute('aria-checked', 'true');
    expect(radio('수동')).toHaveTextContent('지금');
  });
});

describe('DeviceControls: 홈', () => {
  it('홈에는 위험 조작 버튼 자체가 없다', () => {
    renderWithStore(<DeviceControls deviceId="robot-1" context="home" />, { devices: [robotState()], me: ADMIN });
    expect(screen.queryByText(/적용|집기|모드/)).not.toBeInTheDocument();
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
