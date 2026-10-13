import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceId, HistoryPoint, HistoryResponse } from '@ecocycle/shared';
import { getHistory } from '../../api';
import type { HistoryQuery } from '../../api';
import { ApiError } from '../../api';
import { HISTORY_UNITS } from '../../config/display';
import type { HistoryUnitKey } from '../../config/display';
import { anchorFor, cacheKey, formatWindowLabel, windowAt } from './historyWindow';

export interface UseHistoryWindowOptions {
  deviceId: DeviceId;
  metric: string;
  /** 테스트용: 현재 시각과 요청 함수를 바꿔 끼운다 */
  now?: () => number;
  fetcher?: (query: HistoryQuery, signal?: AbortSignal) => Promise<HistoryResponse>;
}

export interface HistoryWindowState {
  unit: HistoryUnitKey;
  setUnit: (unit: HistoryUnitKey) => void;
  /** 지금 구간의 점. 아직 받은 적이 없으면 null */
  points: HistoryPoint[] | null;
  /** 불러오는 중. 이전 그래프는 그대로 두고 화면이 흐리게 보여 준다 */
  loading: boolean;
  error: string | null;
  retry: () => void;
  goPrev: () => void;
  goNext: () => void;
  /** 가장 최근 구간이면 false (다음 ▶ 비활성) */
  canNext: boolean;
  /** "10/12 15:00 ~ 10/13 15:00" (현지 시각) */
  label: string;
  interval: string;
}

/**
 * 이력 그래프의 구간 이동·요청·기억을 맡는다 (표시는 HistoryChart가 한다).
 * - 처음에는 최근 하루. 단위를 바꾸면 그 단위의 최근 구간을 다시 요청한다.
 * - 과거는 구간 단위로 통째로 넘기며 그 구간을 새로 요청한다 (연속 스크롤 없음).
 * - 받은 과거 구간은 (기기, metric, 간격, from)으로 기억해서 다시 돌아오면 재요청하지 않는다. 최신 구간은 항상 다시 요청한다.
 * - 구간을 빠르게 넘기면 앞선 요청은 취소하고 마지막 구간만 반영한다.
 */
export function useHistoryWindow({ deviceId, metric, now = Date.now, fetcher = getHistory }: UseHistoryWindowOptions): HistoryWindowState {
  const [unit, setUnitState] = useState<HistoryUnitKey>('day');
  const [k, setK] = useState(0);
  const [clock, setClock] = useState(() => {
    const t = now();
    return { nowMs: t, anchorMs: anchorFor(t, HISTORY_UNITS.day.interval) };
  });
  const [reload, setReload] = useState(0);

  const [points, setPoints] = useState<HistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, HistoryPoint[]>());

  const { interval } = HISTORY_UNITS[unit];
  const win = useMemo(() => windowAt(unit, k, clock.anchorMs, clock.nowMs), [unit, k, clock]);

  /** 가장 최근 구간을 새로 열 때 기준 시각을 지금으로 다시 잡는다 */
  const reanchor = useCallback(
    (forUnit: HistoryUnitKey) => {
      const t = now();
      setClock({ nowMs: t, anchorMs: anchorFor(t, HISTORY_UNITS[forUnit].interval) });
    },
    [now],
  );

  useEffect(() => {
    const key = cacheKey(deviceId, metric, interval, win.from);
    const hit = k > 0 ? cache.current.get(key) : undefined;
    if (hit) {
      setPoints(hit);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetcher({ deviceId, metric, from: win.from, to: win.to, interval }, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (k > 0) cache.current.set(key, res.points);
        setPoints(res.points);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof ApiError ? e.message || '이력을 불러오지 못했습니다.' : '이력을 불러오지 못했습니다.');
        setLoading(false);
      });
    return () => controller.abort();
  }, [deviceId, metric, interval, win.from, win.to, k, reload, fetcher]);

  return {
    unit,
    setUnit(next) {
      if (next === unit) return;
      setUnitState(next);
      setK(0);
      reanchor(next);
    },
    points,
    loading,
    error,
    retry() {
      if (k === 0) reanchor(unit);
      setReload((n) => n + 1);
    },
    goPrev: () => setK((n) => n + 1),
    goNext() {
      if (k === 0) return;
      if (k === 1) reanchor(unit); // 최근 구간으로 돌아가면 지금 기준으로 다시 요청한다
      setK((n) => n - 1);
    },
    canNext: k > 0,
    label: formatWindowLabel(win),
    interval,
  };
}
