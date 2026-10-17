import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { matchesSearch, sectorSearchTerms } from '@ecocycle/shared';
import type { RecordPage, RecordQuery } from '@ecocycle/shared';
import { renderWithStore } from '../../test/utils';
import { RecordList } from './RecordList';

// 현지 시각 2026-10-15 14:30 (테스트 환경의 시간대가 무엇이든 현지 날짜 기준으로 계산한다)
const NOW = new Date(2026, 9, 15, 14, 30);
const now = () => NOW;

interface Row {
  id: string;
  ts: string;
  plate: string;
  note: string;
}

const TODAY = new Date(2026, 9, 15, 9, 0).toISOString();
const YESTERDAY = new Date(2026, 9, 14, 9, 0).toISOString();
const row = (id: string, ts: string, plate: string): Row => ({ id, ts, plate, note: '섹터 A1' });

/** 서버처럼 기간 [from, to)와 검색어 q를 함께 적용해 나눠 주는 가짜 load (공유 검색 규칙을 그대로 쓴다) */
function searchLoad(all: Row[]) {
  return vi.fn(async (q: RecordQuery): Promise<RecordPage<Row>> => {
    const found = all.filter((r) => r.ts >= q.from && r.ts < q.to).filter((r) => matchesSearch(q.q, [r.plate, r.note]));
    const start = (q.page - 1) * q.pageSize;
    return { items: found.slice(start, start + q.pageSize), total: found.length, page: q.page, pageSize: q.pageSize };
  });
}

function searchList(load: ReturnType<typeof searchLoad>, searchPlaceholder: string | undefined = '번호판, 회사 검색') {
  return renderWithStore(
    <RecordList<Row>
      label="차량 기록"
      load={load}
      rowKey={(r) => r.id}
      time={(r) => r.ts}
      title={(r) => r.plate}
      detail={(r) => r.note}
      columns={[{ key: 'plate', header: '번호판', cell: (r) => r.plate }]}
      {...(searchPlaceholder ? { searchPlaceholder } : {})}
      now={now}
    />,
  );
}

const lastQuery = (load: ReturnType<typeof searchLoad>) => load.mock.calls.at(-1)![0];

const many = Array.from({ length: 25 }, (_, i) => row(`m${i}`, new Date(NOW.getTime() - i * 60_000).toISOString(), `12가 ${1000 + i}`));

describe('검색 규칙 (서버와 같은 규칙)', () => {
  it('공백·대소문자를 무시한 부분 일치', () => {
    expect(matchesSearch('12가3456', ['12가 3456'])).toBe(true);
    expect(matchesSearch('12가 3456', ['12가3456'])).toBe(true);
    expect(matchesSearch(' 가 34 ', ['12가 3456'])).toBe(true);
    expect(matchesSearch('TANK-A1', ['tank-a1'])).toBe(true);
    expect(matchesSearch('12가3457', ['12가 3456'])).toBe(false);
    expect(matchesSearch('', ['아무거나'])).toBe(true);
    expect(matchesSearch(undefined, [null])).toBe(true);
    expect(matchesSearch('a', [null, undefined])).toBe(false);
  });

  it('섹터는 코드·짧은 이름·화면 이름으로 모두 찾아진다', () => {
    for (const q of ['tank-a1', 'a1', '섹터 A1', '섹터a1']) expect(matchesSearch(q, sectorSearchTerms('tank-a1')), q).toBe(true);
    expect(matchesSearch('a2', sectorSearchTerms('tank-a1'))).toBe(false);
  });
});

