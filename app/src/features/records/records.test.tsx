import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchRecord, VehicleRecord } from '@ecocycle/shared';
import * as api from '../../api';
import { ApiError } from '../../api';
import { renderWithStore } from '../../test/utils';
import { BatchDetailPage } from './BatchDetailPage';
import { RecordsPage } from './RecordsPage';
import { VehicleDetailPage } from './VehicleDetailPage';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getRecords: vi.fn(),
  getVehicleRecord: vi.fn(),
  getBatchRecord: vi.fn(),
}));

const DEPARTED: VehicleRecord = {
  id: 'veh-20261015-034',
  status: 'departed',
  plate: '12가 3456',
  companyName: '한빛자원',
  sectorId: 'tank-a1',
  arrivedAt: '2026-10-15T04:11:58.000Z',
  departedAt: '2026-10-15T04:13:25.000Z',
  grossT: 18.42,
  tareT: 9.86,
  netT: 8.56,
  stageTimes: {
    arrived: '2026-10-15T04:11:58.000Z',
    identified: '2026-10-15T04:12:04.000Z',
    unloading: '2026-10-15T04:12:20.000Z',
    unloaded: '2026-10-15T04:12:40.000Z',
    departed: '2026-10-15T04:13:25.000Z',
  },
};

const UNLOADING: VehicleRecord = {
  ...DEPARTED,
  id: 'veh-20261015-035',
  status: 'unloading',
  plate: '87나 1203',
  departedAt: null,
  tareT: null,
  netT: null,
  stageTimes: { arrived: '2026-10-15T05:00:00.000Z', identified: '2026-10-15T05:00:06.000Z', unloading: '2026-10-15T05:00:22.000Z' },
};

const BATCH = (over: Partial<BatchRecord> = {}): BatchRecord => ({
  id: 'batch-0407',
  result: 'completed',
  startedAt: '2026-10-15T04:20:00.000Z',
  endedAt: '2026-10-15T04:24:10.000Z',
  mix: [
    { sectorId: 'tank-a1', percent: 40 },
    { sectorId: 'tank-b2', percent: 60 },
  ],
  avgMoisturePercent: 11.8,
  targetPressureMpa: 28.5,
  actualPressureMpa: 28.3,
  balesProduced: 1,
  baleIds: ['BL-20261015-0407'],
  ...over,
});

/** 길이 확인용: 지금 주소를 화면에 적는다 */
function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function app(route: string) {
  return renderWithStore(
    <>
      <Where />
      <Routes>
        <Route path="/records" element={<RecordsPage />} />
        <Route path="/records/vehicles/:id" element={<VehicleDetailPage />} />
        <Route path="/records/batches/:id" element={<BatchDetailPage />} />
      </Routes>
    </>,
    { route },
  );
}

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 10 });

beforeEach(() => {
  vi.mocked(api.getRecords).mockReset();
  vi.mocked(api.getRecords).mockImplementation(async (path) => (path === '/vehicles/records' ? page([DEPARTED, UNLOADING]) : page([BATCH(), BATCH({ id: 'batch-0406', result: 'skipped', actualPressureMpa: null, balesProduced: 0, baleIds: [] })])) as never);
  vi.mocked(api.getVehicleRecord).mockReset();
  vi.mocked(api.getVehicleRecord).mockResolvedValue(DEPARTED);
  vi.mocked(api.getBatchRecord).mockReset();
  vi.mocked(api.getBatchRecord).mockResolvedValue(BATCH());
});

