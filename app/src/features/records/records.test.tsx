import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaleDetail as BaleDetailData, BaleRecord, BatchRecord, VehicleRecord } from '@ecocycle/shared';
import * as api from '../../api';
import * as batchesApi from '../../api/batches';
import { ApiError } from '../../api';
import { PopupLink } from '../../components/records/recordPopup';
import { renderWithStore } from '../../test/utils';
import { RecordPopupLayer } from './popup/RecordPopupLayer';
import { RecordsPage } from './RecordsPage';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getRecords: vi.fn(),
  getVehicleRecord: vi.fn(),
  getBatchRecord: vi.fn(),
}));
vi.mock('../../api/batches', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/batches')>()),
  getBaleDetail: vi.fn(),
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

/** 확인용: 지금 주소(팝업 계층 밖이라 실제 주소)를 화면에 적고, 브라우저·안드로이드 뒤로 버튼처럼 뒤로 한 칸 간다 */
function Where() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p data-testid="where">{pathname + search}</p>
      <button type="button" data-testid="back" onClick={() => navigate(-1)}>
        뒤로
      </button>
    </>
  );
}

function Home() {
  return (
    <div>
      <h1>홈</h1>
      <PopupLink target={{ kind: 'batch', id: 'batch-0407' }}>이 배치 상세</PopupLink>
    </div>
  );
}

function app(route: string, options: Parameters<typeof renderWithStore>[1] & { strict?: boolean } = {}) {
  const Wrap = options.strict ? StrictMode : 'div';
  return renderWithStore(
    <Wrap>
      <Where />
      <RecordPopupLayer>
        {(location) => (
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/records/:kind/:id" element={<RecordsPage />} />
          </Routes>
        )}
      </RecordPopupLayer>
    </Wrap>,
    { route, ...options },
  );
}

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 10 });

const BALE = (id: string, batchId: string, over: Partial<BaleDetailData> = {}): BaleDetailData => ({
  id,
  batchId,
  stage: 'shipped',
  stageTimes: { created: '2026-10-15T04:24:10.000Z', shipped: '2026-10-15T04:24:35.000Z' },
  updatedAt: '2026-10-15T04:24:35.000Z',
  pressureMpa: 28.3,
  avgMoisturePercent: 11.8,
  mix: [
    { sectorId: 'tank-a1', percent: 40 },
    { sectorId: 'tank-b2', percent: 60 },
  ],
  ...over,
});

// 깊이 1 이력 예시: 베일 A → 배치 X → 베일 B → 배치 Y
const BALE_A = 'BL-20261015-0407';
const BALE_B = 'BL-20261015-0411';
const BATCH_X = 'batch-0407';
const BATCH_Y = 'batch-0411';

const BALE_ROW: BaleRecord = {
  id: BALE_A,
  batchId: BATCH_X,
  stage: 'created',
  createdAt: '2026-10-15T04:24:10.000Z',
  shippedAt: null,
  pressureMpa: 28.3,
  avgMoisturePercent: 11.8,
};

beforeEach(() => {
  vi.mocked(api.getRecords).mockReset();
  vi.mocked(api.getRecords).mockImplementation(
    async (path) =>
      (path === '/vehicles/records'
        ? page([DEPARTED, UNLOADING])
        : path === '/bales/records'
          ? page([BALE_ROW, { ...BALE_ROW, id: BALE_B, batchId: BATCH_Y, stage: 'shipped', shippedAt: '2026-10-15T05:00:00.000Z' }])
          : page([BATCH(), BATCH({ id: 'batch-0406', result: 'skipped', actualPressureMpa: null, balesProduced: 0, baleIds: [] })])) as never,
  );
  vi.mocked(api.getVehicleRecord).mockReset();
  vi.mocked(api.getVehicleRecord).mockResolvedValue(DEPARTED);
  vi.mocked(api.getBatchRecord).mockReset();
  vi.mocked(api.getBatchRecord).mockImplementation(async (id) =>
    id === BATCH_X ? BATCH({ id: BATCH_X, balesProduced: 2, baleIds: [BALE_A, BALE_B] }) : BATCH({ id, baleIds: [BALE_B] }),
  );
  vi.mocked(batchesApi.getBaleDetail).mockReset();
  vi.mocked(batchesApi.getBaleDetail).mockImplementation(async (id) =>
    id === BALE_A ? BALE(BALE_A, BATCH_X) : BALE(id, BATCH_Y, { stage: 'created', stageTimes: { created: '2026-10-15T04:50:00.000Z' } }),
  );
});

