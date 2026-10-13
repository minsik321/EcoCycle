import { describe, expect, it } from 'vitest';
import { HISTORY_UNITS, HISTORY_UNIT_ORDER } from '../../config/display';
import { anchorFor, cacheKey, formatWindowLabel, parseIntervalMs, windowAt } from './historyWindow';

const NOW = Date.parse('2026-10-13T05:23:11.250Z');

describe('config: 구간 표 (명세 기준)', () => {
  it('일 24시간·10분·144점, 주 7일·1시간·168점, 월 30일·6시간·120점', () => {
    expect(HISTORY_UNIT_ORDER).toEqual(['day', 'week', 'month']);
    expect(HISTORY_UNITS.day).toMatchObject({ spanMs: 24 * 3_600_000, interval: '10m', points: 144 });
    expect(HISTORY_UNITS.week).toMatchObject({ spanMs: 7 * 86_400_000, interval: '1h', points: 168 });
    expect(HISTORY_UNITS.month).toMatchObject({ spanMs: 30 * 86_400_000, interval: '6h', points: 120 });
  });

  it('점 수는 구간 길이 ÷ 간격과 같다', () => {
    for (const key of HISTORY_UNIT_ORDER) {
      const u = HISTORY_UNITS[key];
      expect(u.spanMs / parseIntervalMs(u.interval)!).toBe(u.points);
    }
  });
});

describe('parseIntervalMs / anchorFor', () => {
  it('간격 문자열을 밀리초로 바꾼다', () => {
    expect(parseIntervalMs('10m')).toBe(600_000);
    expect(parseIntervalMs('1h')).toBe(3_600_000);
    expect(parseIntervalMs('1d')).toBe(86_400_000);
    expect(parseIntervalMs('abc')).toBeUndefined();
    expect(parseIntervalMs('0m')).toBeUndefined();
  });

  it('요청 간격 경계로 내린다', () => {
    expect(new Date(anchorFor(NOW, '10m')).toISOString()).toBe('2026-10-13T05:20:00.000Z');
    expect(new Date(anchorFor(NOW, '1h')).toISOString()).toBe('2026-10-13T05:00:00.000Z');
    expect(new Date(anchorFor(NOW, '6h')).toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });
});

describe('windowAt', () => {
  const anchor = anchorFor(NOW, '10m');
  const span = HISTORY_UNITS.day.spanMs;

  it('처음 열면 최근 하루: from = 기준 - 24시간, to = 지금', () => {
    const w = windowAt('day', 0, anchor, NOW);
    expect(w.from).toBe('2026-10-12T05:20:00.000Z');
    expect(w.to).toBe('2026-10-13T05:23:11.250Z');
  });

  it('이전 구간은 길이만큼 통째로 이동하고 서로 맞닿는다', () => {
    const w0 = windowAt('day', 0, anchor, NOW);
    const w1 = windowAt('day', 1, anchor, NOW);
    const w2 = windowAt('day', 2, anchor, NOW);
    expect(w1.toMs - w1.fromMs).toBe(span);
    expect(w2.toMs - w2.fromMs).toBe(span);
    expect(w1.toMs).toBe(w0.fromMs); // 빈틈도 겹침도 없다
    expect(w2.toMs).toBe(w1.fromMs);
  });

  it('같은 구간은 기준 시각이 같으면 항상 같은 from이 나온다 (받아 둔 값을 다시 쓸 수 있다)', () => {
    const later = NOW + 5 * 60_000; // 5분 뒤에 다시 열어도 같은 10분 경계 안이면
    const a = windowAt('day', 1, anchorFor(NOW, '10m'), NOW);
    const b = windowAt('day', 1, anchorFor(later, '10m'), later);
    expect(a.from).toBe(b.from);
  });

  it('주·월은 각자의 길이로 계산한다', () => {
    const wa = anchorFor(NOW, '1h');
    expect(windowAt('week', 1, wa, NOW).toMs - windowAt('week', 1, wa, NOW).fromMs).toBe(HISTORY_UNITS.week.spanMs);
    const ma = anchorFor(NOW, '6h');
    expect(windowAt('month', 2, ma, NOW).toMs - windowAt('month', 2, ma, NOW).fromMs).toBe(HISTORY_UNITS.month.spanMs);
  });
});

describe('cacheKey / formatWindowLabel', () => {
  it('기기, metric, 간격, from으로 키를 만든다', () => {
    expect(cacheKey('tank-a1', 'level', '10m', '2026-10-12T05:20:00.000Z')).toBe('tank-a1|level|10m|2026-10-12T05:20:00.000Z');
    expect(cacheKey('tank-a1', 'level', '10m', 'x')).not.toBe(cacheKey('tank-a1', 'moisture', '10m', 'x'));
  });

  it('현재 구간을 현지 시각 "월/일 시:분 ~ 월/일 시:분"으로 보여 준다', () => {
    const label = formatWindowLabel(windowAt('day', 0, anchorFor(NOW, '10m'), NOW));
    expect(label).toMatch(/^\d{1,2}\/\d{1,2} \d{2}:\d{2} ~ \d{1,2}\/\d{1,2} \d{2}:\d{2}$/);
  });
});
