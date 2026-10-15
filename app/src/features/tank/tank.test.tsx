import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceState } from '@ecocycle/shared';
import * as api from '../../api';
import { connectionChanged } from '../../store';
import { ADMIN, NOW, OPERATOR, renderWithStore } from '../../test/utils';
import { TankListPage } from './TankListPage';
import { TankPage } from './TankPage';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getHistory: vi.fn(),
  getAlarms: vi.fn(),
  sendCommand: vi.fn(),
}));

const tank = (id: 'tank-a1' | 'tank-a2' | 'tank-b1' | 'tank-b2', fill: number, status: 'normal' | 'caution' | 'alarm' = 'normal'): DeviceState => ({
  id,
  type: 'tank',
  section: 'A1',
  grade: 'A',
  status,
  fillPercent: fill,
  volumeM3: 5.8,
  capacityM3: 8,
  moisturePercent: 11.8,
  updatedAt: NOW,
});

const devices = (): DeviceState[] => [tank('tank-a1', 72.4), tank('tank-a2', 45), tank('tank-b1', 30.5), tank('tank-b2', 82, 'caution')];

function pages(route: string, options: Parameters<typeof renderWithStore>[1] = {}) {
  return renderWithStore(
    <Routes>
      <Route path="/tanks" element={<TankListPage />} />
      <Route path="/tanks/:id" element={<TankPage />} />
    </Routes>,
    { devices: devices(), route, ...options },
  );
}

beforeEach(() => {
  vi.mocked(api.getHistory).mockReset();
  vi.mocked(api.getHistory).mockImplementation(async (q) => ({
    deviceId: q.deviceId,
    metric: q.metric,
    interval: q.interval,
    from: q.from,
    to: q.to,
    points: [
      { ts: q.from, value: 40 },
      { ts: q.to, value: 60 },
    ],
  }));
  vi.mocked(api.getAlarms).mockReset();
  vi.mocked(api.getAlarms).mockResolvedValue([]);
});

describe('TankListPage', () => {
  it('탱크 4개를 상태와 수위와 함께 보여 주고 누르면 그 탱크 페이지로 간다', async () => {
    pages('/tanks');
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[3]).toHaveTextContent('섹터 B2');
    expect(links[3]).toHaveTextContent('주의');
    expect(links[3]).toHaveTextContent('82.0%');

    await userEvent.click(screen.getByRole('link', { name: /섹터 A2/ }));
    expect(await screen.findByRole('heading', { name: '섹터 A2' })).toBeInTheDocument();
  });

  it('연결이 끊기면 상태가 연결 끊김으로 바뀐다', () => {
    const { store } = pages('/tanks');
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(screen.queryByText('주의')).not.toBeInTheDocument();
    expect(screen.getAllByText('연결 끊김')).toHaveLength(4);
  });

  it('아직 상태를 못 받았으면 불러오는 중이라고 보여 준다', () => {
    renderWithStore(<TankListPage />);
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
  });
});

describe('TankPage', () => {
  it('현재 적재율, 부피(용량), 수분을 보여 준다 (무게는 없다)', async () => {
    pages('/tanks/tank-a1');
    const status = screen.getByRole('region', { name: '현재 상태' });
    expect(within(status).getByText('72.4%')).toBeInTheDocument();
    expect(within(status).getByText('5.8 m³ / 8.0 m³')).toBeInTheDocument();
    expect(within(status).getByText('11.8%')).toBeInTheDocument();
    expect(screen.queryByText(/무게|kg|톤/)).not.toBeInTheDocument();
    await screen.findByRole('img'); // 그래프까지 그려질 때까지 기다린다
  });

  it('이력 그래프, 기준값 설정, 알람 이력이 한 페이지에 있다', async () => {
    pages('/tanks/tank-a1', { me: ADMIN });
    expect(await screen.findByRole('img')).toBeInTheDocument();
    expect(screen.getByLabelText('이력 그래프')).toBeInTheDocument();
    expect(screen.getByLabelText('기준값 설정')).toBeInTheDocument();
    expect(await screen.findByText('최근 7일간 알람이 없습니다.')).toBeInTheDocument();
    expect(vi.mocked(api.getHistory).mock.calls[0]![0]).toMatchObject({ deviceId: 'tank-a1', metric: 'level', interval: '10m' });
  });

  it('작업자는 설정을 바꿀 수 없고 이유를 본다', async () => {
    pages('/tanks/tank-a1', { me: OPERATOR });
    expect(screen.getByLabelText('주의 기준 적재율')).toBeDisabled();
    expect(screen.getByText('설정을 바꿀 권한이 없습니다.')).toBeInTheDocument();
    await screen.findByRole('img');
  });

  it('관리자는 확인 단계를 거쳐 설정을 보낸다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue({ idempotencyKey: 'k', accepted: { commandId: 'cmd-1', status: 'accepted' } });
    pages('/tanks/tank-a1', { me: ADMIN });
    await userEvent.type(screen.getByLabelText('주의 기준 적재율'), '60');
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));
    await userEvent.click(screen.getByRole('button', { name: '변경' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toMatchObject({ type: 'update_setting', value: 60, confirm: true });
    await screen.findByRole('img');
  });

  it('연결이 끊기면 값을 마지막 값으로 표시하고 상태를 연결 끊김으로 바꾼다', async () => {
    const { store } = pages('/tanks/tank-b2');
    await screen.findByRole('img');
    expect(screen.getByText('주의')).toBeInTheDocument();
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(screen.queryByText('주의')).not.toBeInTheDocument();
    expect(screen.getByText('연결 끊김')).toBeInTheDocument();
    expect(screen.getByText(/마지막으로 받은 값/)).toBeInTheDocument();
  });

  it('상태를 받기 전에는 불러오는 중이고, 없는 탱크 주소는 안내한다', async () => {
    renderWithStore(
      <Routes>
        <Route path="/tanks/:id" element={<TankPage />} />
      </Routes>,
      { route: '/tanks/tank-a1' },
    );
    expect(screen.getByText('섹터 상태를 불러오는 중…')).toBeInTheDocument();
    await screen.findByRole('img');

    pages('/tanks/tank-zz');
    expect(screen.getByRole('heading', { name: '섹터를 찾을 수 없습니다' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '섹터 목록으로' })).toHaveAttribute('href', '/tanks');
  });
});
