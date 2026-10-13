import { Link } from 'react-router-dom';
import type { DeviceId, DeviceState } from '@ecocycle/shared';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { DeviceControls } from '../../components/controls/DeviceControls';
import { StatusBadge } from '../../components/status/StatusBadge';
import { Timestamp } from '../../components/status/Timestamp';
import {
  DEVICE_NAMES,
  ROBOT_MODE_TEXT,
  ROBOT_STATUS_TEXT,
  ROBOT_STATUS_TONE,
  PHASE_STEPS,
  formatLoadPercent,
  formatPercent,
  formatPressureMpa,
  formatTemperatureC,
  formatVolumeM3,
} from '../../config/display';
import { devicePagePath } from '../../config/navigation';
import { deviceSelected } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectAlarmsForDevice, selectDevice } from '../../store/selectors';
import { useDisplayStatus } from '../../components/status/useDisplayStatus';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-base font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function rows(device: DeviceState): Array<[string, string]> {
  switch (device.type) {
    case 'tank':
      return [
        ['적재율', formatPercent(device.fillPercent)],
        ['부피(용량)', `${formatVolumeM3(device.volumeM3)} / ${formatVolumeM3(device.capacityM3)}`],
        ['수분', formatPercent(device.moisturePercent)],
        ['위치', `${device.section} 구역`],
      ];
    case 'robot':
      return [
        ['모드', ROBOT_MODE_TEXT[device.mode]],
        ['동작 단계', PHASE_STEPS.find((s) => s.phase === device.phase)?.label ?? '대기'],
        ['작업 중 탱크', device.targetTankId ? DEVICE_NAMES[device.targetTankId] : '없음'],
        ['그리퍼', device.gripper.holding ? '파지를 잡고 있음' : device.gripper.closed ? '닫힘' : '열림'],
      ];
    case 'conveyor':
      return [
        ['가동 상태', device.running ? '가동' : '정지'],
        ['적재 정도', formatLoadPercent(device.loadPercent)],
      ];
    case 'compressor':
      return [
        ['가동 상태', device.running ? '가동' : '정지'],
        ['압력', formatPressureMpa(device.pressureMpa)],
        ['온도', formatTemperatureC(device.temperatureC)],
      ];
  }
}

/**
 * 홈에서 기기 카드를 눌렀을 때 오른쪽에 열리는 확대(상세) 화면.
 * 지금 필요한 정보와 위험도 낮은 조작(시작·일시정지 등)만 두고, 설정·이력·위험 조작은 "상세 보기"의 기기 페이지에서 한다.
 */
export function DeviceDetailPanel({ id }: { id: DeviceId }) {
  const dispatch = useAppDispatch();
  const device = useAppSelector(selectDevice(id));
  const alarms = useAppSelector(selectAlarmsForDevice(id));
  const { disconnected, show } = useDisplayStatus();

  const tone = !device
    ? 'offline'
    : show(device.type === 'robot' ? ROBOT_STATUS_TONE[device.status] : device.status);

  return (
    <Card
      title={DEVICE_NAMES[id]}
      aside={
        <div className="flex items-center gap-2">
          {device && <StatusBadge status={tone} label={device.type === 'robot' && !disconnected ? ROBOT_STATUS_TEXT[device.status] : undefined} size="sm" />}
          <Button variant="quiet" aria-label="확대 화면 닫기" onClick={() => dispatch(deviceSelected(null))} className="px-2">
            ✕
          </Button>
        </div>
      }
      aria-label={`${DEVICE_NAMES[id]} 확대 화면`}
      className="flex flex-col gap-3"
    >
      {!device ? (
        <p className="text-slate-500">상태를 불러오는 중…</p>
      ) : (
        <>
          <dl className={disconnected ? 'opacity-60' : undefined}>
            {rows(device).map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
          </dl>
          <p className="text-xs text-slate-500">
            {disconnected ? '마지막으로 받은 값 · ' : ''}마지막 갱신 <Timestamp iso={device.updatedAt} />
          </p>
          {alarms.length > 0 && (
            <ul className="flex flex-col gap-1">
              {alarms.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <StatusBadge status={a.level} size="sm" />
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
          <DeviceControls deviceId={id} context="home" />
        </>
      )}
      <Link
        to={devicePagePath(id)}
        className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-400 px-4 text-base font-medium text-slate-900 active:bg-slate-100"
      >
        상세 보기
      </Link>
    </Card>
  );
}
