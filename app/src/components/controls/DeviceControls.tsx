import { deviceTypeOf } from '@ecocycle/shared';
import type { Command, CommandType, DeviceId } from '@ecocycle/shared';
import { CONTROL_TEXT, canUse, controlsFor } from '../../config/controls';
import { useAppSelector } from '../../store/hooks';
import { selectConnection, selectDevice, selectIsCommandPending, selectPermissions } from '../../store/selectors';
import { CommandButton } from './CommandButton';
import { useDeviceCommand } from './useDeviceCommand';

export interface DeviceControlsProps {
  deviceId: DeviceId;
  /** home: 홈·확대 화면(위험도 낮은 조작만), page: 기기 페이지(전체) */
  context: 'home' | 'page';
  className?: string;
}

/** 값을 고르거나 순서·확인 단계가 있어 버튼 하나로 보낼 수 없는 조작 (다른 컴포넌트가 맡는다) */
const VALUE_CONTROLS: ReadonlySet<CommandType> = new Set(['update_setting', 'set_mode', 'pick_from', 'place_on_conveyor']);

/**
 * 한 기기의 조작 버튼 묶음. 홈과 기기 페이지에서 같은 컴포넌트를 쓴다.
 * 어떤 조작을 어디에 두는지는 config/controls.ts와 shared의 COMMAND_RULES가 정하고, 여기서 목록을 다시 쓰지 않는다.
 * - 보낼 수 있는 권한이 하나도 없으면 아무것도 그리지 않고, 일부만 없으면 비활성화하고 이유를 보여 준다. (표시일 뿐 차단은 서버가 한다)
 * - 연결이 끊겼거나 기기가 offline이면 모두 비활성화하고 이유를 보여 준다.
 * - 값을 고르는 위험 조작은 각자의 컴포넌트가 확인 단계를 거쳐 confirm: true로 보낸다:
 *   `update_setting`은 기기 페이지의 설정 폼(SettingForm), `set_mode`·`pick_from`·`place_on_conveyor`는 운전 모드(RobotModeControl: 로봇팔 페이지와 3D 홈 로봇 패널).
 * - "비상정지"는 만들지 않는다. stop은 일반 정지이며 안전 장치가 아니다.
 */
export function DeviceControls({ deviceId, context, className = '' }: DeviceControlsProps) {
  const deviceType = deviceTypeOf(deviceId);
  const place = context === 'home' ? 'quick' : 'devicePage';
  const types = controlsFor(place, deviceType).filter((t) => !VALUE_CONTROLS.has(t));

  const permissions = useAppSelector(selectPermissions);
  const connection = useAppSelector(selectConnection);
  const device = useAppSelector(selectDevice(deviceId));
  const send = useDeviceCommand();

  if (!types.some((t) => canUse(permissions, t))) return null;

  const groupReason =
    connection.status === 'offline'
      ? '연결 끊김: 서버와 다시 연결될 때까지 조작할 수 없습니다.'
      : connection.status === 'connecting'
        ? '서버에 연결하는 중입니다.'
        : device?.status === 'offline'
          ? '기기와 연결되어 있지 않습니다.'
          : !device
            ? '기기 상태를 불러오는 중입니다.'
            : null;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {groupReason && (
        <p role="note" className="text-sm font-medium text-slate-600">
          {groupReason}
        </p>
      )}
      <div className="device-controls-buttons flex flex-wrap items-start gap-3">
        {types.map((type) => {
          const allowed = canUse(permissions, type);
          const base = { disabledByGroup: !!groupReason, allowed };

          return (
            <ControlButton
              key={type}
              deviceId={deviceId}
              type={type}
              label={CONTROL_TEXT[type].label}
              {...base}
              onClick={() => send(deviceId, { type } as Command)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ControlButtonProps {
  deviceId: DeviceId;
  type: CommandType;
  label: string;
  allowed: boolean;
  disabledByGroup: boolean;
  onClick: () => void;
}

function ControlButton({ deviceId, type, label, allowed, disabledByGroup, onClick }: ControlButtonProps) {
  const pending = useAppSelector(selectIsCommandPending(deviceId, type));
  return (
    <CommandButton
      label={label}
      onClick={onClick}
      pending={pending}
      disabled={!allowed || disabledByGroup}
      reason={!allowed ? '권한이 없습니다' : null}
    />
  );
}