describe('RecordList 검색', () => {
  const data = [row('t1', TODAY, '12가 3456'), row('t2', TODAY, '34나 7890'), row('y1', YESTERDAY, '12가 9999'), row('y2', YESTERDAY, '56다 1111')];

  it('검색 상자는 안내 글을 보여 주고, searchPlaceholder가 없으면 그리지 않는다', async () => {
    const { unmount } = searchList(searchLoad(data));
    expect(await screen.findByRole('searchbox', { name: '차량 기록 검색' })).toHaveAttribute('placeholder', '번호판, 회사 검색');
    expect(screen.queryByRole('button', { name: '검색어 지우기' })).not.toBeInTheDocument();
    unmount();
    searchList(searchLoad(data), '');
    await screen.findByText('총 2건');
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('기간과 검색어를 함께 적용한다: 오늘+검색어 → 어제로 바꿔도 검색어는 유지', async () => {
    const user = userEvent.setup();
    const load = searchLoad(data);
    searchList(load);
    await screen.findByText('총 2건'); // 오늘 2건
    await user.type(screen.getByRole('searchbox'), '12가');
    await screen.findByText('총 1건');
    expect(lastQuery(load)).toMatchObject({ q: '12가', from: new Date(2026, 9, 15).toISOString() });
    expect(screen.getByRole('table')).toHaveTextContent('12가 3456');
    expect(screen.getByRole('table')).not.toHaveTextContent('12가 9999');

    await user.click(screen.getByRole('button', { name: '어제' }));
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ q: '12가', from: new Date(2026, 9, 14).toISOString(), to: new Date(2026, 9, 15).toISOString() }));
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('12가 9999'));
    expect(screen.getByRole('table')).not.toHaveTextContent('12가 3456'); // 오늘 것은 기간 밖
    expect(screen.getByText('총 1건')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('12가');
  });

  it('번호판 사이 공백을 무시한다: "12가3456"이 "12가 3456"을 찾는다', async () => {
    const user = userEvent.setup();
    searchList(searchLoad(data));
    await screen.findByText('총 2건');
    await user.type(screen.getByRole('searchbox'), '12가3456');
    await screen.findByText('총 1건');
    expect(screen.getByRole('table')).toHaveTextContent('12가 3456');
  });

  it('입력을 300ms 기다렸다가 한 번만 보낸다', async () => {
    const user = userEvent.setup();
    const load = searchLoad(data);
    searchList(load);
    await screen.findByText('총 2건');
    const before = load.mock.calls.length;
    await user.type(screen.getByRole('searchbox'), '34나');
    expect(load.mock.calls.length).toBe(before); // 입력 직후에는 아직 보내지 않는다
    await waitFor(() => expect(load.mock.calls.length).toBe(before + 1), { timeout: 1500 });
    expect(load.mock.calls.slice(before).map(([q]) => q.q)).toEqual(['34나']); // 글자마다 보내지 않았다
  });

  it('공백만 입력하면 거르지 않는다 (다시 받지도 않는다)', async () => {
    const user = userEvent.setup();
    const load = searchLoad(data);
    searchList(load);
    await screen.findByText('총 2건');
    const before = load.mock.calls.length;
    await user.type(screen.getByRole('searchbox'), '   ');
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(load.mock.calls.length).toBe(before);
  });

  it('X 버튼은 입력을 비우고 기다리지 않고 바로 전체를 다시 받는다', async () => {
    const user = userEvent.setup();
    const load = searchLoad(data);
    searchList(load);
    await screen.findByText('총 2건');
    await user.type(screen.getByRole('searchbox'), '56다');
    await screen.findByText('검색 결과가 없습니다'); // 오늘에는 56다가 없다
    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    await screen.findByText('총 2건');
    expect(lastQuery(load)).not.toHaveProperty('q');
    expect(screen.queryByRole('button', { name: '검색어 지우기' })).not.toBeInTheDocument();
  });

  it('Enter는 기다리지 않고 바로 검색한다', async () => {
    const user = userEvent.setup();
    const load = searchLoad(data);
    searchList(load);
    await screen.findByText('총 2건');
    await user.type(screen.getByRole('searchbox'), '7890{Enter}');
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ q: '7890' }));
    await screen.findByText('총 1건');
  });

  it('새 검색어가 확정되면 1쪽부터 다시 받는다 (쪽 3인 채로 새 검색어를 보내지 않는다)', async () => {
    const user = userEvent.setup();
    const load = searchLoad(many);
    searchList(load);
    const pager = await screen.findByRole('navigation', { name: '쪽 이동' });
    await user.click(within(pager).getByRole('button', { name: '3쪽' }));
    await waitFor(() => expect(lastQuery(load).page).toBe(3));

    await user.type(screen.getByRole('searchbox'), '12가');
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ q: '12가', page: 1 }));
    expect(load.mock.calls.filter(([q]) => q.q === '12가').every(([q]) => q.page === 1)).toBe(true);
    expect(within(await screen.findByRole('navigation', { name: '쪽 이동' })).getByRole('button', { name: '1쪽' })).toHaveAttribute('aria-current', 'page');
  });

  it('기간을 바꿔도 1쪽부터 다시 받는다 (검색어는 유지)', async () => {
    const user = userEvent.setup();
    const load = searchLoad(many);
    searchList(load);
    await user.type(screen.getByRole('searchbox'), '12가{Enter}');
    const pager = await screen.findByRole('navigation', { name: '쪽 이동' });
    await user.click(within(pager).getByRole('button', { name: '2쪽' }));
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ q: '12가', page: 2 }));
    await user.click(screen.getByRole('button', { name: '최근 7일' }));
    await waitFor(() => expect(lastQuery(load)).toMatchObject({ q: '12가', page: 1 }));
  });

  it('결과가 없으면 "검색 결과가 없습니다"와 기간·검색어를 보여 준다', async () => {
    const user = userEvent.setup();
    searchList(searchLoad(data));
    await screen.findByText('총 2건');
    await user.click(screen.getByRole('button', { name: '어제' }));
    await user.type(screen.getByRole('searchbox'), '없는번호{Enter}');
    expect(await screen.findByText('검색 결과가 없습니다')).toBeInTheDocument();
    const empty = screen.getByText('검색 결과가 없습니다').parentElement!;
    expect(empty).toHaveTextContent('기간 어제');
    expect(empty).toHaveTextContent('검색어 “없는번호”');
    expect(screen.queryByRole('navigation', { name: '쪽 이동' })).not.toBeInTheDocument();
    expect(screen.queryByText('이 기간에 기록이 없습니다')).not.toBeInTheDocument();
  });

  it('검색어가 없을 때 빈 기간은 예전 문구 그대로', async () => {
    const user = userEvent.setup();
    searchList(searchLoad([row('y1', YESTERDAY, '12가 9999')]));
    await user.click(await screen.findByRole('button', { name: '어제' }));
    await screen.findByText('총 1건');
    await user.click(screen.getByRole('button', { name: '오늘' }));
    expect(await screen.findByText('이 기간에 기록이 없습니다')).toBeInTheDocument();
    expect(screen.queryByText('검색 결과가 없습니다')).not.toBeInTheDocument();
  });
});
