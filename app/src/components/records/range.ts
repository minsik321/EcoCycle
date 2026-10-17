import { RECORD_LIST } from '../../config/display';
import type { RecordRangeKey } from '../../config/display';

/** 기록을 볼 구간: [from, to). 고르는 것은 현지 날짜이고, 서버에는 UTC ISO 문자열로 보낸다 */
export interface RecordRange {
  from: Date;
  to: Date;
}

/** 현지 시각 그날 0시 */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 현지 날짜에 날을 더한다 (일광 절약 시간에도 0시를 지킨다) */
export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 정해 둔 기간: 오늘(0시~지금), 어제(어제 0시~오늘 0시), 최근 7일(지금-7일~지금) */
export function presetRange(key: Exclude<RecordRangeKey, 'custom'>, now: Date): RecordRange {
  const today = startOfLocalDay(now);
  switch (key) {
    case 'today':
      return { from: today, to: now };
    case 'yesterday':
      return { from: addLocalDays(today, -1), to: today };
    case 'last7d':
      return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
  }
}

/** `<input type="date">`의 값(YYYY-MM-DD, 현지 날짜) */
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 직접 고른 기간: 시작일 0시 ~ 끝날 다음 날 0시(끝날 하루를 포함). 고를 수 없는 값이면 이유 문구를 돌려준다.
 */
export function customRange(fromValue: string, toValue: string): RecordRange | { error: string } {
  const from = fromDateInput(fromValue);
  const last = fromDateInput(toValue);
  if (!from || !last) return { error: '시작일과 종료일을 모두 고르세요.' };
  if (from > last) return { error: '시작일이 종료일보다 늦습니다.' };
  const to = addLocalDays(last, 1);
  const days = Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  if (days > RECORD_LIST.maxCustomDays) return { error: `한 번에 ${RECORD_LIST.maxCustomDays}일까지 볼 수 있습니다.` };
  return { from, to };
}

/** 보여 줄 쪽 번호들: 지금 쪽을 가운데에 두고 최대 size개 */
export function pageWindow(page: number, pageCount: number, size: number = RECORD_LIST.pageWindow): number[] {
  if (pageCount <= 0) return [];
  const count = Math.min(size, pageCount);
  const start = Math.min(Math.max(1, page - Math.floor(count / 2)), pageCount - count + 1);
  return Array.from({ length: count }, (_, i) => start + i);
}
