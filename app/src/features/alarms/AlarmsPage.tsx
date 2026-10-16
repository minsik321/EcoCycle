import { useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Link, useSearchParams } from 'react-router-dom';
import { DEVICE_IDS } from '@ecocycle/shared';
import type { Alarm, DeviceId } from '@ecocycle/shared';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { AckAlarmButton } from '../../components/controls/AckAlarmButton';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { DEVICE_NAMES } from '../../config/display';
import { alarmsPath, devicePagePath } from '../../config/navigation';
import { useAppSelector } from '../../store/hooks';
import { selectIsDisconnected, selectOpenAlarms } from '../../store/selectors';
import { ALARM_STATE_TEXT } from '../history/DeviceAlarmHistory';
import { useAlarmHistory } from '../history/useAlarmHistory';

type Tab = 'open' | 'history';

function AlarmRow({ alarm }: { alarm: Alarm }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <StatusBadge status={alarm.level} size="sm" />
      {/* 누르면 해당 기기 페이지로 간다 */}
      <Link to={devicePagePath(alarm.deviceId)} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center">
        <span className="font-semibold text-slate-900">
          {DEVICE_NAMES[alarm.deviceId]} · {alarm.message}
        </span>
        <span className="text-xs text-slate-500">
          <Timestamp iso={alarm.ts} />
        </span>
      </Link>
      <span className="text-sm text-slate-600">{ALARM_STATE_TEXT[alarm.state]}</span>
      {alarm.state === 'active' && <AckAlarmButton deviceId={alarm.deviceId} alarmId={alarm.id} />}
    </li>
  );
}

/**
 * 알람 화면: 열려 있는 알람(발생 중·확인함)과 최근 7일 이력.
 * 열린 알람은 실시간으로 바뀌고, 누르면 해당 기기 페이지로 간다. 확인 처리는 위험도가 낮아 여기서도 한다.
 */
export function AlarmsPage() {
  // 기기 페이지의 "전체 알람 보기"로 오면 `?device=`가 붙어 그 기기 알람만 보이고 이력 탭으로 열린다
  const [params] = useSearchParams();
  const requested = params.get('device');
  const deviceId = DEVICE_IDS.find((id) => id === requested) as DeviceId | undefined;
  const [tab, setTab] = useState<Tab>(deviceId ? 'history' : 'open');
  const allOpen = useAppSelector(selectOpenAlarms);
  const open = deviceId ? allOpen.filter((a) => a.deviceId === deviceId) : allOpen;
  const disconnected = useAppSelector(selectIsDisconnected);
  const history = useAlarmHistory({ deviceId });

  return (
    <PageContainer>
      <h1 className="text-xl font-bold">알람</h1>
      {deviceId && (
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-soft">
          <span>{DEVICE_NAMES[deviceId]} 알람만 보는 중</span>
          <Link to={alarmsPath()} className="inline-flex min-h-12 items-center font-semibold text-accent-strong underline">
            모든 기기 보기
          </Link>
        </p>
      )}
      <div role="group" aria-label="보기" className="flex gap-2">
        <Button variant={tab === 'open' ? 'primary' : 'secondary'} aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
          열린 알람 {open.length}건
        </Button>
        <Button variant={tab === 'history' ? 'primary' : 'secondary'} aria-pressed={tab === 'history'} onClick={() => setTab('history')}>
          최근 7일 이력
        </Button>
      </div>

      {tab === 'open' ? (
        <Card aria-label="열린 알람">
          {disconnected && (
            <p role="status" className="mb-2 text-sm font-medium text-slate-600">
              연결이 끊겨 있어 마지막으로 받은 알람 목록입니다. 새 알람이나 해제가 반영되지 않았을 수 있습니다.
            </p>
          )}
          {open.length === 0 ? <p className="text-slate-500">열린 알람이 없습니다.</p> : <ul className="divide-y divide-slate-100">{open.map((a) => <AlarmRow key={a.id} alarm={a} />)}</ul>}
        </Card>
      ) : (
        <Card aria-label="알람 이력">
          {history.error ? (
            <div role="alert" className="flex items-center gap-3">
              <span className="text-status-alarm">알람 이력을 불러오지 못했습니다.</span>
              <Button onClick={history.retry}>다시 시도</Button>
            </div>
          ) : history.alarms === null ? (
            <p role="status" className="text-slate-500">
              불러오는 중…
            </p>
          ) : history.alarms.length === 0 ? (
            <p className="text-slate-500">최근 7일간 알람이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.alarms.map((a) => (
                <AlarmRow key={a.id} alarm={a} />
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageContainer>
  );
}
