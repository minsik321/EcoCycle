import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeviceState, UnloadRecord } from '@ecocycle/shared';
import * as api from '../../api';
import { connectionChanged } from '../../store';
import { ADMIN, NOW, OPERATOR, renderWithStore } from '../../test/utils';
import { TankListPage } from './TankListPage';
import { TankPage } from './TankPage';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getHistory: vi.fn(),
  getAlarms: vi.fn(),
  getRecords: vi.fn(),
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
  cautionThresholdPercent: 80,
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
  vi.mocked(api.getRecords).mockReset();
  vi.mocked(api.getRecords).mockResolvedValue({ items: [UNLOAD], total: 1, page: 1, pageSize: 10 });
});

const UNLOAD: UnloadRecord = {
  id: 'unl-20261013-034',
  vehicleId: 'veh-20261013-034',
  sectorId: 'tank-a1',
  plate: '12가 3456',
  companyName: '한빛자원',
  unloadedAt: NOW,
  grossT: 18.42,
  tareT: 9.86,
  netT: 8.56,
  fillBeforePercent: 42.2,
  fillAfterPercent: 55.1,
};

/** 이력 그래프가 그려질 때까지 기다린다 (섹터 그림도 img라 이름으로 고른다) */
const chart = () => screen.findByRole('img', { name: /섹터 A1 적재율,|섹터 B2 적재율,/ });
const openDetails = () => userEvent.click(screen.getByRole('button', { name: '자세히' }));

describe('TankListPage', () => {
  it('탱크 4개를 상태와 수위와 함께 보여 주고 누르면 그 탱크 페이지로 간다', async () => {
    pages('/tanks');
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[3]).toHaveTextContent('섹터 B2');
    expect(links[3]).toHaveTextContent('주의');
    expect(within(links[3]!).getByTestId('bin-reading')).toHaveTextContent('82.0%5.8 / 8.0 m³');
    expect(within(links[3]!).getByRole('group', { name: '등급' })).toHaveTextContent('A등급');

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
    for (const reading of screen.getAllByTestId('bin-reading')) expect(reading).toHaveTextContent(/^–마지막 수신/);
  });

  it('아직 상태를 못 받았으면 불러오는 중이라고 보여 준다', () => {
    renderWithStore(<TankListPage />);
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중');
  });
});

