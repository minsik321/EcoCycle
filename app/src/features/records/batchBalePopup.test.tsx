import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchEvent } from '@ecocycle/shared';
import * as batchesApi from '../../api/batches';
import * as recordsApi from '../../api/records';
import { ADMIN, renderWithStore } from '../../test/utils';
import { BatchBalePage } from './BatchBalePage';
import { RecordPopupLayer } from './popup/RecordPopupLayer';

vi.mock('../../api/records', () => ({ getRecords: vi.fn() }));
vi.mock('../../api/batches', () => ({ getBatchControl: vi.fn(), getBaleDetail: vi.fn() }));
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getBatchRecord: vi.fn(async (id: string) => ({
    id,
    result: 'completed',
    startedAt: '2026-10-15T04:20:00.000Z',
    endedAt: '2026-10-15T04:24:10.000Z',
    mix: [{ sectorId: 'tank-a1', percent: 100 }],
    avgMoisturePercent: 11.8,
    targetPressureMpa: 28.5,
    actualPressureMpa: 28.3,
    balesProduced: 0,
    baleIds: [],
  })),
}));

const EVENTS: BatchEvent[] = [
  { id: 'e2', batchId: 'batch-0407', at: '2026-10-15T04:24:10.000Z', type: 'bale_produced', actor: '자동 공정', detail: 'BL-20261015-0407 생산', baleId: 'BL-20261015-0407' },
  { id: 'e1', batchId: 'batch-0407', at: '2026-10-15T04:20:00.000Z', type: 'created', actor: '자동 공정', detail: 'A1 100%' },
];

function Where() {
  const { pathname } = useLocation();
  return <p data-testid="where">{pathname}</p>;
}

beforeEach(() => {
  vi.mocked(recordsApi.getRecords).mockResolvedValue({ items: EVENTS, total: 2, page: 1, pageSize: 10 } as never);
  vi.mocked(batchesApi.getBatchControl).mockResolvedValue({ eventsRevision: 1, current: null, next: null, pressureRange: { min: 27, max: 30 } });
  vi.mocked(batchesApi.getBaleDetail).mockImplementation(async (id) => ({
    id,
    batchId: 'batch-0407',
    stage: 'created',
    stageTimes: { created: '2026-10-15T04:24:10.000Z' },
    updatedAt: '2026-10-15T04:24:10.000Z',
    pressureMpa: 28.3,
    avgMoisturePercent: 11.8,
    mix: [{ sectorId: 'tank-a1', percent: 100 }],
  }));
});

const app = () =>
  renderWithStore(
    <>
      <Where />
      <RecordPopupLayer>
        {(location) => (
          <Routes location={location}>
            <Route path="/records/batches" element={<BatchBalePage />} />
          </Routes>
        )}
      </RecordPopupLayer>
    </>,
    { route: '/records/batches', me: ADMIN },
  );

describe('배치·베일 사건 기록 → 팝업', () => {
  it('베일 생산 사건을 누르면 따로 된 "사건 상세" 없이 그 베일 팝업이 바로 뜨고, 닫으면 배치·베일 화면', async () => {
    app();
    const list = await screen.findByRole('list', { name: '배치·베일 사건 기록' });
    await userEvent.click(within(list).getAllByRole('button')[0] as HTMLElement);
    expect(screen.getByTestId('where')).toHaveTextContent('/records/bales/BL-20261015-0407');
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: '베일 상세' })).toBeInTheDocument();
    expect(screen.queryByText('사건 상세')).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/records/batches');
  });

  it('베일이 없는 사건은 그 배치 팝업을 연다', async () => {
    app();
    const list = await screen.findByRole('list', { name: '배치·베일 사건 기록' });
    await userEvent.click(within(list).getAllByRole('button')[1] as HTMLElement);
    expect(screen.getByTestId('where')).toHaveTextContent('/records/batches/batch-0407');
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: '배치 상세' })).toBeInTheDocument();
  });
});
