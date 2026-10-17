import { Link } from 'react-router-dom';
import { AckAlarmButton } from '../../components/controls/AckAlarmButton';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { DEVICE_NAMES } from '../../config/display';
import { devicePagePath } from '../../config/navigation';
import { useAppSelector } from '../../store/hooks';
import { selectOpenAlarms } from '../../store/selectors';

const MAX_SHOWN = 3;

/**
 * 열려 있는 알람을 홈 위쪽에 눈에 띄게 보여 준다 (단계와 상관없이). 누르면 그 기기 페이지로 간다.
 * 알람이 없으면 아무것도 그리지 않는다.
 */
export function HomeAlarms() {
  const alarms = useAppSelector(selectOpenAlarms);
  if (alarms.length === 0) return null;
  const shown = alarms.slice(0, MAX_SHOWN);

  return (
    <section aria-label="알람" className="flex flex-col gap-2">
      {shown.map((alarm) => (
        <div
          key={alarm.id}
          className={`flex flex-wrap items-center gap-3 rounded-xl border-2 bg-white p-3 ${
            alarm.level === 'alarm' ? 'border-status-alarm' : 'border-status-caution'
          }`}
        >
          <StatusBadge status={alarm.level} />
          <Link to={devicePagePath(alarm.deviceId)} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center">
            <span className="font-semibold text-slate-900">
              {DEVICE_NAMES[alarm.deviceId]} · {alarm.message}
            </span>
            <span className="text-xs text-slate-500">
              <Timestamp iso={alarm.ts} />
              {alarm.state === 'acknowledged' && ' · 확인함'}
            </span>
          </Link>
          {alarm.state === 'active' && <AckAlarmButton deviceId={alarm.deviceId} alarmId={alarm.id} />}
        </div>
      ))}
      {alarms.length > MAX_SHOWN && (
        <Link to="/alarms" className="flex min-h-12 items-center text-sm font-medium text-slate-700 underline">
          알람 {alarms.length - MAX_SHOWN}건 더 보기
        </Link>
      )}
    </section>
  );
}
