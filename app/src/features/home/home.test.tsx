import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceState, PlantSummary } from '@ecocycle/shared';
import * as api from '../../api';
import { alarmReceived, connectionChanged, deviceSelected, plantReceived } from '../../store';
import { ADMIN, NOW, VIEWER, conveyorState, renderWithStore, robotState } from '../../test/utils';
import { HomePage } from './HomePage';
import { PhaseBar } from './PhaseBar';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  sendCommand: vi.fn(),
  getCommand: vi.fn(),
}));

const tank = (id: 'tank-a1' | 'tank-a2' | 'tank-b1' | 'tank-b2', fill: number, status: 'normal' | 'caution' | 'alarm' = 'normal'): DeviceState => ({
  id,
  type: 'tank',
  section: id.slice(-2).toUpperCase() as 'A1',
  grade: 'A',
  status,
  fillPercent: fill,
  volumeM3: Math.round(fill) / 10,
  capacityM3: 8,
  moisturePercent: 11.8,
  updatedAt: NOW,
});

const compressorState = (running = true): DeviceState => ({
  id: 'compressor-1',
  type: 'compressor',
  status: 'normal',
  running,
  pressureMpa: 28.7,
  temperatureC: 42.3,
  updatedAt: NOW,
});

const summary: PlantSummary = { averageMoisturePercent: 11.1, totalFillPercent: 51.6, balesToday: 412, compressorUptimePercent: 92, status: 'normal', updatedAt: NOW };

const all = (): DeviceState[] => [
  tank('tank-a1', 72.4),
  tank('tank-a2', 45),
  tank('tank-b1', 30.5),
  tank('tank-b2', 82, 'caution'),
  robotState({ phase: 'move', targetTankId: 'tank-a1' }),
  conveyorState(),
  compressorState(),
];

function page(options: Parameters<typeof renderWithStore>[1] = {}) {
  const utils = renderWithStore(
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/tanks/:id" element={<div>탱크 페이지</div>} />
      <Route path="/robot" element={<div>로봇 페이지</div>} />
    </Routes>,
    { devices: all(), ...options },
  );
  act(() => {
    utils.store.dispatch(plantReceived(summary));
  });
  return utils;
}

beforeEach(() => {
  vi.mocked(api.sendCommand).mockReset();
});

describe('홈: 요약 카드', () => {
  it('함수율, 전체 적재율, 시스템 상태를 보여 준다', () => {
    page();
    expect(within(screen.getByLabelText('함수율')).getByText('11.1%')).toBeInTheDocument();
    expect(within(screen.getByLabelText('전체 적재율')).getByText('51.6%')).toBeInTheDocument();
    expect(within(screen.getByLabelText('시스템 상태')).getByText('정상')).toBeInTheDocument();
  });

  it('요약을 아직 못 받았으면 값 대신 자리 표시를 한다', () => {
    renderWithStore(<HomePage />);
    expect(within(screen.getByLabelText('시스템 상태')).getByText('불러오는 중…')).toBeInTheDocument();
    expect(within(screen.getByLabelText('함수율')).getByText('–')).toBeInTheDocument();
  });

  it('서버가 판정한 시스템 상태를 그대로 보여 준다', () => {
    const { store } = page();
    act(() => {
      store.dispatch(plantReceived({ ...summary, status: 'alarm', updatedAt: '2026-10-13T05:00:05.000Z' }));
    });
    expect(within(screen.getByLabelText('시스템 상태')).getByText('알람')).toBeInTheDocument();
  });
});

