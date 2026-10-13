import { useEffect, useState } from 'react';
import type { Alarm, DeviceId } from '@ecocycle/shared';
import { getAlarms } from '../../api';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { useAppSelector } from '../../store/hooks';

const STATE_TEXT: Record<Alarm['state'], string> = { active: '발생 중', acknowledged: '확인함', cleared: '해제됨' };
const DAYS = 7;
const MAX_ROWS = 20;

/**
 * 이 기기의 알람 이력(최근 7일). 열린 알람이 바뀔 때마다(발생·확인·해제) 다시 불러와 실시간으로 맞춘다.
 * 서버 조회에는 기기 조건이 없어서 받은 뒤 이 기기 것만 고른다.
 */
export function DeviceAlarmHistory({ deviceId, now = Date.now }: { deviceId: DeviceId; now?: () => number }) {
  const [alarms, setAlarms] = useState<Alarm[] | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  // 열린 알람의 구성이 바뀌면 이력도 바뀐다
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
            .filter((a) => a.deviceId === deviceId)
            .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
            .slice(0, MAX_ROWS),
        );
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceId, signature, reload, now]);

  return (
    <Card title="알람 이력 (최근 7일)" aria-label="알람 이력">
      {error ? (
        <div role="alert" className="flex items-center gap-3">
          <span className="text-status-alarm">알람 이력을 불러오지 못했습니다.</span>
          <Button onClick={() => setReload((n) => n + 1)}>다시 시도</Button>
        </div>
      ) : alarms === null ? (
        <p role="status" className="text-slate-500">
          불러오는 중…
        </p>
      ) : alarms.length === 0 ? (
        <p className="text-slate-500">최근 7일간 알람이 없습니다.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {alarms.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
              <StatusBadge status={a.level} size="sm" />
              <span className="min-w-0 flex-1 text-slate-900">{a.message}</span>
              <span className="text-sm text-slate-600">{STATE_TEXT[a.state]}</span>
              <Timestamp iso={a.ts} className="text-sm text-slate-500" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
