import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchEvent } from '@ecocycle/shared';
import * as batchesApi from '../../api/batches';
import * as recordsApi from '../../api/records';
import * as api from '../../api';
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
    actualMix: null,
    pinChanges: [],
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

describe('섹터 지정 중인 배치: 계획 배합과 실제 배합', () => {
  const pinnedBatch = {
    id: 'batch-0413',
    stage: 'mixing' as const,
    mix: [{ sectorId: 'tank-a1' as const, percent: 40 }, { sectorId: 'tank-b2' as const, percent: 60 }],
    actualMix: [{ sectorId: 'tank-a1' as const, percent: 35 }, { sectorId: 'tank-b1' as const, percent: 65 }],
    pinning: { sectors: ['tank-b1' as const], since: '2026-10-15T04:21:00.000Z', actor: '관리자(모의)' },
    pinChanges: [{ at: '2026-10-15T04:21:00.000Z', actor: '관리자(모의)', sectors: ['tank-b1' as const] }],
    avgMoisturePercent: 12.4,
    targetPressureMpa: 28.9,
    stageTimes: { planned: '2026-10-15T04:20:00.000Z', mixing: '2026-10-15T04:20:03.000Z' },
    updatedAt: '2026-10-15T04:22:00.000Z',
  };

  it('현재 배치는 계획 배합과 실제 배합(서버 값)을 함께, "섹터 지정 중" 표시와 함께 보여 준다', async () => {
    vi.mocked(batchesApi.getBatchControl).mockResolvedValue({
      eventsRevision: 3,
      current: { batch: pinnedBatch, paused: false, skipped: false, progressPercent: 24, currentPressureMpa: 0, baleIds: [] },
      next: null,
      pressureRange: { min: 27, max: 30 },
    });
    app();
    const card = await screen.findByRole('region', { name: '현재 배치' });
    expect(await within(card).findByText('섹터 지정 중 · B1')).toBeInTheDocument();
    const plan = within(card).getByLabelText('계획 배합');
    const actual = within(card).getByLabelText('실제 배합 (놓은 부피 기준)');
    expect(plan).toHaveTextContent('섹터 A1');
    expect(plan).toHaveTextContent('40%');
    expect(plan).toHaveTextContent('섹터 B2');
    // 실제 배합은 서버가 놓은 부피로 계산한 값을 그대로 (지정한 B1이 들어간다)
    expect(actual).toHaveTextContent('섹터 B1');
    expect(actual).toHaveTextContent('65%');
    expect(actual).not.toHaveTextContent('섹터 B2');
    expect(within(card).getByText(/실제 배합으로 서버가 다시 계산/)).toBeInTheDocument();
    expect(within(card).getByText('12.4%')).toBeInTheDocument();
  });

  it('지정이 없던 배치는 배합 하나만 보여 준다', async () => {
    vi.mocked(batchesApi.getBatchControl).mockResolvedValue({
      eventsRevision: 3,
      current: { batch: { ...pinnedBatch, actualMix: null, pinning: null, pinChanges: [] }, paused: false, skipped: false, progressPercent: 24, currentPressureMpa: 0, baleIds: [] },
      next: null,
      pressureRange: { min: 27, max: 30 },
    });
    app();
    const card = await screen.findByRole('region', { name: '현재 배치' });
    expect(await within(card).findByLabelText('배합')).toBeInTheDocument();
    expect(within(card).queryByLabelText(/실제 배합/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/섹터 지정/)).not.toBeInTheDocument();
  });

  it('배치 팝업은 계획·실제 배합과 섹터 지정 기록(누가·어느 섹터·언제)을 보여 준다', async () => {
    vi.mocked(api.getBatchRecord).mockResolvedValueOnce({
      id: 'batch-0407', result: 'completed', startedAt: '2026-10-15T04:20:00.000Z', endedAt: '2026-10-15T04:24:10.000Z',
      mix: [{ sectorId: 'tank-a1', percent: 100 }],
      actualMix: [{ sectorId: 'tank-a1', percent: 55 }, { sectorId: 'tank-b1', percent: 45 }],
      pinChanges: [
        { at: '2026-10-15T04:21:00.000Z', actor: '관리자(모의)', sectors: ['tank-b1'] },
        { at: '2026-10-15T04:22:30.000Z', actor: '관리자(모의)', sectors: [] },
      ],
      avgMoisturePercent: 12.1, targetPressureMpa: 28.7, actualPressureMpa: 28.5, balesProduced: 0, baleIds: [],
    });
    app();
    const list = await screen.findByRole('list', { name: '배치·베일 사건 기록' });
    await userEvent.click(within(list).getAllByRole('button')[1] as HTMLElement);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('A1 55% · B1 45%')).toBeInTheDocument();
    expect(within(dialog).getByText('계획 배합')).toBeInTheDocument();
    expect(within(dialog).getByText('실제 배합 반영')).toBeInTheDocument();
    expect(within(dialog).getByText('지정 B1')).toBeInTheDocument();
    expect(within(dialog).getByText('지정 해제')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/관리자\(모의\)/)).toHaveLength(2);
  });
});

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