describe('홈: 기기 카드', () => {
  it('탱크 4개는 수위와 수분 두 숫자와 상태를 보여 준다', () => {
    page();
    const grid = screen.getByLabelText('기기 상태');
    expect(within(grid).getByText('72.4%')).toBeInTheDocument();
    expect(within(grid).getAllByText('수분 11.8%')).toHaveLength(4);
    const meter = within(grid).getByRole('meter', { name: '탱크 B2 수위' });
    expect(meter).toHaveAttribute('aria-valuenow', '82');
    expect(within(within(grid).getByRole('button', { name: /^탱크 B2/ })).getByText('주의')).toBeInTheDocument();
  });

  it('로봇은 동작 단계, 작업 중 탱크, 상태를 보여 준다', () => {
    page();
    const card = screen.getByRole('button', { name: /^로봇팔/ });
    expect(card).toHaveTextContent('이동');
    expect(card).toHaveTextContent('탱크 A1');
    expect(card).toHaveTextContent('작동 중');
  });

  it('컨베이어와 압축기는 가동 상태와 핵심 값을 보여 준다', () => {
    page();
    expect(screen.getByRole('button', { name: /^컨베이어/ })).toHaveTextContent('가동');
    expect(screen.getByRole('button', { name: /^컨베이어/ })).toHaveTextContent('적재 40%');
    expect(screen.getByRole('button', { name: /^압축기/ })).toHaveTextContent('28.7 MPa · 42.3 °C');
  });

  it('상태를 아직 받지 못한 기기는 자리만 보여 준다', () => {
    renderWithStore(<HomePage />, { devices: [tank('tank-a1', 50)] });
    expect(screen.getAllByText('불러오는 중…').length).toBeGreaterThanOrEqual(6);
  });
});

describe('홈: 확대 화면(상세 카드)', () => {
  it('카드를 누르면 오른쪽에 확대 화면이 열리고 다시 누르면 닫힌다', async () => {
    page();
    expect(screen.queryByLabelText('탱크 A1 확대 화면')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^탱크 A1/ }));
    const panel = screen.getByLabelText('탱크 A1 확대 화면');
    expect(within(panel).getByText('72.4%')).toBeInTheDocument();
    expect(within(panel).getByText('7.2 m³ / 8.0 m³')).toBeInTheDocument(); // 무게가 아니라 부피(용량)
    expect(within(panel).getByText('A1 구역')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^탱크 A1/ })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: '확대 화면 닫기' }));
    expect(screen.queryByLabelText('탱크 A1 확대 화면')).not.toBeInTheDocument();
  });

  it('"상세 보기"는 그 기기의 페이지로 이동한다', async () => {
    page();
    await userEvent.click(screen.getByRole('button', { name: /^탱크 A2/ }));
    await userEvent.click(screen.getByRole('link', { name: '상세 보기' }));
    expect(screen.getByText('탱크 페이지')).toBeInTheDocument();
  });

  it('로봇 확대 화면에는 위험도 낮은 조작만 있다 (위험 조작은 기기 페이지에서만)', async () => {
    page({ me: ADMIN });
    await userEvent.click(screen.getByRole('button', { name: /^로봇팔/ }));
    const panel = screen.getByLabelText('로봇팔 확대 화면');
    expect(within(panel).getByRole('button', { name: '일시정지' })).toBeEnabled();
    expect(within(panel).queryByText(/모드로 전환/)).not.toBeInTheDocument();
    expect(within(panel).queryByText('탱크 지정 집기')).not.toBeInTheDocument();
    expect(within(panel).getByText('자동')).toBeInTheDocument();
  });

  it('열람자에게는 조작 버튼이 없다', async () => {
    page({ me: VIEWER });
    await userEvent.click(screen.getByRole('button', { name: /^로봇팔/ }));
    const panel = screen.getByLabelText('로봇팔 확대 화면');
    expect(within(panel).queryByRole('button', { name: '일시정지' })).not.toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: '상세 보기' })).toBeInTheDocument();
  });

  it('확대 화면에서 조작하면 명령을 보낸다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue({ idempotencyKey: 'k', accepted: { commandId: 'cmd-1', status: 'accepted' } });
    page();
    await userEvent.click(screen.getByRole('button', { name: /^컨베이어/ }));
    await userEvent.click(within(screen.getByLabelText('컨베이어 Section Z 확대 화면')).getByRole('button', { name: '정지' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![0]).toBe('conveyor-z');
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'stop' });
  });
});