const popup = () => screen.getByRole('dialog');
const where = () => screen.getByTestId('where').textContent;
/** 팝업 뒤의 어두운 막(바깥)을 누른다 */
const tapOutside = () => fireEvent.mouseDown(popup().parentElement as HTMLElement);
const goBack = () => userEvent.click(screen.getByTestId('back'));

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

  it('베일 탭: 베일 ID·생산 시각·배치·압력·평균 수분·상태(적치·출하)를 서버 값 그대로, 10줄씩 받는다', async () => {
    app('/records?tab=bales');
    expect(screen.getByRole('tab', { name: '베일' })).toHaveAttribute('aria-selected', 'true');
    const table = await screen.findByRole('table', { name: '베일 기록' });
    expect(api.getRecords).toHaveBeenCalledWith('/bales/records', expect.objectContaining({ page: 1, pageSize: 10 }), expect.anything());
    const stacked = within(table).getByText(BALE_A).closest('tr') as HTMLElement;
    expect(within(stacked).getByText('#0407')).toBeInTheDocument();
    expect(within(stacked).getByText('28.3 MPa')).toBeInTheDocument();
    expect(within(stacked).getByText('11.8%')).toBeInTheDocument();
    expect(within(stacked).getByText('적치')).toBeInTheDocument();
    const shipped = within(table).getByText(BALE_B).closest('tr') as HTMLElement;
    expect(within(shipped).getByText('출하')).toBeInTheDocument();
  });

  it('탭을 바꾸면 주소의 tab이 바뀌고 그 목록을 받는다', async () => {
    app('/records');
    await screen.findByRole('table', { name: '차량 기록' });
    await userEvent.click(screen.getByRole('tab', { name: '배치' }));
    await screen.findByRole('table', { name: '배치 기록' });
    expect(where()).toBe('/records?tab=batches');
    await userEvent.click(screen.getByRole('tab', { name: '베일' }));
    await screen.findByRole('table', { name: '베일 기록' });
    expect(where()).toBe('/records?tab=bales');
  });
});

