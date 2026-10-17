import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { deviceTypeOf } from '@ecocycle/shared';
import type { DeviceId } from '@ecocycle/shared';
import { canUse, controlsFor } from '../../config/controls';
import { useAppSelector } from '../../store/hooks';
import { selectAlarmsForDevice, selectPermissions } from '../../store/selectors';
import { AckAlarmButton } from '../controls/AckAlarmButton';
import { DeviceControls } from '../controls/DeviceControls';

/**
 * 조작 줄의 모양. 좁은 화면에서는 가장자리까지 닿는 띠, 넓은 화면에서는 카드다.
 * 화면 아래에 붙이는 것(sticky)은 DevicePage가 한다 (감싸는 칸 안에서만 붙어 있을 수 있어서).
 */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <section aria-label="조작" className="glass rounded-none border-x-0 border-b-0 px-4 py-2 md:rounded-card md:border md:p-4">
      {children}
    </section>
  );
}

/**
 * 기기 페이지의 조작 줄: 시작·일시정지·재개·정지와 이 기기의 알람 확인.
 * 위험도 낮은 조작만 둔다(설정 변경·모드 전환 같은 위험 조작은 "자세히" 안에서 확인 단계를 거친다).
 * 쓸 수 있는 조작이 하나도 없으면(권한 없음, 확인할 알람 없음) 아무것도 그리지 않는다. 표시일 뿐 차단은 서버가 한다.
 */
export function DeviceActionBar({ deviceId }: { deviceId: DeviceId }) {
  const permissions = useAppSelector(selectPermissions);
  const alarms = useAppSelector(useMemo(() => selectAlarmsForDevice(deviceId), [deviceId]));
  const showControls = controlsFor('quick', deviceTypeOf(deviceId)).some((type) => canUse(permissions, type));
  // 가장 최근에 울린 알람 하나만 둔다. 나머지는 알람 화면에서 확인한다
  const alarm = canUse(permissions, 'ack_alarm') ? alarms.find((a) => a.state === 'active') : undefined;

  if (!showControls && !alarm) return null;
  return (
    <ActionBar>
      <div className="flex flex-wrap items-start gap-3">
        {showControls && <DeviceControls deviceId={deviceId} context="home" />}
        {alarm && (
          <div className="flex min-w-0 items-center gap-2">
            <AckAlarmButton deviceId={deviceId} alarmId={alarm.id} />
            <span className="min-w-0 text-sm text-ink-soft">{alarm.message}</span>
          </div>
        )}
      </div>
    </ActionBar>
  );
}
