import type { Alarm, DeviceId } from '@ecocycle/shared';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { useAlarmHistory } from './useAlarmHistory';

export const ALARM_STATE_TEXT: Record<Alarm['state'], string> = { active: '발생 중', acknowledged: '확인함', cleared: '해제됨' };
const MAX_ROWS = 20;

/** 이 기기의 알람 이력(최근 7일). 열린 알람이 바뀔 때마다 실시간으로 맞춘다. */
export function DeviceAlarmHistory({
  deviceId,
  title = '알람 이력 (최근 7일)',
  now = Date.now,
}: {
  deviceId: DeviceId;
  title?: string;
  now?: () => number;
}) {
  const { alarms, error, retry } = useAlarmHistory({ deviceId, now });
  const rows = alarms?.slice(0, MAX_ROWS) ?? null;

  return (
    <Card title={title} aria-label={title}>
      {error ? (
        <div role="alert" className="flex items-center gap-3">
          <span className="text-status-alarm">알람 이력을 불러오지 못했습니다.</span>
          <Button onClick={retry}>다시 시도</Button>
        </div>
      ) : rows === null ? (
        <p role="status" className="text-slate-500">
          불러오는 중…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-slate-500">최근 7일간 알람이 없습니다.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
              <StatusBadge status={a.level} size="sm" />
              <span className="min-w-0 flex-1 text-slate-900">{a.message}</span>
              <span className="text-sm text-slate-600">{ALARM_STATE_TEXT[a.state]}</span>
              <Timestamp iso={a.ts} className="text-sm text-slate-500" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
