import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { RECORD_SEARCH_MAX_LENGTH } from '@ecocycle/shared';
import { RECORD_LIST, RECORD_RANGES } from '../../config/display';
import type { RecordRangeKey } from '../../config/display';
import { Button } from '../common/Button';
import { addLocalDays, customRange, presetRange, startOfLocalDay, toDateInput } from './range';
import type { RecordRange } from './range';

/*
 * 기록 목록과 알람 화면이 함께 쓰는 거르기 조각: 기간(오늘·어제·최근 7일·직접 선택)과 검색 상자.
 * 결과는 "고른 기간 AND 검색어"이고, 둘 다 서버가 거른다(`from`·`to`·`q`).
 */

export interface RecordRangeState {
  rangeKey: RecordRangeKey;
  range: RecordRange;
  /** 새 사건·재연결 뒤 정해 둔 기간의 끝을 지금까지 넓혀 다시 계산한다. 직접 선택이면 아무것도 하지 않고 false */
  refreshRange: () => boolean;
  choose: (key: RecordRangeKey) => void;
  customFrom: string;
  customTo: string;
  customError: string | null;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  applyCustom: (event: FormEvent) => void;
  max: string;
}

/** 기간 상태. 기간이 실제로 바뀌면(`choose`의 정해 둔 기간, `applyCustom`) `onChange`를 불러 쪽을 1로 되돌리게 한다 */
export function useRecordRange(initialRange: RecordRangeKey, now: () => Date, onChange: () => void): RecordRangeState {
  const nowRef = useRef(now);
  nowRef.current = now;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [rangeKey, setRangeKey] = useState<RecordRangeKey>(initialRange);
  const [customFrom, setCustomFrom] = useState(() => toDateInput(addLocalDays(startOfLocalDay(now()), -6)));
  const [customTo, setCustomTo] = useState(() => toDateInput(now()));
  const [customError, setCustomError] = useState<string | null>(null);
  const [range, setRange] = useState<RecordRange>(() => {
    if (initialRange !== 'custom') return presetRange(initialRange, now());
    const custom = customRange(toDateInput(addLocalDays(startOfLocalDay(now()), -6)), toDateInput(now()));
    return 'error' in custom ? presetRange('today', now()) : custom;
  });

  const choose = useCallback((key: RecordRangeKey) => {
    setRangeKey(key);
    setCustomError(null);
    if (key === 'custom') return; // 날짜를 고르고 "적용"을 눌러야 바뀐다
    setRange(presetRange(key, nowRef.current()));
    onChangeRef.current();
  }, []);

  const applyCustom = (event: FormEvent) => {
    event.preventDefault();
    const custom = customRange(customFrom, customTo);
    if ('error' in custom) {
      setCustomError(custom.error);
      return;
    }
    setCustomError(null);
    setRange(custom);
    onChangeRef.current();
  };

  const refreshRange = useCallback(() => {
    if (rangeKey === 'custom') return false;
    setRange(presetRange(rangeKey, nowRef.current()));
    return true;
  }, [rangeKey]);

  return { rangeKey, range, refreshRange, choose, customFrom, customTo, customError, setCustomFrom, setCustomTo, applyCustom, max: toDateInput(now()) };
}

export interface SearchState {
  /** 입력 상자에 보이는 글 */
  text: string;
  /** 서버에 보내는 검색어: 입력을 `SEARCH_DEBOUNCE_MS` 동안 멈췄을 때 따라온다 (앞뒤 공백 제거) */
  q: string;
  setText: (value: string) => void;
  /** 기다리지 않고 지금 보낸다 (Enter) */
  commit: () => void;
  /** 입력을 비우고 바로 보낸다 (X 버튼) */
  clear: () => void;
}

/** 검색어 입력을 기다리는 시간 (밀리초). 글자마다 서버를 부르지 않게 */
export const SEARCH_DEBOUNCE_MS = 300;

/** 검색어 상태. 서버에 보내는 `q`가 실제로 바뀔 때만 `onChange`를 불러 쪽을 1로 되돌리게 한다 */
export function useSearchText(onChange: () => void, delayMs = SEARCH_DEBOUNCE_MS): SearchState {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [text, setTextState] = useState('');
  const [q, setQ] = useState('');
  const qRef = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback((value: string) => {
    clearTimeout(timer.current);
    const next = value.trim();
    if (next === qRef.current) return;
    qRef.current = next;
    setQ(next);
    onChangeRef.current();
  }, []);

  const setText = useCallback(
    (value: string) => {
      setTextState(value);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(value), delayMs);
    },
    [delayMs, flush],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    text,
    q,
    setText,
    commit: () => flush(text),
    clear: () => {
      setTextState('');
      flush('');
    },
  };
}

/** 기간 고르기 (+ 직접 선택이면 날짜 두 칸) */
export function RangeFilter({ state }: { state: RecordRangeState }) {
  return (
    <>
      <RangePicker value={state.rangeKey} onChange={state.choose} />
      {state.rangeKey === 'custom' && (
        <CustomRangeForm from={state.customFrom} to={state.customTo} error={state.customError} onFrom={state.setCustomFrom} onTo={state.setCustomTo} onSubmit={state.applyCustom} max={state.max} />
      )}
    </>
  );
}

/** 검색 상자: 돋보기 · 입력 · X(지우기). 터치 대상은 48px */
export function SearchBox({ search, label, placeholder }: { search: SearchState; label: string; placeholder: string }) {
  return (
    <form
      role="search"
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        search.commit();
      }}
      className="flex min-h-12 items-center rounded-control border border-line bg-surface focus-within:border-accent"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-3 h-5 w-5 shrink-0 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </svg>
      <input
        type="search"
        value={search.text}
        onChange={(event) => search.setText(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        maxLength={RECORD_SEARCH_MAX_LENGTH}
        autoComplete="off"
        enterKeyHint="search"
        className="min-h-12 min-w-0 flex-1 appearance-none bg-transparent px-2 text-base text-ink outline-none placeholder:text-sm placeholder:text-ink-faint [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {search.text !== '' && (
        <button type="button" onClick={search.clear} aria-label="검색어 지우기" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-ink-soft active:bg-paper-deep">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </form>
  );
}

/** 결과가 없을 때: 기간만 있을 때와 검색 중일 때 문구가 다르다. 검색 중이면 어떤 기간·검색어였는지 함께 적는다 */
export function EmptyResult({ rangeKey, q, emptyText = RECORD_LIST.emptyText }: { rangeKey: RecordRangeKey; q: string; emptyText?: string }) {
  if (q === '') return <p className="py-6 text-center text-sm text-ink-faint">{emptyText}</p>;
  const period = RECORD_RANGES.find((r) => r.key === rangeKey)?.label ?? '';
  return (
    <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-ink-faint">
      <p className="font-semibold text-ink-soft">{RECORD_LIST.emptySearchText}</p>
      <p>
        기간 <span className="font-semibold text-ink-soft">{period}</span> · 검색어 <span className="font-semibold break-all text-ink-soft">“{q}”</span>
      </p>
    </div>
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
