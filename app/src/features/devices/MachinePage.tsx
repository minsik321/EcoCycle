import type { ReactNode } from 'react';
import { deviceTypeOf } from '@ecocycle/shared';
import type { CompressorId, CompressorState, ConveyorId, ConveyorState } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { DeviceControls } from '../../components/controls/DeviceControls';
import { SettingForm } from '../../components/controls/SettingForm';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import { useDisplayStatus } from '../../components/status/useDisplayStatus';
import { DEVICE_NAMES, HISTORY_METRICS } from '../../config/display';
import { DEVICE_SETTINGS } from '../../config/settings';
import { useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { DeviceAlarmHistory } from '../history/DeviceAlarmHistory';
import { HistoryPanel } from '../history/HistoryPanel';

export interface MachinePageProps<T extends ConveyorState | CompressorState> {
  deviceId: T['id'];
  /** 현재 상태 카드에 보일 [이름, 값] 목록 */
  stats: (device: T) => Array<[string, string]>;
  /** 페이지 맨 아래에 더 둘 것 (서버가 아직 제공하지 않는 항목의 안내 등) */
  extra?: ReactNode;
}

/**
 * 컨베이어·압축기 기기 페이지의 공통 틀: 현재 상태, 조작, 이력 그래프, 설정, 알람 이력.
 * 위험도 높은 설정 변경은 이 페이지에서만, 확인 단계를 거쳐 보낸다.
 */
export function MachinePage<T extends ConveyorState | CompressorState>({ deviceId, stats, extra }: MachinePageProps<T>) {
  const device = useAppSelector(selectDevice(deviceId as ConveyorId | CompressorId));
  const { disconnected, show } = useDisplayStatus();
  const type = deviceTypeOf(deviceId);
  const machine = device && device.type === type ? (device as T) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{DEVICE_NAMES[deviceId]}</h1>
        {machine && <StatusBadge status={show(machine.status)} />}
        {machine && (
          <span className="text-xs text-slate-500">
            {disconnected ? '마지막으로 받은 값 · ' : ''}마지막 갱신 <Timestamp iso={machine.updatedAt} />
          </span>
        )}
      </div>

      {!machine ? (
        <p role="status" className="text-slate-500">
          상태를 불러오는 중…
        </p>
      ) : (
        <section aria-label="현재 상태" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats(machine).map(([label, value]) => (
            <Card key={label} title={label}>
              <p className={`text-xl font-bold ${disconnected ? 'text-slate-400' : 'text-slate-900'}`}>{value}</p>
            </Card>
          ))}
        </section>
      )}

      <Card title="조작" aria-label="조작">
        <DeviceControls deviceId={deviceId} context="page" />
      </Card>

      <HistoryPanel deviceId={deviceId} metrics={HISTORY_METRICS[type]} />

      <Card title="설정" aria-label="설정" className="flex flex-col gap-4">
        {DEVICE_SETTINGS[type].map((field) => (
          <SettingForm key={field.key} deviceId={deviceId} field={field} />
        ))}
      </Card>

      <DeviceAlarmHistory deviceId={deviceId} />
      {extra}
    </div>
  );
}
