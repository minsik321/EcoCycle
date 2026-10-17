import { HISTORY_UNITS } from '../../config/display';
import type { HistoryUnitKey } from '../../config/display';

// 이력 그래프의 구간 계산. 한 번에 한 구간만 요청하고, 과거는 구간 단위로 통째로 넘긴다 (연속 스크롤 없음).
//
//   k = 0 : 가장 최근 구간  [anchor - span, now]
//   k = 1 : 바로 이전 구간  [anchor - 2·span, anchor - span]
//   k = 2 : 그 이전 …
//
// anchor는 요청 간격 경계로 내린 시각이라, 같은 구간을 다시 열 때 같은 `from`이 나와서 받아 둔 값을 다시 쓸 수 있다.

/** "10m", "1h", "6h", "1d" → 밀리초. 형식이 틀리면 undefined */
export function parseIntervalMs(text: string): number | undefined {
  const m = /^(\d+)(m|h|d)$/.exec(text);
  if (!m) return undefined;
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 'm' | 'h' | 'd'];
  const ms = Number(m[1]) * unit;
  return ms > 0 ? ms : undefined;
}

/** 요청 간격 경계로 내린 시각 */
export function anchorFor(nowMs: number, interval: string): number {
  const step = parseIntervalMs(interval) ?? 60_000;
  return Math.floor(nowMs / step) * step;
}

export interface HistoryWindow {
  fromMs: number;
  toMs: number;
  /** ISO 8601 UTC (서버 요청용) */
  from: string;
  to: string;
}

export function windowAt(unit: HistoryUnitKey, k: number, anchorMs: number, nowMs: number): HistoryWindow {
  const { spanMs } = HISTORY_UNITS[unit];
  const toMs = k === 0 ? nowMs : anchorMs - k * spanMs;
  const fromMs = anchorMs - (k + 1) * spanMs;
  return { fromMs, toMs, from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() };
}

/** 받은 구간을 기억해 두는 곳. 키는 (기기, metric, 간격, from). */
export function cacheKey(deviceId: string, metric: string, interval: string, from: string): string {
  return `${deviceId}|${metric}|${interval}|${from}`;
}

/** "10/12 15:00 ~ 10/13 15:00" 형식 (현지 시각) */
export function formatWindowLabel(window: HistoryWindow): string {
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const text = (ms: number) => fmt.format(new Date(ms)).replace(/\.\s?/g, '/').replace(/\/\s*(\d{2}:\d{2})/, ' $1');
  return `${text(window.fromMs)} ~ ${text(window.toMs)}`;
}
