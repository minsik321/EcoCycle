import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm } from '@ecocycle/shared';
import * as api from '../../api';
import { alarmReceived, connectionChanged } from '../../store';
import { NOW, OPERATOR, VIEWER, renderWithStore } from '../../test/utils';
import { AlarmsPage } from './AlarmsPage';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getAlarms: vi.fn(),
  sendCommand: vi.fn(),
}));

const alarm = (id: string, state: Alarm['state'], ts: string, deviceId: Alarm['deviceId'] = 'tank-a1', level: Alarm['level'] = 'caution'): Alarm => ({
  id,
  level,
  deviceId,
  message: `${id} 메시지`,
  state,
  ts,
});

function page(options: Parameters<typeof renderWithStore>[1] = {}) {
  return renderWithStore(
    <Routes>
      <Route path="/alarms" element={<AlarmsPage />} />
      <Route path="/tanks/:id" element={<div>탱크 페이지</div>} />
      <Route path="/compressor" element={<div>압축기 페이지</div>} />
    </Routes>,
    { route: '/alarms', ...options },
  );
}

beforeEach(() => {
  vi.mocked(api.getAlarms).mockReset();
  vi.mocked(api.getAlarms).mockResolvedValue([
    alarm('al-1', 'cleared', '2026-10-12T05:00:00.000Z', 'compressor-1', 'alarm'),
    alarm('al-2', 'active', '2026-10-13T04:00:00.000Z'),
  ]);
  vi.mocked(api.sendCommand).mockReset();
});

describe('AlarmsPage: 열린 알람', () => {
  it('열린 알람이 없으면 없다고 알린다', async () => {
    page();
    expect(screen.getByLabelText('열린 알람')).toHaveTextContent('열린 알람이 없습니다.');
    expect(screen.getByRole('button', { name: '열린 알람 0건' })).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() => expect(api.getAlarms).toHaveBeenCalled());
  });

  it('발생 중과 확인한 알람을 최신순으로 보여 주고 실시간으로 늘어난다', async () => {
    const { store } = page();
    act(() => {
      store.dispatch(alarmReceived(alarm('a1', 'active', '2026-10-13T04:00:00.000Z')));
      store.dispatch(alarmReceived(alarm('a2', 'acknowledged', '2026-10-13T05:00:00.000Z', 'tank-b2')));
    });
    const items = within(screen.getByLabelText('열린 알람')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('탱크 B2 · a2 메시지');
    expect(items[0]).toHaveTextContent('확인함');
    expect(items[1]).toHaveTextContent('발생 중');
    expect(screen.getByRole('button', { name: '열린 알람 2건' })).toBeInTheDocument();
    await vi.waitFor(() => expect(api.getAlarms).toHaveBeenCalled());
  });

  it('발생 중인 알람에만 확인 버튼이 있고 누르면 그 기기 경로로 알람 확인을 보낸다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue({ idempotencyKey: 'k', accepted: { commandId: 'cmd-1', status: 'accepted' } });
    const { store } = page({ me: OPERATOR });
    act(() => {
      store.dispatch(alarmReceived(alarm('a1', 'active', '2026-10-13T04:00:00.000Z', 'tank-a2')));
      store.dispatch(alarmReceived(alarm('a2', 'acknowledged', '2026-10-13T05:00:00.000Z')));
    });
    expect(screen.getAllByRole('button', { name: '알람 확인' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: '알람 확인' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![0]).toBe('tank-a2');
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toEqual({ type: 'ack_alarm', alarmId: 'a1' });
  });

  it('열람자는 확인 버튼을 볼 수 없다', async () => {
    const { store } = page({ me: VIEWER });
    act(() => {
      store.dispatch(alarmReceived(alarm('a1', 'active', '2026-10-13T04:00:00.000Z')));
    });
    expect(screen.queryByRole('button', { name: '알람 확인' })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(api.getAlarms).toHaveBeenCalled());
  });

  it('알람을 누르면 해당 기기 페이지로 이동한다', async () => {
    const { store } = page();
    act(() => {
      store.dispatch(alarmReceived(alarm('a1', 'active', '2026-10-13T04:00:00.000Z', 'tank-a2')));
    });
    await userEvent.click(screen.getByRole('link', { name: /탱크 A2/ }));
    expect(screen.getByText('탱크 페이지')).toBeInTheDocument();
  });

  it('연결이 끊기면 마지막으로 받은 목록이라고 알린다', async () => {
    const { store } = page();
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('마지막으로 받은 알람 목록');
    await vi.waitFor(() => expect(api.getAlarms).toHaveBeenCalled());
  });
});

describe('AlarmsPage: 최근 7일 이력', () => {
  it('모든 기기의 이력을 최신순으로 보여 주고 상태를 글자로 알린다', async () => {
    page();
    await userEvent.click(screen.getByRole('button', { name: '최근 7일 이력' }));
    const items = await within(screen.getByLabelText('알람 이력')).findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('탱크 A1 · al-2 메시지');
    expect(items[0]).toHaveTextContent('발생 중');
    expect(items[1]).toHaveTextContent('압축기 · al-1 메시지');
    expect(items[1]).toHaveTextContent('해제됨');
    expect(within(items[1]!).queryByRole('button', { name: '알람 확인' })).not.toBeInTheDocument();
  });

  it('이력 알람을 누르면 그 기기 페이지로 간다', async () => {
    page();
    await userEvent.click(screen.getByRole('button', { name: '최근 7일 이력' }));
    await userEvent.click(await screen.findByRole('link', { name: /압축기/ }));
    expect(screen.getByText('압축기 페이지')).toBeInTheDocument();
  });

  it('불러오지 못하면 오류와 다시 시도 버튼을 보여 준다', async () => {
    vi.mocked(api.getAlarms).mockRejectedValueOnce(new api.ApiError(503, 'X', '')).mockResolvedValue([]);
    page();
    await userEvent.click(screen.getByRole('button', { name: '최근 7일 이력' }));
    const alert = await screen.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('최근 7일간 알람이 없습니다.')).toBeInTheDocument();
  });
});
