import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import type { DeviceId } from '@ecocycle/shared';
import { canUse, CONTROL_TEXT } from '../../config/controls';
import { DEVICE_NAMES } from '../../config/display';
import { validateSetting } from '../../config/settings';
import type { SettingField } from '../../config/settings';
import { useAppSelector } from '../../store/hooks';
import { selectConnection, selectIsCommandPending, selectPermissions } from '../../store/selectors';
import { Button } from '../common/Button';
import { ConfirmDialog } from './ConfirmDialog';
import { useDeviceCommand } from './useDeviceCommand';

export interface SettingFormProps {
  deviceId: DeviceId;
  field: SettingField;
}

/**
 * 설정값 하나를 바꾸는 폼 (`update_setting`). 위험도가 높아 기기 페이지에서만 쓰고, 반드시 확인 단계를 거쳐 `confirm: true`로 보낸다.
 * 현재 설정값을 읽는 API가 명세에 없어서(docs/questions.md B18) 현재 값은 보여 주지 못하고 마지막으로 보낸 값만 알려 준다.
 * 권한이 없으면(settings.write) 입력과 버튼을 비활성화하고 이유를 보여 준다. 차단은 서버가 한다.
 */
export function SettingForm({ deviceId, field }: SettingFormProps) {
  const inputId = useId();
  const helpId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingValue, setPendingValue] = useState<number | null>(null);
  const [lastSent, setLastSent] = useState<number | null>(null);

  const permissions = useAppSelector(selectPermissions);
  const connection = useAppSelector(selectConnection);
  const busy = useAppSelector(selectIsCommandPending(deviceId, 'update_setting'));
  const send = useDeviceCommand();

  const allowed = canUse(permissions, 'update_setting');
  const online = connection.status === 'online';
  const disabledReason = !allowed ? '설정을 바꿀 권한이 없습니다.' : !online ? '연결이 끊겨 있어 설정을 바꿀 수 없습니다.' : null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (disabledReason || busy) return;
    const result = validateSetting(field, text);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setPendingValue(result.value);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {field.label}
      </label>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            inputMode="decimal"
            autoComplete="off"
            disabled={!!disabledReason}
            aria-describedby={helpId}
            aria-invalid={error ? true : undefined}
            placeholder={`${field.min} ~ ${field.max}`}
            className="min-h-12 w-36 rounded-lg border border-slate-400 px-3 text-base text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
          />
          <span className="text-slate-700">{field.unit}</span>
        </div>
        <Button type="submit" disabled={!!disabledReason} loading={busy}>
          {CONTROL_TEXT.update_setting.label}
        </Button>
      </div>
      <p id={helpId} className="text-xs text-slate-500">
        {field.help}
        {lastSent !== null && ` 마지막으로 보낸 값: ${lastSent}${field.unit}`}
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-status-alarm">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}
      {disabledReason && <p className="text-sm text-slate-600">{disabledReason}</p>}

      <ConfirmDialog
        open={pendingValue !== null}
        title={`${field.label} 변경`}
        message={`${DEVICE_NAMES[deviceId]}의 ${field.label}을(를) ${pendingValue}${field.unit}(으)로 바꿉니다. ${CONTROL_TEXT.update_setting.confirmMessage ?? ''}`}
        confirmLabel="변경"
        onCancel={() => setPendingValue(null)}
        onConfirm={() => {
          if (pendingValue !== null) {
            send(deviceId, { type: 'update_setting', key: field.key, value: pendingValue, confirm: true });
            setLastSent(pendingValue);
            setText('');
          }
          setPendingValue(null);
        }}
      />
    </form>
  );
}