describe('홈: 알람', () => {
  const alarm = (id: string, state: 'active' | 'acknowledged', level: 'caution' | 'alarm' = 'caution') => ({
    id,
    level,
    deviceId: 'tank-b2' as const,
    message: '적재율 80% 초과',
    state,
    ts: NOW,
  });

  it('알람이 없으면 알람 영역을 그리지 않는다', () => {
    page();
    expect(screen.queryByLabelText('알람')).not.toBeInTheDocument();
  });

  it('열린 알람을 단계 색·기호와 함께 보여 주고 누르면 기기 페이지로 간다', async () => {
    const { store } = page();
    act(() => {
      store.dispatch(alarmReceived(alarm('al-1', 'active', 'alarm')));
    });
    const region = screen.getByLabelText('알람');
    expect(within(region).getByText('알람')).toBeInTheDocument();
    expect(within(region).getByText(/탱크 B2 · 적재율 80% 초과/)).toBeInTheDocument();
    await userEvent.click(within(region).getByRole('link', { name: /^탱크 B2/ }));
    expect(screen.getByText('탱크 페이지')).toBeInTheDocument();
  });

  it('활성 알람은 확인 버튼이 있고, 확인한 알람은 "확인함"으로 표시되며 버튼이 없다', () => {
    const { store } = page();
    act(() => {
      store.dispatch(alarmReceived(alarm('al-1', 'active')));
      store.dispatch(alarmReceived({ ...alarm('al-2', 'acknowledged'), ts: '2026-10-13T04:00:00.000Z' }));
    });
    expect(screen.getAllByRole('button', { name: '알람 확인' })).toHaveLength(1);
    expect(screen.getByText(/확인함/)).toBeInTheDocument();
  });

  it('3건까지 보여 주고 나머지는 알람 화면으로 안내한다', () => {
    const { store } = page();
    act(() => {
      for (let i = 1; i <= 5; i += 1) {
        store.dispatch(alarmReceived({ ...alarm(`al-${i}`, 'active'), ts: `2026-10-13T05:0${i}:00.000Z` }));
      }
    });
    expect(within(screen.getByLabelText('알람')).getAllByRole('link', { name: /^탱크 B2/ })).toHaveLength(3);
    expect(screen.getByRole('link', { name: '알람 2건 더 보기' })).toHaveAttribute('href', '/alarms');
  });
});

describe('홈: 연결 끊김 (마지막 값을 정상처럼 보여 주지 않는다)', () => {
  const disconnect = (store: ReturnType<typeof page>['store']) =>
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });

  it('모든 기기의 상태 표시가 "연결 끊김"으로 바뀌고 정상·주의 표시가 남지 않는다', () => {
    const { store } = page();
    expect(screen.getAllByText('정상').length).toBeGreaterThan(0);
    disconnect(store);

    const grid = screen.getByLabelText('기기 상태');
    expect(within(grid).queryByText('정상')).not.toBeInTheDocument();
    expect(within(grid).queryByText('주의')).not.toBeInTheDocument();
    expect(within(grid).queryByText('작동 중')).not.toBeInTheDocument();
    expect(within(grid).getAllByText('연결 끊김').length).toBe(7);
    expect(within(screen.getByLabelText('시스템 상태')).getByText('연결 끊김')).toBeInTheDocument();
    expect(within(screen.getByLabelText('시스템 상태')).queryByText('정상')).not.toBeInTheDocument();
  });

  it('요약 숫자는 마지막으로 받은 값이라고 표시한다', () => {
    const { store } = page();
    disconnect(store);
    expect(within(screen.getByLabelText('함수율')).getByText('마지막 값')).toBeInTheDocument();
  });

  it('끊기면 조작할 수 없다', async () => {
    const { store } = page();
    await userEvent.click(screen.getByRole('button', { name: /^로봇팔/ }));
    disconnect(store);
    const panel = screen.getByLabelText('로봇팔 확대 화면');
    expect(within(panel).getByRole('button', { name: '일시정지' })).toBeDisabled();
    expect(within(panel).getByText(/마지막으로 받은 값/)).toBeInTheDocument();
  });

  it('연결이 돌아오면 원래 상태 표시로 돌아온다', () => {
    const { store } = page();
    disconnect(store);
    act(() => {
      store.dispatch(connectionChanged({ status: 'online', lastReceivedAt: NOW }));
    });
    expect(screen.getAllByText('정상').length).toBeGreaterThan(0);
    expect(screen.queryByText('마지막 값')).not.toBeInTheDocument();
  });

  it('선택한 기기가 있어도 로그아웃처럼 초기화되면 확대 화면이 닫힌다', () => {
    const { store } = page();
    act(() => {
      store.dispatch(deviceSelected('tank-a1'));
    });
    expect(screen.getByLabelText('탱크 A1 확대 화면')).toBeInTheDocument();
    act(() => {
      store.dispatch(deviceSelected(null));
    });
    expect(screen.queryByLabelText('탱크 A1 확대 화면')).not.toBeInTheDocument();
  });
});

