import type { DeviceId } from '@ecocycle/shared';
import { canUse } from '../../config/controls';
import { useAppSelector } from '../../store/hooks';
import { selectConnection, selectIsCommandPending, selectPermissions } from '../../store/selectors';
import { CommandButton } from './CommandButton';
import { useDeviceCommand } from './useDeviceCommand';

export interface AckAlarmButtonProps {
  /** 알람이 속한 기기. 알람 확인은 그 기기의 경로로 보낸다 (docs/questions.md B16) */
  deviceId: DeviceId;
  alarmId: string;
}

/** 알람 확인 처리. 위험도가 낮아 홈에서도 쓴다. 권한이 없으면 아무것도 그리지 않는다. */
export function AckAlarmButton({ deviceId, alarmId }: AckAlarmButtonProps) {
  const permissions = useAppSelector(selectPermissions);
  const connection = useAppSelector(selectConnection);
  const pending = useAppSelector(selectIsCommandPending(deviceId, 'ack_alarm'));
  const send = useDeviceCommand();

  if (!canUse(permissions, 'ack_alarm')) return null;
  const disconnected = connection.status !== 'online';
  return (
    <CommandButton
      label="알람 확인"
      pending={pending}
      disabled={disconnected}
      reason={disconnected ? '연결 끊김' : null}
      onClick={() => send(deviceId, { type: 'ack_alarm', alarmId })}
    />
  );
}
