import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import type { Alarm, HistoryResponse } from '@ecocycle/shared';
import * as api from '../../api';
import type { HistoryQuery } from '../../api';
import { HISTORY_METRICS, HISTORY_UNITS } from '../../config/display';
import { alarmReceived, createAppStore } from '../../store';
import { renderWithStore } from '../../test/utils';
import { DeviceAlarmHistory } from './DeviceAlarmHistory';
import { HistoryPanel } from './HistoryPanel';
import { anchorFor } from './historyWindow';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getAlarms: vi.fn(),
}));

const NOW = Date.parse('2026-10-13T05:23:11.250Z');
const now = () => NOW;
const DAY = HISTORY_UNITS.day.spanMs;
const ANCHOR = anchorFor(NOW, '10m');

function makeFetcher(points: number[] = [10, 20, 30]) {
  return vi.fn(async (q: HistoryQuery, _signal?: AbortSignal): Promise<HistoryResponse> => ({
    deviceId: q.deviceId,
    metric: q.metric,
    interval: q.interval,
    from: q.from,
    to: q.to,
    points: points.map((value, i) => ({ ts: new Date(Date.parse(q.from) + i * 600_000).toISOString(), value })),
  }));
}

const panel = (fetcher: ReturnType<typeof makeFetcher>, metrics = HISTORY_METRICS.tank) =>
  render(<HistoryPanel deviceId="tank-a1" metrics={metrics} now={now} fetcher={fetcher} />);

const calls = (f: ReturnType<typeof makeFetcher>) => f.mock.calls.map((c) => c[0]);

