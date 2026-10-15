import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { RECORD_PAGE_SIZE, recordPageCount } from '@ecocycle/shared';
import type { IsoTimestamp, RecordPage, RecordQuery } from '@ecocycle/shared';
import { RECORD_LIST, RECORD_RANGES, formatLocalTime } from '../../config/display';
import type { RecordRangeKey } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectConnection, selectIsDisconnected } from '../../store/selectors';
import { Button } from '../common/Button';
import { DataTable } from '../common/DataTable';
import type { Column } from '../common/DataTable';
import { addLocalDays, customRange, pageWindow, presetRange, startOfLocalDay, toDateInput } from './range';
import type { RecordRange } from './range';

export interface RecordListProps<T> {
  /** 목록 이름 (화면 읽기용, 예: "하역 기록") */
  label: string;
  /**
   * 한 쪽을 받는다. 보통 `(query, signal) => getRecords<VehicleRecord>('/vehicles/records', query, signal)`.
   * 컴포넌트는 API를 직접 부르지 않고 이 함수만 부른다.
   */
  load: (query: RecordQuery, signal: AbortSignal) => Promise<RecordPage<T>>;
  rowKey: (item: T) => string;
  /** 기록 시각 (UTC ISO). 화면에는 현지 시각으로 적는다 */
  time: (item: T) => IsoTimestamp;
  /** 폰 줄의 제목 (예: 번호판) */
  title: (item: T) => ReactNode;
  /** 폰 줄의 설명 한 줄 (넘치면 말줄임) */
  detail: (item: T) => ReactNode;
  /** 폰 줄의 둘째 설명 한 줄 (넘치면 말줄임). 표에서는 칸으로 보이는 값을 폰에서도 보여 줄 때 */
  extra?: (item: T) => ReactNode;
  /** 태블릿·데스크톱 표의 칸 ("시각" 칸은 맨 앞에 저절로 붙는다) */
  columns: readonly Column<T>[];
  /** 맨 앞 시각 칸의 머리글 (기본 "시각", 예: "입차") */
  timeHeader?: string;
  /** 표의 칸 여백을 줄인다 (칸이 많은 목록) */
  dense?: boolean;
  /** 줄을 누르면 부른다 (상세 화면으로 가기). 주면 폰 줄과 표 줄이 모두 눌린다 */
  onOpen?: (item: T) => void;
  /** 처음 기간 (기본 config의 defaultRange) */
  initialRange?: RecordRangeKey;
  /** 지금 시각 (테스트용) */
  now?: () => Date;
  className?: string;
  /** 사건 발생 뒤 같은 기간·쪽을 다시 조회한다 */
  refreshToken?: string;
}

type LoadState<T> = { status: 'loading'; data: RecordPage<T> | null } | { status: 'ok'; data: RecordPage<T> } | { status: 'error'; data: RecordPage<T> | null };

/**
 * 기록 목록: 기간 고르기(오늘·어제·최근 7일·직접 선택) → 서버에서 10줄씩 받아 → 폰은 쌓인 줄, 태블릿·데스크톱은 작은 표 → 쪽 넘기기.
 * 쪽은 서버가 나눈다(`GET .../records?from&to&page&pageSize`, shared/records.ts). 시각은 UTC로 보내고 현지 시각으로 적는다.
 * 지난 기록이라 연결이 끊겨도 받은 줄은 그대로 두고 끊김과 마지막 수신 시각을 알리며, 다시 연결되면 같은 쪽을 새로 받는다.
 */
