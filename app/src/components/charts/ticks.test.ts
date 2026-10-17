import { describe, expect, it } from 'vitest';
import { dateTicks, formatDateTick } from './ticks';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('dateTicks', () => {
  it('7일 구간에는 하루에 하나씩, 자정 기준으로 찍는다', () => {
    const ticks = dateTicks(at(2026, 10, 6, 16, 40), at(2026, 10, 13, 16, 49));
    expect(ticks).toHaveLength(7);
    expect(ticks.map(formatDateTick)).toEqual(['10/7', '10/8', '10/9', '10/10', '10/11', '10/12', '10/13']);
    for (const t of ticks) expect(new Date(t).getHours()).toBe(0);
  });

  it('같은 날짜가 두 번 나오지 않는다', () => {
    const labels = dateTicks(at(2026, 10, 6, 16, 40), at(2026, 10, 13, 16, 49)).map(formatDateTick);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('30일 구간은 눈금을 건너뛰어 8개 이하로 줄인다', () => {
    const ticks = dateTicks(at(2026, 9, 13, 10), at(2026, 10, 13, 10));
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks.length).toBeGreaterThan(3);
    // 간격이 일정하다
    const gaps = new Set(ticks.slice(1).map((t, i) => Math.round((t - ticks[i]!) / 86_400_000)));
    expect(gaps.size).toBe(1);
  });

  it('시작 시각이 정확히 자정이면 그 자정도 포함한다', () => {
    expect(dateTicks(at(2026, 10, 7), at(2026, 10, 9, 5))[0]).toBe(at(2026, 10, 7));
  });

  it('구간이 잘못되면 빈 목록', () => {
    expect(dateTicks(100, 100)).toEqual([]);
    expect(dateTicks(200, 100)).toEqual([]);
  });

  it('자정이 없는 짧은 구간은 눈금이 없다', () => {
    expect(dateTicks(at(2026, 10, 7, 1), at(2026, 10, 7, 5))).toEqual([]);
  });
});

describe('formatDateTick', () => {
  it('월/일로 보여 준다', () => {
    expect(formatDateTick(at(2026, 1, 5))).toBe('1/5');
    expect(formatDateTick(at(2026, 12, 31))).toBe('12/31');
  });
});
