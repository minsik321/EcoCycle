import { useEffect, useState } from 'react';
import type { Alarm, DeviceId } from '@ecocycle/shared';
import { getAlarms } from '../../api';
import { useAppSelector } from '../../store/hooks';

const DAYS = 7;

/** 알람 화면의 기간·검색: 기간 [from, to) (`to`가 없으면 지금까지)와 검색어 `q`를 서버에 함께 보낸다 */
export interface AlarmFilter {
  from: string;
  to?: string;
  q?: string;
}

export interface AlarmHistory {
  /** 최신순. 아직 못 받았으면 null */
  alarms: Alarm[] | null;
  error: boolean;
  /** 새로 받는 중 (이전 목록은 그대로 둔다) */
  loading: boolean;
  retry: () => void;
}

/**
 * 알람 이력: 기본은 최근 7일, `filter`를 주면 그 기간·검색어(서버가 거른다). 기기를 주면 그 기기 것만 고르고, `limit`을 주면 최신 그 개수만 남긴다 (서버 조회에는 기기·개수 조건이 없어 앱에서 줄인다).
 * 열린 알람의 구성이 바뀔 때마다(발생·확인·해제) 다시 불러와 실시간으로 맞춘다.
 */
export function useAlarmHistory({ deviceId, limit, filter, now = Date.now }: { deviceId?: DeviceId; limit?: number; filter?: AlarmFilter; now?: () => number } = {}): AlarmHistory {
  const [alarms, setAlarms] = useState<Alarm[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const filterFrom = filter?.from;
  const filterTo = filter?.to;
  const filterQ = filter?.q;
  const signature = useAppSelector((state) =>
    Object.values(state.alarms.byId)
      .map((a) => `${a.id}:${a.state}`)
      .sort()
      .join(','),
  );

  useEffect(() => {
    let cancelled = false;
    const from = filterFrom ?? new Date(now() - DAYS * 86_400_000).toISOString();
    setLoading(true);
    getAlarms({ from, ...(filterTo ? { to: filterTo } : {}), ...(filterQ ? { q: filterQ } : {}) })
      .then((list) => {
        if (cancelled) return;
        setAlarms(
          list
            .filter((a) => !deviceId || a.deviceId === deviceId)
            .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
            .slice(0, limit),
        );
        setError(false);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, limit, signature, reload, now, filterFrom, filterTo, filterQ]);

  return { alarms, error, loading, retry: () => setReload((n) => n + 1) };
}