export function RecordList<T>({ label, load, rowKey, time, title, detail, extra, columns, timeHeader = '시각', dense = false, onOpen, initialRange = RECORD_LIST.defaultRange, now = () => new Date(), className = '', refreshToken = '' }: RecordListProps<T>) {
  const nowRef = useRef(now);
  nowRef.current = now;
  const loadRef = useRef(load);
  loadRef.current = load;

  const [rangeKey, setRangeKey] = useState<RecordRangeKey>(initialRange);
  const [customFrom, setCustomFrom] = useState(() => toDateInput(addLocalDays(startOfLocalDay(now()), -6)));
  const [customTo, setCustomTo] = useState(() => toDateInput(now()));
  const [customError, setCustomError] = useState<string | null>(null);
  const [range, setRange] = useState<RecordRange>(() => {
    if (initialRange !== 'custom') return presetRange(initialRange, now());
    const custom = customRange(toDateInput(addLocalDays(startOfLocalDay(now()), -6)), toDateInput(now()));
    return 'error' in custom ? presetRange('today', now()) : custom;
  });
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState<T>>({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);

  const disconnected = useAppSelector(selectIsDisconnected);
  const lastReceivedAt = useAppSelector(selectConnection).lastReceivedAt;

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ status: 'loading', data: prev.data }));
    const query: RecordQuery = { from: range.from.toISOString(), to: range.to.toISOString(), page, pageSize: RECORD_PAGE_SIZE };
    loadRef.current(query, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        // 그사이 기록이 줄어 이 쪽이 비었으면 마지막 쪽으로 간다
        const pages = recordPageCount(data.total, data.pageSize);
        if (data.items.length === 0 && page > 1 && pages > 0) {
          setPage(pages);
          return;
        }
        setState({ status: 'ok', data });
      },
      () => {
        if (controller.signal.aborted) return;
        setState((prev) => ({ status: 'error', data: prev.data }));
      },
    );
    return () => controller.abort();
  }, [range, page, attempt, refreshToken]);

  // 다시 연결되면 같은 쪽을 새로 받는다 (정해 둔 기간은 지금 시각으로 다시 계산)
  const wasDisconnected = useRef(disconnected);
  useEffect(() => {
    if (wasDisconnected.current && !disconnected) {
      if (rangeKey !== 'custom') setRange(presetRange(rangeKey, nowRef.current()));
      else setAttempt((n) => n + 1);
    }
    wasDisconnected.current = disconnected;
  }, [disconnected, rangeKey]);

  const choose = (key: RecordRangeKey) => {
    setRangeKey(key);
    setCustomError(null);
    if (key === 'custom') return; // 날짜를 고르고 "적용"을 눌러야 바뀐다
    setRange(presetRange(key, nowRef.current()));
    setPage(1);
  };

  const applyCustom = (event: FormEvent) => {
    event.preventDefault();
    const custom = customRange(customFrom, customTo);
    if ('error' in custom) {
      setCustomError(custom.error);
      return;
    }
    setCustomError(null);
    setRange(custom);
    setPage(1);
  };

  const data = state.data;
  const pages = data ? recordPageCount(data.total, data.pageSize) : 0;
  const busy = state.status === 'loading';
  const tableColumns: Column<T>[] = [{ key: '__time', header: timeHeader, cell: (item) => <time dateTime={time(item)} className="tabular-nums">{formatLocalTime(time(item), false)}</time> }, ...columns];

  return (
    <section aria-label={label} aria-busy={busy || undefined} className={`flex flex-col gap-3 ${className}`}>
      <RangePicker value={rangeKey} onChange={choose} />
      {rangeKey === 'custom' && (
        <CustomRangeForm from={customFrom} to={customTo} error={customError} onFrom={setCustomFrom} onTo={setCustomTo} onSubmit={applyCustom} max={toDateInput(now())} />
      )}

      <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-soft">
        <span className="tabular-nums whitespace-nowrap">
          {formatLocalTime(range.from.toISOString(), false)} ~ {formatLocalTime(range.to.toISOString(), false)}
        </span>
        {data && <span className="font-semibold whitespace-nowrap text-ink">총 {data.total}건</span>}
      </p>

      {disconnected && (
        <p role="status" className="text-sm font-semibold text-status-offline">
          연결 끊김 · 마지막 수신 <time dateTime={lastReceivedAt ?? undefined}>{formatLocalTime(lastReceivedAt)}</time> · 다시 연결되면 새로 불러옵니다
        </p>
      )}

      {state.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-control border border-status-alarm/40 bg-status-alarm/5 px-3 py-2 text-sm text-ink">
          <span className="flex-1">기록을 불러오지 못했습니다.</span>
          <Button onClick={() => setAttempt((n) => n + 1)}>다시 시도</Button>
        </div>
      )}

      {!data && busy && (
        <p role="status" className="py-6 text-center text-sm text-ink-faint">
          불러오는 중…
        </p>
      )}

      {data && data.items.length === 0 && state.status === 'ok' && <p className="py-6 text-center text-sm text-ink-faint">{RECORD_LIST.emptyText}</p>}

      {data && data.items.length > 0 && (
        <div className={busy ? 'opacity-60 transition-opacity' : undefined}>
          {/* 폰: 쌓인 줄 (제목 · 시각 / 설명 한 줄) */}
          <ul aria-label={label} className="divide-y divide-line/70 md:hidden">
            {data.items.map((item) => {
              const body = (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{title(item)}</span>
                    <time dateTime={time(item)} className="shrink-0 text-xs whitespace-nowrap text-ink-faint tabular-nums">
                      {formatLocalTime(time(item), false)}
                    </time>
                  </div>
                  <p className="truncate text-sm text-ink-soft">{detail(item)}</p>
                  {extra && <p className="truncate text-sm text-ink-soft">{extra(item)}</p>}
                </>
              );
              const rowClass = 'flex min-h-14 flex-col justify-center gap-0.5 py-2';
              return (
                <li key={rowKey(item)}>
                  {onOpen ? (
                    <button type="button" onClick={() => onOpen(item)} className={`${rowClass} w-full min-w-0 text-left active:bg-paper-deep`}>
                      {body}
                    </button>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {/* 태블릿·데스크톱: 작은 표 */}
          <DataTable label={label} columns={tableColumns} rows={data.items} rowKey={rowKey} onRowClick={onOpen} dense={dense} className="hidden md:block" />
        </div>
      )}

      {pages > 1 && <Pagination page={page} pageCount={pages} onPage={setPage} disabled={busy} />}
    </section>
  );
}

function RangePicker({ value, onChange }: { value: RecordRangeKey; onChange: (key: RecordRangeKey) => void }) {
  return (
    // 폰은 2×2(글자를 키워도 꺾이지 않게), 넓으면 한 줄
    <div role="group" aria-label="기간" className="grid grid-cols-2 gap-1 rounded-control bg-paper-deep p-1 sm:grid-cols-4">
      {RECORD_RANGES.map((range) => {
        const selected = range.key === value;
        return (
          <button
            key={range.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(range.key)}
            className={`min-h-12 truncate rounded-control px-2 text-sm font-semibold whitespace-nowrap select-none ${selected ? 'bg-accent text-white shadow-soft-1' : 'text-ink-soft active:bg-surface'}`}
          >
            {range.label}
          </button>
        );
      })}
    </div>
  );
}

interface CustomRangeFormProps {
  from: string;
  to: string;
  max: string;
  error: string | null;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

function CustomRangeForm({ from, to, max, error, onFrom, onTo, onSubmit }: CustomRangeFormProps) {
  const id = useId();
  const input = 'min-h-12 w-full min-w-0 rounded-control border border-line bg-surface px-2 text-base text-ink tabular-nums';
  return (
    <form onSubmit={onSubmit} aria-label="기간 직접 선택" className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <label htmlFor={`${id}-from`} className="flex min-w-0 flex-col gap-1 text-sm font-semibold whitespace-nowrap text-ink-soft">
        시작일
        <input id={`${id}-from`} type="date" value={from} max={max} onChange={(e) => onFrom(e.target.value)} className={input} />
      </label>
      <label htmlFor={`${id}-to`} className="flex min-w-0 flex-col gap-1 text-sm font-semibold whitespace-nowrap text-ink-soft">
        종료일
        <input id={`${id}-to`} type="date" value={to} max={max} onChange={(e) => onTo(e.target.value)} className={input} />
      </label>
      <Button type="submit" variant="primary" className="col-span-2 sm:col-span-1">
        적용
      </Button>
      {error && (
        <p role="alert" className="col-span-2 text-sm text-status-alarm sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}

/** 쪽 넘기기: 이전 · 쪽 번호(넓으면 5개, 폰은 지금 쪽 앞뒤로 3개) · 다음. 버튼은 48px 이상 */
export function Pagination({ page, pageCount, onPage, disabled = false }: PaginationProps) {
  const numbers = pageWindow(page, pageCount);
  const step = 'min-h-12 shrink-0 px-3';
  return (
    <nav aria-label="쪽 이동" className="flex items-center justify-center gap-1">
      <Button variant="quiet" className={step} disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        이전
      </Button>
      {numbers.map((n) => {
        const current = n === page;
        const far = Math.abs(n - page) > 1;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n}쪽`}
            aria-current={current ? 'page' : undefined}
            disabled={disabled && !current}
            onClick={() => onPage(n)}
            className={`${far ? 'hidden sm:inline-flex' : 'inline-flex'} min-h-12 min-w-12 shrink-0 items-center justify-center rounded-control text-base font-semibold tabular-nums select-none ${
              current ? 'bg-accent text-white shadow-soft-1' : 'text-ink-soft active:bg-paper-deep'
            }`}
          >
            {n}
          </button>
        );
      })}
      <Button variant="quiet" className={step} disabled={disabled || page >= pageCount} onClick={() => onPage(page + 1)}>
        다음
      </Button>
    </nav>
  );
}