describe('기록 상세 팝업: 열기·닫기', () => {
  it('차량 줄을 누르면 페이지를 옮기지 않고 공정 기록 위에 차량 팝업이 뜬다 (폰 줄도 같다)', async () => {
    app('/records');
    const list = await screen.findByRole('list', { name: '차량 기록' });
    await userEvent.click(within(list).getByRole('button', { name: /12가 3456/ }));
    expect(where()).toBe('/records/vehicles/veh-20261015-034');
    expect(within(popup()).getByRole('heading', { name: '차량 기록' })).toBeInTheDocument();
    expect(await within(popup()).findByText('계중대 무게')).toBeInTheDocument();
    // 뒤의 공정 기록 화면은 그대로 (같은 탭, 다시 받지 않음)
    expect(screen.getByRole('heading', { name: '공정 기록', hidden: true })).toBeInTheDocument();
    expect(api.getRecords).toHaveBeenCalledTimes(1);
    await userEvent.click(within(popup()).getByRole('button', { name: '차량 기록 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe('/records');
    expect(api.getRecords).toHaveBeenCalledTimes(1);
  });

  it('배치 줄을 누르면 배치 팝업, 베일 줄을 누르면 베일 팝업', async () => {
    app('/records?tab=batches');
    const table = await screen.findByRole('table', { name: '배치 기록' });
    await userEvent.click(within(table).getByText('#0407'));
    expect(where()).toBe('/records/batches/batch-0407');
    expect(await within(popup()).findByText('만든 베일 2개')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: '베일' }));
    const bales = await screen.findByRole('table', { name: '베일 기록' });
    await userEvent.click(within(bales).getByText(BALE_A));
    expect(where()).toBe(`/records/bales/${BALE_A}`);
    expect(within(popup()).getByRole('heading', { name: '베일 상세' })).toBeInTheDocument();
    expect(await within(popup()).findByText('사용 압력')).toBeInTheDocument();
  });

  it('Esc·바깥 누르기·뒤로 버튼은 닫기 버튼처럼 팝업을 닫는다', async () => {
    app('/records?tab=batches');
    const table = await screen.findByRole('table', { name: '배치 기록' });
    const open = async () => {
      await userEvent.click(within(table).getByText('#0407'));
      await within(popup()).findByText('만든 베일 2개');
    };
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await open();
    tapOutside();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await open();
    await goBack();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe('/records?tab=batches');
  });

  it('홈의 "이 배치 상세"는 홈 위에 배치 팝업을 띄우고, 닫으면 홈으로 돌아온다', async () => {
    app('/');
    await userEvent.click(screen.getByRole('link', { name: '이 배치 상세' }));
    expect(where()).toBe('/records/batches/batch-0407');
    expect(screen.getByRole('heading', { name: '홈', hidden: true })).toBeInTheDocument();
    expect(await within(popup()).findByText('만든 베일 2개')).toBeInTheDocument();
    await userEvent.click(within(popup()).getByRole('button', { name: '배치 상세 닫기' }));
    expect(where()).toBe('/');
    expect(screen.getByRole('heading', { name: '홈' })).toBeInTheDocument();
  });

  it('열린 동안 ui.recordPopupOpen이 켜져 3D 그리기를 멈춘다', async () => {
    const { store } = app('/');
    await userEvent.click(screen.getByRole('link', { name: '이 배치 상세' }));
    expect(store.getState().ui.recordPopupOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(store.getState().ui.recordPopupOpen).toBe(false);
  });
});

/** 베일 A → 배치 X → 베일 B → 배치 Y */
async function openSequence(strict = false) {
  app('/records?tab=bales', { strict });
  const table = await screen.findByRole('table', { name: '베일 기록' });
  await userEvent.click(within(table).getByText(BALE_A));
  await userEvent.click(await within(popup()).findByRole('button', { name: `배치 ${BATCH_X} 보기` }));
  expect(within(popup()).getByRole('heading', { name: '배치 상세' })).toBeInTheDocument();
  await userEvent.click(await within(popup()).findByRole('button', { name: `베일 ${BALE_B} 보기` }));
  expect(within(popup()).getByRole('heading', { name: '베일 상세' })).toBeInTheDocument();
  await userEvent.click(await within(popup()).findByRole('button', { name: `배치 ${BATCH_Y} 보기` }));
  expect(await within(popup()).findByText(BATCH_Y)).toBeInTheDocument();
  expect(where()).toBe(`/records/batches/${BATCH_Y}`);
}

describe('기록 상세 팝업: 이어 열기 (기억은 지금 것과 바로 전 것 둘)', () => {
  it('보이는 팝업은 늘 하나뿐이다', async () => {
    await openSequence();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('닫기: 배치 Y → 베일 B가 다시 보이고 → 한 번 더 닫으면 모두 닫힌다 (베일 A·배치 X는 잊었다)', async () => {
    await openSequence();
    expect(within(popup()).getByText('닫으면 이전 팝업(베일 #0411)이 다시 보입니다')).toBeInTheDocument();
    await userEvent.click(within(popup()).getByRole('button', { name: '배치 상세 닫기' }));
    expect(where()).toBe(`/records/bales/${BALE_B}`);
    expect(within(popup()).getByRole('heading', { name: '베일 상세' })).toBeInTheDocument();
    expect(await within(popup()).findByText(BALE_B)).toBeInTheDocument();
    expect(within(popup()).queryByText(/닫으면 이전 팝업/)).not.toBeInTheDocument();
    await userEvent.click(within(popup()).getByRole('button', { name: '베일 상세 닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe('/records?tab=bales');
  });

  it('바깥 누르기는 한 번에 팝업 하나만 닫는다', async () => {
    await openSequence();
    tapOutside();
    expect(within(popup()).getByRole('heading', { name: '베일 상세' })).toBeInTheDocument();
    tapOutside();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Esc도 하나씩 닫는다', async () => {
    await openSequence();
    await userEvent.keyboard('{Escape}');
    expect(await within(popup()).findByText(BALE_B)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('뒤로 버튼(브라우저·안드로이드)도 하나씩 닫는다', async () => {
    await openSequence();
    await goBack();
    await waitFor(() => expect(where()).toBe(`/records/bales/${BALE_B}`));
    expect(within(popup()).getByRole('heading', { name: '베일 상세' })).toBeInTheDocument();
    await goBack();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(where()).toBe('/records?tab=bales');
  });
});

describe('개발 모드(StrictMode)에서 효과가 두 번 돌아도 기록을 두 번 쌓지 않는다', () => {
  it('뒤로 가기로 되살린 바로 전 팝업은 한 번 닫으면 닫힌다', async () => {
    await openSequence(true);
    await goBack();
    await waitFor(() => expect(where()).toBe(`/records/bales/${BALE_B}`));
    await userEvent.click(within(popup()).getByRole('button', { name: '베일 상세 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(where()).toBe('/records?tab=bales');
  });

  it('바로 연 상세 주소는 한 번 닫으면 공정 기록, 한 번 더 뒤로 가도 팝업이 다시 뜨지 않는다', async () => {
    app('/records/batches/batch-0407', { strict: true });
    await within(popup()).findByText('만든 베일 2개');
    await goBack();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await goBack();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe('/records?tab=batches');
  });
});

describe('기록 상세 팝업: 깊은 링크', () => {
  it.each([
    ['vehicles', 'veh-20261015-034', '차량 기록', '차량'],
    ['batches', 'batch-0407', '배치 상세', '배치'],
    ['bales', BALE_A, '베일 상세', '베일'],
  ])('/records/%s/{id}를 바로 열면 공정 기록(그 탭) 위에 팝업이 뜨고, 닫으면 공정 기록', async (segment, id, title, tab) => {
    app(`/records/${segment}/${id}`);
    expect(within(popup()).getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: tab, hidden: true })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(where()).toBe(`/records/${segment}/${id}`));
    await userEvent.click(within(popup()).getByRole('button', { name: `${title} 닫기` }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe(`/records?tab=${segment}`);
  });

  it('바로 연 팝업도 뒤로 버튼으로 닫으면 공정 기록이 남는다', async () => {
    app('/records/batches/batch-0407');
    await within(popup()).findByText('만든 베일 2개');
    await goBack();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(where()).toBe('/records?tab=batches');
  });

  it('로그인 전에는 팝업을 띄우지 않는다 (로그인 화면이 주소를 기억했다가 돌아온다)', () => {
    app('/records/batches/batch-0407', { me: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(where()).toBe('/records/batches/batch-0407');
  });
});

describe('기록 상세 팝업: 초점 (접근성)', () => {
  it('열리면 팝업 안(닫기 버튼)으로 초점이 가고, Tab은 팝업 밖으로 나가지 않으며, 닫으면 누른 줄로 돌아온다', async () => {
    app('/records?tab=batches');
    const list = await screen.findByRole('list', { name: '배치 기록' });
    const row = within(list).getAllByRole('button')[0] as HTMLElement;
    await userEvent.click(row);
    await within(popup()).findByText('만든 베일 2개');
    expect(within(popup()).getByRole('button', { name: '배치 상세 닫기' })).toHaveFocus();
    const count = within(popup()).getAllByRole('button').length + within(popup()).getAllByRole('link').length;
    for (let i = 0; i < count + 2; i += 1) {
      await userEvent.tab();
      expect(popup()).toContainElement(document.activeElement as HTMLElement);
    }
    await userEvent.tab({ shift: true });
    expect(popup()).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it('이어 연 팝업을 모두 닫아도 처음 누른 줄로 돌아온다', async () => {
    app('/records?tab=bales');
    const list = await screen.findByRole('list', { name: '베일 기록' });
    const row = within(list).getAllByRole('button')[0] as HTMLElement;
    await userEvent.click(row);
    await userEvent.click(await within(popup()).findByRole('button', { name: `배치 ${BATCH_X} 보기` }));
    expect(within(popup()).getByRole('button', { name: '배치 상세 닫기' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(within(popup()).getByRole('button', { name: '베일 상세 닫기' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(row).toHaveFocus();
  });
});

describe('차량 기록 상세', () => {
  it('번호판·회사·섹터 링크, 총중량·공차·순중량, 단계별 시각을 적는다', async () => {
    app('/records/vehicles/veh-20261015-034');
    expect(await within(popup()).findByText('12가 3456')).toBeInTheDocument();
    expect(api.getVehicleRecord).toHaveBeenCalledWith('veh-20261015-034', expect.anything());
    const weights = within(popup()).getByRole('region', { name: '계중대 무게' });
    expect(within(weights).getByText('18.42 t')).toBeInTheDocument();
    expect(within(weights).getByText('9.86 t')).toBeInTheDocument();
    expect(within(weights).getByText('8.56 t')).toBeInTheDocument();
    expect(within(popup()).getByRole('link', { name: '섹터 A1' })).toHaveAttribute('href', '/tanks/tank-a1');
    const stages = within(popup()).getByRole('region', { name: '단계별 시각' });
    expect(within(stages).getByText('번호판 인식')).toBeInTheDocument();
    expect(within(stages).getByText('출차')).toBeInTheDocument();
  });

  it('출차 전에는 공차·순중량이 "–"이고 안내를 보인다', async () => {
    vi.mocked(api.getVehicleRecord).mockResolvedValue(UNLOADING);
    app('/records/vehicles/veh-20261015-035');
    expect(await within(popup()).findByText('87나 1203')).toBeInTheDocument();
    expect(within(popup()).getByText('공차와 순중량은 출차 계량 뒤에 확정됩니다.')).toBeInTheDocument();
    expect(within(popup()).getByText('아직 출차하지 않았습니다')).toBeInTheDocument();
  });

  it('없는 차량(404)이면 찾을 수 없다고 알리고, 그 밖의 실패는 다시 시도할 수 있다', async () => {
    vi.mocked(api.getVehicleRecord).mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', ''));
    const { unmount } = app('/records/vehicles/nope');
    expect(await screen.findByText(/차량 기록을 찾을 수 없습니다/)).toBeInTheDocument();
    unmount();

    vi.mocked(api.getVehicleRecord).mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', ''));
    app('/records/vehicles/veh-20261015-034');
    await userEvent.click(await screen.findByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(within(popup()).getByText('12가 3456')).toBeInTheDocument());
  });
});

describe('배치·베일 상세', () => {
  it('배치 팝업: 스냅샷과 만든 베일 목록, 베일마다 "베일 보기"', async () => {
    app('/records/batches/batch-0407');
    expect(await within(popup()).findByText('만든 베일 2개')).toBeInTheDocument();
    expect(within(popup()).getByText('A1 40% · B2 60%')).toBeInTheDocument();
    expect(within(popup()).getByRole('button', { name: `베일 ${BALE_A} 보기` })).toBeInTheDocument();
    expect(within(popup()).getByRole('button', { name: `베일 ${BALE_B} 보기` })).toBeInTheDocument();
  });

  it('베일 팝업: 생산 당시 압력·수분·배합, 상태, "배치 보기"', async () => {
    app(`/records/bales/${BALE_B}`);
    expect(await within(popup()).findByText(BALE_B)).toBeInTheDocument();
    expect(within(popup()).getByText('적치')).toBeInTheDocument();
    expect(within(popup()).getByText('아직 출하하지 않았습니다')).toBeInTheDocument();
    expect(within(popup()).getByText('28.3 MPa')).toBeInTheDocument();
    expect(within(popup()).getByRole('button', { name: `배치 ${BATCH_Y} 보기` })).toBeInTheDocument();
  });
});