describe('PhaseBar (하단 단계 바)', () => {
  const bar = () => screen.getByRole('group', { name: '작업 단계' });
  const current = () => within(bar()).queryAllByText(/./, { selector: '[aria-current="step"]' }).map((e) => e.textContent);

  it('집기, 이동, 놓기, 압축 순서로 보여 주고 지금 단계를 강조한다', () => {
    renderWithStore(<PhaseBar />, { devices: [robotState({ phase: 'move' }), compressorState()] });
    const steps = within(bar()).getAllByRole('listitem').map((li) => li.textContent?.replace(/[→\s]/g, ''));
    expect(steps).toEqual(['집기', '이동', '놓기', '압축가동']);
    expect(current()).toEqual(['이동']);
    expect(bar()).toHaveAttribute('data-tone', 'normal');
  });

  it.each([
    ['pick', '집기'],
    ['place', '놓기'],
  ] as const)('%s 단계에서는 %s가 강조된다', (phase, label) => {
    renderWithStore(<PhaseBar />, { devices: [robotState({ phase }), compressorState()] });
    expect(current()).toEqual([label]);
  });

  it('대기 중에는 강조되는 단계가 없다', () => {
    renderWithStore(<PhaseBar />, { devices: [robotState({ phase: 'idle' }), compressorState()] });
    expect(current()).toEqual([]);
  });

  it.each([
    ['error', 'alarm', '오류'],
    ['stopped', 'caution', '정지'],
    ['paused', 'caution', '일시정지'],
    ['offline', 'offline', '연결 끊김'],
  ] as const)('로봇이 %s이면 바 전체가 %s 색과 "%s" 글자로 눈에 띈다', (status, tone, text) => {
    renderWithStore(<PhaseBar />, { devices: [robotState({ status, phase: 'move' }), compressorState()] });
    expect(bar()).toHaveAttribute('data-tone', tone);
    expect(within(bar()).getByText(text, { selector: 'span' })).toBeInTheDocument();
    expect(current()).toEqual([]); // 멈춘 로봇의 단계를 진행 중처럼 강조하지 않는다
  });

  it('연결이 끊기면 단계 강조를 없애고 연결 끊김으로 표시한다', () => {
    const { store } = renderWithStore(<PhaseBar />, { devices: [robotState({ phase: 'move' }), compressorState()] });
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(bar()).toHaveAttribute('data-tone', 'offline');
    expect(current()).toEqual([]);
    expect(within(bar()).getAllByText('연결 끊김').length).toBeGreaterThan(0);
  });

  it('압축 칸은 압축기의 가동 상태를 보여 준다', () => {
    renderWithStore(<PhaseBar />, { devices: [robotState(), compressorState(false)] });
    expect(within(bar()).getByText('정지', { selector: 'span.rounded-full' })).toBeInTheDocument();
  });

  it('로봇 상태를 받기 전에는 불러오는 중이라고 보여 준다', () => {
    renderWithStore(<PhaseBar />);
    expect(bar()).toHaveTextContent('불러오는 중');
  });

  it('사이클 시간 같은 계속 바뀌는 숫자는 없다', () => {
    renderWithStore(<PhaseBar />, { devices: [robotState({ phase: 'move' }), compressorState()] });
    expect(bar().textContent).not.toMatch(/\d/);
  });
});
