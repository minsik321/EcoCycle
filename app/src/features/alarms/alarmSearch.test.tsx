import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_SEARCH_NAMES, matchesSearch } from '@ecocycle/shared';
import type { Alarm } from '@ecocycle/shared';
import * as api from '../../api';
import { renderWithStore } from '../../test/utils';
import { AlarmsPage } from './AlarmsPage';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getAlarms: vi.fn(),
  sendCommand: vi.fn(),
}));

const DAY = 86_400_000;
// 하루 중 언제 돌려도 같도록 현지 오늘 0시 기준으로 둔다: 오늘 = 0시~지금의 한가운데, 어제 = 어제 정오
const midnight = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
const at = (daysAgo: number) => new Date(daysAgo === 0 ? midnight + (Date.now() - midnight) / 2 : midnight - (daysAgo - 0.5) * DAY).toISOString();
const alarm = (id: string, deviceId: Alarm['deviceId'], message: string, daysAgo: number): Alarm => ({ id, level: 'caution', deviceId, message, state: 'cleared', ts: at(daysAgo) });

const ALL = [
  alarm('a-1', 'tank-a1', '수분 높음', 0),
  alarm('a-2', 'compressor-1', '온도 상승', 0),
  alarm('a-3', 'tank-b2', '적재율 80% 초과', 1),
  alarm('a-4', 'compressor-1', '압력 낮음', 3),
];

/** 서버처럼 기간 [from, to)와 검색어를 함께 적용하는 가짜 GET /alarms */
function fakeServer() {
  vi.mocked(api.getAlarms).mockImplementation(async (query = {}) =>
    ALL.filter((a) => (!query.from || a.ts >= query.from) && (!query.to || a.ts < query.to)).filter((a) => matchesSearch(query.q, [DEVICE_SEARCH_NAMES[a.deviceId], a.deviceId, a.message])),
  );
}

const lastQuery = () => vi.mocked(api.getAlarms).mock.calls.at(-1)![0]!;

function open() {
  renderWithStore(
    <Routes>
      <Route path="/alarms" element={<AlarmsPage />} />
    </Routes>,
    { route: '/alarms' },
  );
}

async function openHistory() {
  open();
  await userEvent.click(screen.getByRole('button', { name: '알람 이력' }));
  await screen.findByText('총 4건');
}

beforeEach(() => {
  vi.mocked(api.getAlarms).mockReset();
  vi.mocked(api.sendCommand).mockReset();
  fakeServer();
});

describe('AlarmsPage: 기간 + 검색', () => {
  it('이력 탭에만 기간 탭과 검색 상자가 있고, 처음은 최근 7일이다', async () => {
    open();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '알람 이력' }));
    await screen.findByText('총 4건');
    const periods = within(screen.getByRole('group', { name: '기간' })).getAllByRole('button');
    expect(periods.map((b) => b.textContent)).toEqual(['오늘', '어제', '최근 7일', '직접 선택']);
    expect(screen.getByRole('button', { name: '최근 7일' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('searchbox', { name: '알람 검색' })).toHaveAttribute('placeholder', '기기 이름, 알람 내용 검색');
    expect(lastQuery().q).toBeUndefined();
  });

  it('기기 이름과 알람 메시지로 서버에 검색하고, 기간을 바꿔도 검색어가 유지된다 (기간 AND 검색어)', async () => {
    const user = userEvent.setup();
    await openHistory();
    await user.type(screen.getByRole('searchbox'), '압축기{Enter}');
    await screen.findByText('총 2건');
    expect(lastQuery().q).toBe('압축기');
    const list = within(screen.getByLabelText('알람 이력'));
    expect(list.getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '오늘' }));
    await screen.findByText('총 1건'); // 오늘의 압축기 알람은 하나
    expect(lastQuery().q).toBe('압축기');
    expect(within(screen.getByLabelText('알람 이력')).getByRole('listitem')).toHaveTextContent('온도 상승');
    expect(screen.getByRole('searchbox')).toHaveValue('압축기');

    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), '적재율 80{Enter}'); // 공백이 끼어도 찾는다
    expect(await screen.findByText('검색 결과가 없습니다')).toBeInTheDocument(); // 적재율 알람은 오늘이 아니라 어제
    const empty = screen.getByText('검색 결과가 없습니다').parentElement!;
    expect(empty).toHaveTextContent('기간 오늘');
    expect(empty).toHaveTextContent('검색어 “적재율 80”');
  });

  it('오늘·최근 7일은 끝(to)을 보내지 않고, 어제는 [어제 0시, 오늘 0시)를 보낸다', async () => {
    const user = userEvent.setup();
    await openHistory();
    expect(lastQuery()).not.toHaveProperty('to');
    await user.click(screen.getByRole('button', { name: '어제' }));
    await waitFor(() => expect(lastQuery()).toHaveProperty('to'));
    const today = new Date();
    expect(new Date(lastQuery().to!).getTime()).toBe(new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime());
    expect(new Date(lastQuery().from!).getTime()).toBe(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime());
  });

  it('X 버튼으로 검색어를 지우면 전체가 다시 나온다', async () => {
    const user = userEvent.setup();
    await openHistory();
    await user.type(screen.getByRole('searchbox'), '수분{Enter}');
    await screen.findByText('총 1건');
    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    await screen.findByText('총 4건');
    expect(lastQuery().q).toBeUndefined();
  });

  it('검색어 없이 빈 기간이면 "이 기간에 알람이 없습니다"', async () => {
    const user = userEvent.setup();
    await openHistory();
    vi.mocked(api.getAlarms).mockResolvedValue([]);
    await user.click(screen.getByRole('button', { name: '어제' }));
    expect(await screen.findByText('이 기간에 알람이 없습니다')).toBeInTheDocument();
  });
});
