import { useState } from 'react';
import { deviceTypeOf } from '@ecocycle/shared';
import type { Command, CommandType, DeviceId, TankId } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import { CONTROL_TEXT, canUse, controlsFor } from '../../config/controls';
import { DEVICE_NAMES, ROBOT_MODE_TEXT } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectConnection, selectDevice, selectIsCommandPending, selectPermissions } from '../../store/selectors';
import { CommandButton } from './CommandButton';
import { ConfirmDialog } from './ConfirmDialog';
import { useDeviceCommand } from './useDeviceCommand';

export interface DeviceControlsProps {
  deviceId: DeviceId;
  /** home: 홈·확대 화면(위험도 낮은 조작만), page: 기기 페이지(전체) */
  context: 'home' | 'page';
  className?: string;
}

/**
 * 한 기기의 조작 버튼 묶음. 홈과 기기 페이지에서 같은 컴포넌트를 쓴다.
 * 어떤 조작을 어디에 두는지는 config/controls.ts와 shared의 COMMAND_RULES가 정하고, 여기서 목록을 다시 쓰지 않는다.
 * - 보낼 수 있는 권한이 하나도 없으면 아무것도 그리지 않고, 일부만 없으면 비활성화하고 이유를 보여 준다. (표시일 뿐 차단은 서버가 한다)
 * - 연결이 끊겼거나 기기가 offline이면 모두 비활성화하고 이유를 보여 준다.
 * - 위험도 높은 조작은 확인 단계를 거쳐 confirm: true로 보낸다.
 * - `update_setting`(설정 변경)은 값을 입력받는 설정 폼이 필요해서 기기 페이지의 설정 영역이 맡는다.
 * - "비상정지"는 만들지 않는다. stop은 일반 정지이며 안전 장치가 아니다.
 */
export function DeviceControls({ deviceId, context, className = '' }: DeviceControlsProps) {
  const deviceType = deviceTypeOf(deviceId);
  const place = context === 'home' ? 'quick' : 'devicePage';
  const types = controlsFor(place, deviceType).filter((t) => t !== 'update_setting');

  const permissions = useAppSelector(selectPermissions);
  const connection = useAppSelector(selectConnection);
  const device = useAppSelector(selectDevice(deviceId));
  const send = useDeviceCommand();
  const [confirming, setConfirming] = useState<{ command: Command; type: CommandType; detail: string } | null>(null);

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

  const robot = device?.type === 'robot' ? device : null;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {groupReason && (
        <p role="note" className="text-sm font-medium text-slate-600">
          {groupReason}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {types.map((type) => {
          const allowed = canUse(permissions, type);
          const base = { disabledByGroup: !!groupReason, allowed };

          if (type === 'set_mode') {
            if (!robot) return null;
            const next = robot.mode === 'auto' ? 'manual' : 'auto';
            return (
              <ControlButton
                key={type}
                deviceId={deviceId}
                type={type}
                label={`${ROBOT_MODE_TEXT[next]} 모드로 전환`}
                {...base}
                onClick={() =>
                  setConfirming({
                    command: { type: 'set_mode', mode: next, confirm: true },
                    type,
                    detail: `${ROBOT_MODE_TEXT[robot.mode]} → ${ROBOT_MODE_TEXT[next]}`,
                  })
                }
              />
            );
          }

          if (type === 'pick_from') {
            return (
              <PickFromControl
                key={type}
                deviceId={deviceId}
                {...base}
                manualMode={robot?.mode === 'manual'}
                onPick={(tankId) =>
                  setConfirming({
                    command: { type: 'pick_from', tankId, confirm: true },
                    type,
                    detail: DEVICE_NAMES[tankId],
                  })
                }
              />
            );
          }

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

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? CONTROL_TEXT[confirming.type].label : ''}
        message={confirming ? `${CONTROL_TEXT[confirming.type].confirmMessage ?? '계속할까요?'} (${confirming.detail})` : ''}
        confirmLabel="실행"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) send(deviceId, confirming.command);
          setConfirming(null);
        }}
      />
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

function PickFromControl({
  deviceId,
  allowed,
  disabledByGroup,
  manualMode,
  onPick,
}: {
  deviceId: DeviceId;
  allowed: boolean;
  disabledByGroup: boolean;
  manualMode: boolean;
  onPick: (tankId: TankId) => void;
}) {
  const [tankId, setTankId] = useState<TankId>(TANK_IDS[0]);
  const pending = useAppSelector(selectIsCommandPending(deviceId, 'pick_from'));
  const reason = !allowed ? '권한이 없습니다' : !manualMode ? '수동 모드에서만 사용할 수 있습니다' : null;
  const disabled = !allowed || disabledByGroup || !manualMode;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <label className="flex flex-col gap-1 text-xs text-slate-600">
        집을 섹터
        <select
          value={tankId}
          onChange={(e) => setTankId(e.target.value as TankId)}
          disabled={disabled || pending}
          className="min-h-12 rounded-lg border border-slate-400 bg-white px-3 text-base text-slate-900 disabled:text-slate-400"
        >
          {TANK_IDS.map((id) => (
            <option key={id} value={id}>
              {DEVICE_NAMES[id]}
            </option>
          ))}
        </select>
      </label>
      <div className="self-end">
        <CommandButton
          label={CONTROL_TEXT.pick_from.label}
          onClick={() => onPick(tankId)}
          pending={pending}
          disabled={disabled}
          reason={reason}
        />
      </div>
    </div>
  );
}
