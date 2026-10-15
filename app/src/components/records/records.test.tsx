import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RecordPage, RecordQuery } from '@ecocycle/shared';
import { renderWithStore } from '../../test/utils';
import { RecordList } from './RecordList';
import { customRange, pageWindow, presetRange, toDateInput } from './range';

// 현지 시각 2026-10-15 14:30 (테스트 환경의 시간대가 무엇이든 현지 날짜 기준으로 계산한다)
const NOW = new Date(2026, 9, 15, 14, 30);
const now = () => NOW;

interface Row {
  id: string;
  ts: string;
  plate: string;
  note: string;
}

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i + 1}`,
    ts: new Date(NOW.getTime() - i * 60_000).toISOString(),
    plate: `12가 ${String(1000 + i)}`,
    note: `섹터 A1 · 순중량 ${(8 + i / 10).toFixed(1)} t`,
  }));
}

/** 서버처럼 나눠 주는 가짜 load */
function fakeLoad(all: Row[]) {
  return vi.fn(async (q: RecordQuery): Promise<RecordPage<Row>> => {
    const start = (q.page - 1) * q.pageSize;
    return { items: all.slice(start, start + q.pageSize), total: all.length, page: q.page, pageSize: q.pageSize };
  });
}

function list(load: ReturnType<typeof fakeLoad>, options: Parameters<typeof renderWithStore>[1] = {}) {
  return renderWithStore(
    <RecordList<Row>
      label="하역 기록"
      load={load}
      rowKey={(r) => r.id}
      time={(r) => r.ts}
      title={(r) => r.plate}
      detail={(r) => r.note}
      columns={[
        { key: 'plate', header: '번호판', cell: (r) => r.plate },
        { key: 'note', header: '내용', cell: (r) => r.note },
      ]}
      now={now}
    />,
    options,
  );
}

const lastQuery = (load: ReturnType<typeof fakeLoad>) => load.mock.calls.at(-1)![0];

describe('기록 기간 계산', () => {
  it('오늘은 현지 0시~지금, 어제는 어제 0시~오늘 0시, 최근 7일은 지금-7일~지금', () => {
    expect(presetRange('today', NOW)).toEqual({ from: new Date(2026, 9, 15), to: NOW });
    expect(presetRange('yesterday', NOW)).toEqual({ from: new Date(2026, 9, 14), to: new Date(2026, 9, 15) });
    expect(presetRange('last7d', NOW).from).toEqual(new Date(NOW.getTime() - 7 * 86_400_000));
  });

  it('직접 선택은 끝날 하루를 포함하고, 순서가 틀리거나 너무 길면 이유를 알려 준다', () => {
    expect(customRange('2026-10-01', '2026-10-03')).toEqual({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 4) });
    expect(customRange('2026-10-05', '2026-10-03')).toEqual({ error: '시작일이 종료일보다 늦습니다.' });
    expect(customRange('', '2026-10-03')).toEqual({ error: '시작일과 종료일을 모두 고르세요.' });
    expect(customRange('2026-01-01', '2026-10-03')).toHaveProperty('error');
    expect(toDateInput(NOW)).toBe('2026-10-15');
  });

  it('쪽 번호는 지금 쪽을 가운데에 두고 최대 5개', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(1, 12)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(6, 12)).toEqual([4, 5, 6, 7, 8]);
    expect(pageWindow(12, 12)).toEqual([8, 9, 10, 11, 12]);
    expect(pageWindow(1, 0)).toEqual([]);
  });
});

describe('RecordList', () => {
  it('처음에는 오늘의 첫 쪽을 10줄로 요청하고 UTC ISO 시각을 보낸다', async () => {
    const load = fakeLoad(rows(23));
    list(load);
    await screen.findByText('총 23건');
    expect(lastQuery(load)).toEqual({ from: new Date(2026, 9, 15).toISOString(), to: NOW.toISOString(), page: 1, pageSize: 10 });
    // 폰 줄과 표 모두 10줄 (화면 폭에 따라 하나만 보인다)
    expect(within(screen.getByRole('list', { name: '하역 기록' })).getAllByRole('listitem')).toHaveLength(10);
    expect(within(screen.getByRole('table', { name: '하역 기록' })).getAllByRole('row')).toHaveLength(11);
    expect(screen.getByRole('columnheader', { name: '시각' })).toBeInTheDocument();
  });

  it('폰은 쌓인 줄(제목 · 시각 / 설명 한 줄), 태블릿·데스크톱은 표로 보인다', async () => {
    list(fakeLoad(rows(3)));
    const ul = await screen.findByRole('list', { name: '하역 기록' });
    expect(ul).toHaveClass('md:hidden');
    expect(screen.getByRole('table', { name: '하역 기록' }).parentElement).toHaveClass('hidden', 'md:block');
    const first = within(ul).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent('12가 1000');
    expect(first).toHaveTextContent('섹터 A1 · 순중량 8.0 t');
    expect(within(first).getByText('섹터 A1 · 순중량 8.0 t')).toHaveClass('truncate');
    expect(first.querySelector('time')).toHaveAttribute('dateTime', NOW.toISOString());
  });

  it('쪽 넘기기: 이전 · 쪽 번호 · 다음, 지금 쪽 표시', async () => {
    const user = userEvent.setup();
    const load = fakeLoad(rows(23));
    list(load);
    const pager = await screen.findByRole('navigation', { name: '쪽 이동' });
    expect(within(pager).getByRole('button', { name: '이전' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: '1쪽' })).toHaveAttribute('aria-current', 'page');
    expect(within(pager).getAllByRole('button', { name: /쪽$/ })).toHaveLength(3);

    await user.click(within(pager).getByRole('button', { name: '다음' }));
    await waitFor(() => expect(lastQuery(load).page).toBe(2));
    await user.click(within(pager).getByRole('button', { name: '3쪽' }));
    await waitFor(() => expect(within(pager).getByRole('button', { name: '3쪽' })).toHaveAttribute('aria-current', 'page'));
    expect(within(screen.getByRole('list', { name: '하역 기록' })).getAllByRole('listitem')).toHaveLength(3);
    expect(within(pager).getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it('기간을 바꾸면 그 기간의 첫 쪽을 다시 요청한다', async () => {
    const user = userEvent.setup();
    const load = fakeLoad(rows(23));
    list(load);
    const pager = await screen.findByRole('navigation', { name: '쪽 이동' });
    await user.click(within(pager).getByRole('button', { name: '2쪽' }));
    await waitFor(() => expect(lastQuery(load).page).toBe(2));

    await user.click(screen.getByRole('button', { name: '어제' }));
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ from: new Date(2026, 9, 14).toISOString(), to: new Date(2026, 9, 15).toISOString(), page: 1 }));
    expect(screen.getByRole('button', { name: '어제' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: '최근 7일' }));
    await waitFor(() => expect(lastQuery(load).from).toBe(new Date(NOW.getTime() - 7 * 86_400_000).toISOString()));
  });

  it('직접 선택: 날짜를 고르고 적용하면 그 기간(끝날 포함)을 요청하고, 틀린 기간은 알린다', async () => {
    const user = userEvent.setup();
    const load = fakeLoad(rows(5));
    list(load);
    await screen.findByText('총 5건');
    const calls = load.mock.calls.length;
    await user.click(screen.getByRole('button', { name: '직접 선택' }));
    expect(load.mock.calls.length).toBe(calls); // 고르기만 해서는 요청하지 않는다
    const form = screen.getByRole('form', { name: '기간 직접 선택' });
    const from = within(form).getByLabelText('시작일');
    const to = within(form).getByLabelText('종료일');
    await user.clear(from);
    await user.type(from, '2026-10-10');
    await user.clear(to);
    await user.type(to, '2026-10-08');
    await user.click(within(form).getByRole('button', { name: '적용' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('시작일이 종료일보다 늦습니다.');
    expect(load.mock.calls.length).toBe(calls);

    await user.clear(to);
    await user.type(to, '2026-10-12');
    await user.click(within(form).getByRole('button', { name: '적용' }));
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ from: new Date(2026, 9, 10).toISOString(), to: new Date(2026, 9, 13).toISOString(), page: 1 }));
  });

  it('기록이 없으면 "이 기간에 기록이 없습니다"를 보이고 쪽 넘기기는 없다', async () => {
    list(fakeLoad([]));
    expect(await screen.findByText('이 기간에 기록이 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '쪽 이동' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('불러오지 못하면 오류와 다시 시도 버튼을 보인다', async () => {
    const user = userEvent.setup();
    const load = fakeLoad(rows(2));
    load.mockRejectedValueOnce(new Error('network'));
    list(load);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('기록을 불러오지 못했습니다.');
    await user.click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('총 2건')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('연결이 끊기면 끊김과 마지막 수신 시각을 알리고, 다시 연결되면 같은 쪽을 새로 받는다', async () => {
    const load = fakeLoad(rows(4));
    const { store } = list(load, { connection: 'offline', lastReceivedAt: '2026-10-15T05:20:00.000Z' });
    await screen.findByText('총 4건');
    expect(screen.getByRole('status')).toHaveTextContent(/연결 끊김 · 마지막 수신/);
    const calls = load.mock.calls.length;
    act(() => {
      store.dispatch({ type: 'connection/connectionChanged', payload: { status: 'online', lastReceivedAt: '2026-10-15T05:30:00.000Z' } });
    });
    await waitFor(() => expect(load.mock.calls.length).toBe(calls + 1));
    expect(screen.queryByText(/연결 끊김/)).not.toBeInTheDocument();
  });

  it('기간 버튼·쪽 버튼은 48px 이상이다', async () => {
    list(fakeLoad(rows(23)));
    await screen.findByText('총 23건');
    for (const button of within(screen.getByRole('group', { name: '기간' })).getAllByRole('button')) expect(button).toHaveClass('min-h-12');
    for (const button of within(screen.getByRole('navigation', { name: '쪽 이동' })).getAllByRole('button')) expect(button).toHaveClass('min-h-12');
  });
});
