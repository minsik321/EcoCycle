import { Link } from 'react-router-dom';
import type { Alarm, DeviceId } from '@ecocycle/shared';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { alarmsPath } from '../../config/navigation';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { useAlarmHistory } from './useAlarmHistory';

export const ALARM_STATE_TEXT: Record<Alarm['state'], string> = { active: '발생 중', acknowledged: '확인함', cleared: '해제됨' };
/** 기기 페이지 자세히에는 최신 5건만 불러온다. 더 보려면 알람 화면(그 기기로 걸러서) */
export const ALARM_HISTORY_LIMIT = 5;

/**
 * 이 기기의 알람 이력(최근 7일 중 최신 5건). 열린 알람이 바뀔 때마다 실시간으로 맞춘다.
 * 목록은 자세히 칸 높이에 맞춘 최대 높이 안에서 스스로 스크롤해 자세히가 길어지지 않고, 아래 링크로 알람 화면(이 기기만)을 연다.
 */
export function DeviceAlarmHistory({
  deviceId,
  title = '알람 이력 (최근 7일)',
  now = Date.now,
}: {
  deviceId: DeviceId;
  title?: string;
  now?: () => number;
}) {
  const { alarms, error, retry } = useAlarmHistory({ deviceId, limit: ALARM_HISTORY_LIMIT, now });
  const rows = alarms;

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
        <ul tabIndex={0} aria-label={`${title} 목록`} className="flex max-h-56 flex-col divide-y divide-slate-100 overflow-y-auto overscroll-contain">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2">
              <StatusBadge status={a.level} size="sm" />
              <span className="min-w-0 flex-[1_1_9rem] text-slate-900">{a.message}</span>
              <span className="text-sm text-slate-600">{ALARM_STATE_TEXT[a.state]}</span>
              <Timestamp iso={a.ts} className="text-sm text-slate-500" />
            </li>
          ))}
        </ul>
      )}
      <Link to={alarmsPath(deviceId)} className="mt-2 inline-flex min-h-12 items-center text-sm font-semibold text-accent-strong underline">
        전체 알람 보기
      </Link>
    </Card>
  );
}