describe('공정 기록 화면', () => {
  it('처음에는 차량 탭: 번호판·회사·섹터·계중대 무게·상태를 서버 값 그대로 적는다', async () => {
    app('/records');
    expect(screen.getByRole('heading', { name: '공정 기록' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '차량' })).toHaveAttribute('aria-selected', 'true');
    const table = await screen.findByRole('table', { name: '차량 기록' });
    expect(api.getRecords).toHaveBeenCalledWith('/vehicles/records', expect.objectContaining({ page: 1, pageSize: 10 }), expect.anything());
    const row = within(table).getByText('12가 3456').closest('tr') as HTMLElement;
    expect(within(row).getByText('한빛자원')).toBeInTheDocument();
    expect(within(row).getByText('A1')).toBeInTheDocument();
    expect(within(row).getByText('18.42 t')).toBeInTheDocument();
    expect(within(row).getByText('9.86 t')).toBeInTheDocument();
    expect(within(row).getByText('8.56 t')).toBeInTheDocument();
    expect(within(row).getByText('출차')).toBeInTheDocument();
  });

  it('출차 전 차량은 공차·순중량·출차 시각 대신 "–"를 적고 상태는 하역이다', async () => {
    app('/records');
    const table = await screen.findByRole('table', { name: '차량 기록' });
    const row = within(table).getByText('87나 1203').closest('tr') as HTMLElement;
    expect(within(row).getByText('하역')).toBeInTheDocument();
    expect(within(row).getAllByText('–').length).toBeGreaterThanOrEqual(3);
    expect(within(row).getByText('18.42 t')).toBeInTheDocument();
  });

  it('배치 탭: 배합(섹터 %)·목표 → 실제 압력·결과·베일, 건너뛴 배치는 실제 압력과 베일이 "–"', async () => {
    app('/records?tab=batches');
    expect(screen.getByRole('tab', { name: '배치' })).toHaveAttribute('aria-selected', 'true');
    const table = await screen.findByRole('table', { name: '배치 기록' });
    expect(api.getRecords).toHaveBeenCalledWith('/batches/records', expect.anything(), expect.anything());
    const done = within(table).getByText('#0407').closest('tr') as HTMLElement;
    expect(within(done).getByText('A1 40% · B2 60%')).toBeInTheDocument();
    expect(within(done).getByText('28.5 → 28.3')).toBeInTheDocument();
    expect(within(done).getByText('완료')).toBeInTheDocument();
    expect(within(done).getByText('1개')).toBeInTheDocument();
    const skipped = within(table).getByText('#0406').closest('tr') as HTMLElement;
    expect(within(skipped).getByText('건너뜀')).toBeInTheDocument();
    expect(within(skipped).getByText('28.5 → –')).toBeInTheDocument();
  });

  it('탭을 바꾸면 주소의 tab이 바뀌고 그 목록을 받는다', async () => {
    app('/records');
    await screen.findByRole('table', { name: '차량 기록' });
    await userEvent.click(screen.getByRole('tab', { name: '배치' }));
    await screen.findByRole('table', { name: '배치 기록' });
    expect(screen.getByTestId('where')).toHaveTextContent('/records?tab=batches');
  });

  it('차량 줄을 누르면 그 차량의 상세로 간다 (폰 줄도 같다)', async () => {
    app('/records');
    const list = await screen.findByRole('list', { name: '차량 기록' });
    await userEvent.click(within(list).getByRole('button', { name: /12가 3456/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/records/vehicles/veh-20261015-034');
    expect(await screen.findByText('계중대 무게')).toBeInTheDocument();
  });

  it('배치 줄을 누르면 그 배치의 상세로 간다', async () => {
    app('/records?tab=batches');
    const table = await screen.findByRole('table', { name: '배치 기록' });
    await userEvent.click(within(table).getByText('#0407'));
    expect(screen.getByTestId('where')).toHaveTextContent('/records/batches/batch-0407');
    expect(await screen.findByText('만든 베일 1개')).toBeInTheDocument();
    expect(screen.getByText('BL-20261015-0407')).toBeInTheDocument();
  });
});

describe('차량 기록 상세', () => {
  it('번호판·회사·섹터 링크, 총중량·공차·순중량, 단계별 시각을 적는다', async () => {
    app('/records/vehicles/veh-20261015-034');
    expect(await screen.findByText('12가 3456')).toBeInTheDocument();
    expect(api.getVehicleRecord).toHaveBeenCalledWith('veh-20261015-034', expect.anything());
    const weights = screen.getByRole('region', { name: '계중대 무게' });
    expect(within(weights).getByText('18.42 t')).toBeInTheDocument();
    expect(within(weights).getByText('9.86 t')).toBeInTheDocument();
    expect(within(weights).getByText('8.56 t')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '섹터 A1' })).toHaveAttribute('href', '/tanks/tank-a1');
    expect(screen.getByRole('link', { name: /공정 기록/ })).toHaveAttribute('href', '/records?tab=vehicles');
    const stages = screen.getByRole('region', { name: '단계별 시각' });
    expect(within(stages).getByText('번호판 인식')).toBeInTheDocument();
    expect(within(stages).getByText('출차')).toBeInTheDocument();
  });

  it('출차 전에는 공차·순중량이 "–"이고 안내를 보인다', async () => {
    vi.mocked(api.getVehicleRecord).mockResolvedValue(UNLOADING);
    app('/records/vehicles/veh-20261015-035');
    expect(await screen.findByText('87나 1203')).toBeInTheDocument();
    expect(screen.getByText('공차와 순중량은 출차 계량 뒤에 확정됩니다.')).toBeInTheDocument();
    expect(screen.getByText('아직 출차하지 않았습니다')).toBeInTheDocument();
  });

  it('없는 차량(404)이면 찾을 수 없다고 알리고, 그 밖의 실패는 다시 시도할 수 있다', async () => {
    vi.mocked(api.getVehicleRecord).mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', ''));
    const { unmount } = app('/records/vehicles/nope');
    expect(await screen.findByText(/차량 기록을 찾을 수 없습니다/)).toBeInTheDocument();
    unmount();

    vi.mocked(api.getVehicleRecord).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', ''));
    app('/records/vehicles/veh-20261015-034');
    await userEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(screen.getByText('12가 3456')).toBeInTheDocument());
  });
});
