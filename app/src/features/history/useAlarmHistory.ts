import { useEffect, useState } from 'react';
import type { Alarm, DeviceId } from '@ecocycle/shared';
import { getAlarms } from '../../api';
import { useAppSelector } from '../../store/hooks';

const DAYS = 7;

export interface AlarmHistory {
  /** 최신순. 아직 못 받았으면 null */
  alarms: Alarm[] | null;
  error: boolean;
  retry: () => void;
}

/**
 * 최근 7일 알람 이력. 기기를 주면 그 기기 것만 고르고, `limit`을 주면 최신 그 개수만 남긴다 (서버 조회에는 기기·개수 조건이 없어 앱에서 줄인다).
 * 열린 알람의 구성이 바뀔 때마다(발생·확인·해제) 다시 불러와 실시간으로 맞춘다.
 */
export function useAlarmHistory({ deviceId, limit, now = Date.now }: { deviceId?: DeviceId; limit?: number; now?: () => number } = {}): AlarmHistory {
  const [alarms, setAlarms] = useState<Alarm[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const signature = useAppSelector((state) =>
    Object.values(state.alarms.byId)
      .map((a) => `${a.id}:${a.state}`)
      .sort()
      .join(','),
  );

  useEffect(() => {
    let cancelled = false;
    const from = new Date(now() - DAYS * 86_400_000).toISOString();
    getAlarms({ from })
      .then((list) => {
        if (cancelled) return;
        setAlarms(
          list
            .filter((a) => !deviceId || a.deviceId === deviceId)
            .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
            .slice(0, limit),
        );
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, limit, signature, reload, now]);

  return { alarms, error, retry: () => setReload((n) => n + 1) };
}