describe('TankPage', () => {
  it('적재율·부피는 칸 그림 안에, 수분·등급은 그림 카드 위 칩에 있고 따로 된 수치 칸은 없다', async () => {
    pages('/tanks/tank-a1');
    expect(screen.getByRole('img', { name: '섹터 A1 적재율 72.4%, 주의 기준 80%' })).toBeInTheDocument();
    const reading = screen.getByTestId('bin-reading');
    expect(reading).toHaveTextContent('72.4%');
    expect(reading).toHaveTextContent('5.8 / 8.0 m³');
    const hero = screen.getByLabelText('섹터 A1 상태');
    expect(within(hero).getByRole('group', { name: '수분' })).toHaveTextContent('11.8%');
    expect(within(hero).getByRole('group', { name: '등급' })).toHaveTextContent('A등급');
    expect(within(hero).getByText('정상')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '주요 수치' })).not.toBeInTheDocument();
    // 섹터 상태에는 무게를 쓰지 않는다 (무게는 하역 기록에만)
    expect(within(hero).queryByText(/ t$|kg|톤/)).not.toBeInTheDocument();
    await screen.findByText('12가 3456 · 한빛자원');
  });

  it('적재율 글자는 채움 윗선 바로 위에 붙고, 거의 다 차도 파지 위로 내려가지 않는다', async () => {
    const base = devices()[0] as Extract<DeviceState, { type: 'tank' }>;
    pages('/tanks/tank-a1', { devices: [{ ...base, fillPercent: 98 }] });
    // 그림 높이 130 중 윗선은 바닥에서 16(바닥 아래 여백) + 98 = 114 → 87.69%
    expect(screen.getByTestId('bin-reading').style.bottom).toBe('calc(87.69% + 3px)');
    await screen.findByText('12가 3456 · 한빛자원');
  });

  it('파지 더미는 적재율만큼 차고, 주의선은 서버가 준 기준값에 긋는다', async () => {
    const custom = { ...(devices()[0] as Extract<DeviceState, { type: 'tank' }>), fillPercent: 55, cautionThresholdPercent: 70 };
    pages('/tanks/tank-a1', { devices: [custom] });
    // 벽 높이 100 중 비어 있는 45만큼 내린다
    expect(screen.getByTestId('bin-pile').style.transform).toBe('translateY(45px)');
    const caution = within(screen.getByTestId('bin-caution'));
    expect(caution.getByText('주의')).toBeInTheDocument();
    expect(caution.getByText('70%')).toBeInTheDocument();
    await screen.findByText('12가 3456 · 한빛자원');
  });

  it('맨 아래에 하역 기록: 시각, 번호판, 회사, 순중량(t), 적재율 변화', async () => {
    pages('/tanks/tank-a1');
    const records = screen.getByRole('region', { name: '하역 기록' });
    expect(await within(records).findByText('12가 3456 · 한빛자원')).toBeInTheDocument();
    const table = within(records).getByRole('table', { name: '하역 기록' });
    expect(table).toHaveTextContent('8.56 t');
    expect(table).toHaveTextContent('18.42 t');
    expect(table).toHaveTextContent('9.86 t');
    expect(table).toHaveTextContent('42% → 55% +13%p');
    const [path, query] = vi.mocked(api.getRecords).mock.calls[0]!;
    expect(path).toBe('/devices/tank-a1/unloads/records');
    expect(query).toMatchObject({ page: 1, pageSize: 10 });
  });

  it('"자세히"를 열면 이력 그래프, 기준값 설정, 알람 이력이 있다', async () => {
    pages('/tanks/tank-a1', { me: ADMIN });
    expect(screen.queryByLabelText('이력 그래프')).not.toBeInTheDocument();
    await openDetails();
    expect(await chart()).toBeInTheDocument();
    expect(screen.getByLabelText('이력 그래프')).toBeInTheDocument();
    expect(screen.getByLabelText('기준값 설정')).toBeInTheDocument();
    expect(await screen.findByText('최근 7일간 알람이 없습니다.')).toBeInTheDocument();
    expect(vi.mocked(api.getHistory).mock.calls[0]![0]).toMatchObject({ deviceId: 'tank-a1', metric: 'level', interval: '10m' });
  });

  it('PC 폭(xl 이상)에서는 "자세히"가 늘 펼쳐져 있고 접을 수 없다', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(min-width: 80rem)', media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      pages('/tanks/tank-a1');
      expect(screen.queryByRole('button', { name: '자세히' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '자세히' })).toBeInTheDocument();
      expect(await chart()).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it('작업자는 설정을 바꿀 수 없고 이유를 본다', async () => {
    pages('/tanks/tank-a1', { me: OPERATOR });
    await openDetails();
    expect(screen.getByLabelText('주의 기준 적재율')).toBeDisabled();
    expect(screen.getByText('설정을 바꿀 권한이 없습니다.')).toBeInTheDocument();
    await chart();
  });

  it('관리자는 확인 단계를 거쳐 설정을 보낸다', async () => {
    vi.mocked(api.sendCommand).mockResolvedValue({ idempotencyKey: 'k', accepted: { commandId: 'cmd-1', status: 'accepted' } });
    pages('/tanks/tank-a1', { me: ADMIN });
    await openDetails();
    await userEvent.type(screen.getByLabelText('주의 기준 적재율'), '60');
    await userEvent.click(screen.getByRole('button', { name: '설정 변경' }));
    await userEvent.click(screen.getByRole('button', { name: '변경' }));
    expect(vi.mocked(api.sendCommand).mock.calls[0]![1]).toMatchObject({ type: 'update_setting', value: 60, confirm: true });
    await chart();
  });

  it('연결이 끊기면 값은 "–", 상태는 연결 끊김, 그림은 멈추고 받은 하역 기록은 그대로 둔다', async () => {
    const { store } = pages('/tanks/tank-b2');
    await screen.findByText('12가 3456 · 한빛자원');
    expect(screen.getByText('주의', { selector: 'span' })).toBeInTheDocument();
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    expect(screen.queryByText('주의', { selector: 'span' })).not.toBeInTheDocument();
    expect(screen.getByText('연결 끊김')).toBeInTheDocument();
    const reading = screen.getByTestId('bin-reading');
    expect(reading).toHaveTextContent('–');
    expect(reading).toHaveTextContent('마지막 수신');
    expect(reading).not.toHaveTextContent('82.0%');
    expect(screen.getByRole('group', { name: '수분' })).toHaveTextContent('–');
    // 채움 전환을 멈춘다
    expect(screen.getByTestId('bin-pile').style.transition).toBe('none');
    expect(screen.getByRole('img', { name: '섹터 B2 그림, 연결 끊김' }).closest('[data-frozen]')).toHaveAttribute('data-frozen', 'true');
    expect(screen.getByText('12가 3456 · 한빛자원')).toBeInTheDocument();
  });

  it('상태를 받기 전에는 불러오는 중이고, 없는 섹터 주소는 안내한다', async () => {
    renderWithStore(
      <Routes>
        <Route path="/tanks/:id" element={<TankPage />} />
      </Routes>,
      { route: '/tanks/tank-a1' },
    );
    expect(screen.getByRole('img', { name: '섹터 A1 그림, 불러오는 중' })).toBeInTheDocument();
    expect(screen.getByLabelText('지금 하는 일')).toHaveTextContent('불러오는 중…');
    await screen.findByText('12가 3456 · 한빛자원');

    pages('/tanks/tank-zz');
    expect(screen.getByRole('heading', { name: '섹터를 찾을 수 없습니다' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '섹터 목록으로' })).toHaveAttribute('href', '/tanks');
  });
});