describe('HistoryPanel: 구간', () => {
  it('처음에는 최근 하루(10분 간격)를 요청하고 구간을 표시하며 다음 ▶은 비활성이다', async () => {
    const fetcher = makeFetcher();
    panel(fetcher);
    await screen.findByRole('img');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(calls(fetcher)[0]).toEqual({
      deviceId: 'tank-a1',
      metric: 'level',
      from: new Date(ANCHOR - DAY).toISOString(),
      to: new Date(NOW).toISOString(),
      interval: '10m',
    });
    expect(screen.getByLabelText('다음 구간')).toBeDisabled();
    expect(screen.getByText(/^\d{1,2}\/\d{1,2} \d{2}:\d{2} ~ \d{1,2}\/\d{1,2} \d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('단위를 바꾸면 그 단위의 최근 구간을 다시 요청한다 (주: 1시간 간격, 월: 6시간 간격)', async () => {
    const fetcher = makeFetcher();
    panel(fetcher);
    await screen.findByRole('img');

    await userEvent.click(screen.getByRole('button', { name: '주' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(calls(fetcher)[1]).toMatchObject({ interval: '1h' });
    expect(Date.parse(calls(fetcher)[1]!.to) - Date.parse(calls(fetcher)[1]!.from)).toBeGreaterThanOrEqual(HISTORY_UNITS.week.spanMs - 3_600_000);

    await userEvent.click(screen.getByRole('button', { name: '월' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(calls(fetcher)[2]).toMatchObject({ interval: '6h' });
    expect(screen.getByRole('button', { name: '월' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('이전 ▶을 누르면 구간 길이만큼 통째로 이동한 구간을 새로 요청하고 다음 ▶이 켜진다', async () => {
    const fetcher = makeFetcher();
    panel(fetcher);
    await screen.findByRole('img');

    await userEvent.click(screen.getByLabelText('이전 구간'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(calls(fetcher)[1]).toMatchObject({
      from: new Date(ANCHOR - 2 * DAY).toISOString(),
      to: new Date(ANCHOR - DAY).toISOString(),
    });
    expect(screen.getByLabelText('다음 구간')).toBeEnabled();
  });

  it('받아 둔 과거 구간은 다시 돌아와도 재요청하지 않지만, 최근 구간은 항상 다시 요청한다', async () => {
    const fetcher = makeFetcher();
    panel(fetcher);
    await screen.findByRole('img');

    await userEvent.click(screen.getByLabelText('이전 구간')); // k=1 요청
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByLabelText('이전 구간')); // k=2 요청
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));

    await userEvent.click(screen.getByLabelText('다음 구간')); // k=1: 기억해 둔 값 사용
    await screen.findByRole('img');
    expect(fetcher).toHaveBeenCalledTimes(3);

    await userEvent.click(screen.getByLabelText('다음 구간')); // k=0: 다시 요청
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(calls(fetcher)[3]!.to).toBe(new Date(NOW).toISOString());
    expect(screen.getByLabelText('다음 구간')).toBeDisabled();
  });

  it('metric이 다르면 같은 구간도 다시 요청한다 (기억 키에 metric이 들어 있다)', async () => {
    const fetcher = makeFetcher();
    panel(fetcher);
    await screen.findByRole('img');
    await userEvent.click(screen.getByLabelText('이전 구간'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole('button', { name: '수분' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(calls(fetcher)[2]).toMatchObject({ metric: 'moisture' });
    expect(screen.getByRole('button', { name: '수분' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('구간을 빠르게 넘기면 앞선 요청은 취소하고 마지막 구간만 반영한다', async () => {
    const pending: Array<(r: HistoryResponse) => void> = [];
    const signals: AbortSignal[] = [];
    const fetcher = vi.fn(
      (q: HistoryQuery, signal?: AbortSignal) =>
        new Promise<HistoryResponse>((resolve) => {
          if (signal) signals.push(signal);
          pending.push(() =>
            resolve({ deviceId: q.deviceId, metric: q.metric, interval: q.interval, from: q.from, to: q.to, points: [{ ts: q.from, value: 1 }] }),
          );
        }),
    );
    render(<HistoryPanel deviceId="tank-a1" metrics={HISTORY_METRICS.tank} now={now} fetcher={fetcher} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByLabelText('이전 구간'));
    await userEvent.click(screen.getByLabelText('이전 구간'));
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(true);
    expect(signals[2]!.aborted).toBe(false);
    pending.forEach((resolve) => resolve({} as HistoryResponse));
  });
});

describe('HistoryPanel: 불러오는 중, 실패, 빈 구간', () => {
  it('처음에는 불러오는 중이라고 보여 준다', async () => {
    const fetcher = vi.fn(() => new Promise<HistoryResponse>(() => undefined));
    render(<HistoryPanel deviceId="tank-a1" metrics={HISTORY_METRICS.tank} now={now} fetcher={fetcher} />);
    expect(screen.getByRole('status')).toHaveTextContent('이력을 불러오는 중');
  });

  it('다시 불러오는 동안은 이전 그래프를 흐리게 두고 로딩 표시를 한다', async () => {
    let release!: () => void;
    const first = makeFetcher();
    const fetcher = vi.fn((q: HistoryQuery, s?: AbortSignal) =>
      fetcher.mock.calls.length === 1 ? first(q, s) : new Promise<HistoryResponse>((resolve) => (release = () => resolve({ deviceId: q.deviceId, metric: q.metric, interval: q.interval, from: q.from, to: q.to, points: [] }))),
    );
    render(<HistoryPanel deviceId="tank-a1" metrics={HISTORY_METRICS.tank} now={now} fetcher={fetcher} />);
    const before = await screen.findByRole('img');

    await userEvent.click(screen.getByLabelText('이전 구간'));
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    const dimmed = screen.getByRole('img').parentElement!;
    expect(dimmed).toHaveClass('opacity-40');
    expect(before.getAttribute('aria-label')).toContain('최소 10');
    await act(async () => release());
  });

  it('실패하면 그 자리에 오류와 다시 시도 버튼을 보여 주고, 다시 시도하면 그래프가 나온다', async () => {
    const ok = makeFetcher();
    const fetcher = vi.fn(async (q: HistoryQuery, s?: AbortSignal) => {
      if (fetcher.mock.calls.length === 1) throw new api.ApiError(503, 'X', '서버가 준비되지 않았습니다.');
      return ok(q, s);
    });
    render(<HistoryPanel deviceId="tank-a1" metrics={HISTORY_METRICS.tank} now={now} fetcher={fetcher} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('이력을 불러오지 못했습니다');
    expect(alert).toHaveTextContent('서버가 준비되지 않았습니다.');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    await screen.findByRole('img');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('기록이 없는 구간은 그렇게 알려 준다', async () => {
    panel(makeFetcher([]));
    expect(await screen.findByText('이 구간에는 기록된 값이 없습니다.')).toBeInTheDocument();
  });

  it('그래프에는 접근성용 요약(최소·최대·마지막 값)이 붙는다', async () => {
    panel(makeFetcher([10, 20, 30]));
    const label = (await screen.findByRole('img')).getAttribute('aria-label')!;
    expect(label).toContain('섹터 A1 적재율');
    expect(label).toContain('최소 10%');
    expect(label).toContain('최대 30%');
    expect(label).toContain('마지막 30%');
  });

  it('항목이 하나뿐이면 항목 선택 버튼 없이 이름만 보여 준다', async () => {
    render(<HistoryPanel deviceId="conveyor-z" metrics={HISTORY_METRICS.conveyor} now={now} fetcher={makeFetcher()} />);
    await screen.findByRole('img');
    expect(screen.queryByRole('group', { name: '항목' })).not.toBeInTheDocument();
    expect(screen.getByText('적재 정도')).toBeInTheDocument();
  });
});

describe('HistoryPanel: 밀어서 넘기기', () => {
  const swipe = (el: HTMLElement, dx: number, dy = 0) => {
    fireEvent.pointerDown(el, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(el, { clientX: 300 + dx, clientY: 200 + dy });
  };

  it('오른쪽으로 밀면 과거로, 왼쪽으로 밀면 최근으로 간다', async () => {
    const fetcher = makeFetcher();
    panel(fetcher);
    const area = (await screen.findByRole('img')).parentElement!.parentElement!;

    swipe(area, 120);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(calls(fetcher)[1]!.to).toBe(new Date(ANCHOR - DAY).toISOString());

    swipe(area, -120);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(calls(fetcher)[2]!.to).toBe(new Date(NOW).toISOString());
  });

  it('최근 구간에서 왼쪽으로 밀어도 아무 일도 없고, 짧거나 세로 동작은 무시한다', async () => {
    const fetcher = makeFetcher();
    panel(fetcher);
    const area = (await screen.findByRole('img')).parentElement!.parentElement!;
    swipe(area, -150);
    swipe(area, 30);
    swipe(area, 100, 200);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('DeviceAlarmHistory', () => {
  const alarm = (id: string, deviceId: Alarm['deviceId'], state: Alarm['state'], ts: string): Alarm => ({
    id,
    level: 'caution',
    deviceId,
    message: `${id} 메시지`,
    state,
    ts,
  });

  it('이 기기의 알람만 최신순으로 보여 주고 상태를 글자로 알린다', async () => {
    vi.mocked(api.getAlarms).mockResolvedValue([
      alarm('al-1', 'tank-a1', 'cleared', '2026-10-12T05:00:00.000Z'),
      alarm('al-2', 'tank-b2', 'active', '2026-10-13T01:00:00.000Z'),
      alarm('al-3', 'tank-a1', 'active', '2026-10-13T04:00:00.000Z'),
    ]);
    renderWithStore(<DeviceAlarmHistory deviceId="tank-a1" now={now} />);

    const items = await screen.findAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining('al-3 메시지'), expect.stringContaining('al-1 메시지')]);
    expect(items[0]).toHaveTextContent('발생 중');
    expect(items[1]).toHaveTextContent('해제됨');
    expect(api.getAlarms).toHaveBeenCalledWith({ from: new Date(NOW - 7 * 86_400_000).toISOString() });
  });

  it('알람이 없으면 없다고 알린다', async () => {
    vi.mocked(api.getAlarms).mockResolvedValue([]);
    renderWithStore(<DeviceAlarmHistory deviceId="tank-a1" now={now} />);
    expect(await screen.findByText('최근 7일간 알람이 없습니다.')).toBeInTheDocument();
  });

  it('실패하면 오류와 다시 시도 버튼을 보여 준다', async () => {
    vi.mocked(api.getAlarms).mockRejectedValueOnce(new api.ApiError(503, 'X', '')).mockResolvedValue([]);
    renderWithStore(<DeviceAlarmHistory deviceId="tank-a1" now={now} />);
    const alert = await screen.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('최근 7일간 알람이 없습니다.')).toBeInTheDocument();
  });

  it('열린 알람이 바뀌면(발생·확인·해제) 이력을 다시 불러온다', async () => {
    vi.mocked(api.getAlarms).mockReset();
    vi.mocked(api.getAlarms).mockResolvedValue([]);
    const store = createAppStore();
    render(
      <Provider store={store}>
        <DeviceAlarmHistory deviceId="tank-a1" now={now} />
      </Provider>,
    );
    await screen.findByText('최근 7일간 알람이 없습니다.');
    expect(api.getAlarms).toHaveBeenCalledTimes(1);

    act(() => {
      store.dispatch(alarmReceived(alarm('al-9', 'tank-a1', 'active', '2026-10-13T05:00:00.000Z')));
    });
    await waitFor(() => expect(api.getAlarms).toHaveBeenCalledTimes(2));
  });
});
