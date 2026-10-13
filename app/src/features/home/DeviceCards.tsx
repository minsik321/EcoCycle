import type { ReactNode } from 'react';
import type {
  CompressorState,
  ConveyorState,
  DeviceId,
  DeviceState,
  RobotState,
  TankState,
} from '@ecocycle/shared';
import { StatusBadge } from '../../components/status/StatusBadge';
import { BAR_CLASS } from '../../components/status/tone';
import {
  DEVICE_NAMES,
  PHASE_STEPS,
  ROBOT_MODE_TEXT,
  ROBOT_STATUS_TEXT,
  ROBOT_STATUS_TONE,
  formatLoadPercent,
  formatPercent,
  formatPressureMpa,
  formatTemperatureC,
} from '../../config/display';
import { deviceSelected } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { useDisplayStatus } from './useDisplayStatus';

// 홈의 기기 카드. 한 기기당 숫자는 2개 정도로 제한하고, 누르면 오른쪽에 확대(상세) 화면이 열린다.

function CardShell({ id, children }: { id: DeviceId; children: ReactNode }) {
  const dispatch = useAppDispatch();
  const selected = useAppSelector((state) => state.ui.selectedDeviceId === id);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => dispatch(deviceSelected(selected ? null : id))}
      className={`flex min-h-12 w-full flex-col gap-2 rounded-xl border bg-white p-4 text-left shadow-sm active:bg-slate-50 ${
        selected ? 'border-slate-800 ring-2 ring-slate-800' : 'border-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function Title({ id, children }: { id: DeviceId; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-base font-semibold text-slate-800">{DEVICE_NAMES[id]}</span>
      {children}
    </div>
  );
}

export function TankCard({ tank }: { tank: TankState }) {
  const { disconnected, show } = useDisplayStatus();
  const status = show(tank.status);
  const level = Math.min(100, Math.max(0, tank.fillPercent));
  const dim = disconnected ? 'text-slate-400' : 'text-slate-900';
  return (
    <CardShell id={tank.id}>
      <Title id={tank.id}>
        <StatusBadge status={status} size="sm" />
      </Title>
      <div
        role="meter"
        aria-label={`${DEVICE_NAMES[tank.id]} 수위`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level)}
        className="h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className={`h-full ${BAR_CLASS[status]}`} style={{ width: `${level}%` }} />
      </div>
      <div className={`flex items-baseline justify-between ${dim}`}>
        <span className="text-2xl font-bold">{formatPercent(tank.fillPercent)}</span>
        <span className="text-sm">수분 {formatPercent(tank.moisturePercent)}</span>
      </div>
    </CardShell>
  );
}

export function RobotCard({ robot }: { robot: RobotState }) {
  const { disconnected, show } = useDisplayStatus();
  const tone = show(ROBOT_STATUS_TONE[robot.status]);
  const phaseLabel = PHASE_STEPS.find((s) => s.phase === robot.phase)?.label ?? '대기';
  return (
    <CardShell id="robot-1">
      <Title id="robot-1">
        <StatusBadge status={tone} label={disconnected ? undefined : ROBOT_STATUS_TEXT[robot.status]} size="sm" />
      </Title>
      <div className={`flex items-baseline justify-between ${disconnected ? 'text-slate-400' : 'text-slate-900'}`}>
        <span className="text-2xl font-bold">{phaseLabel}</span>
        <span className="text-sm">
          {robot.targetTankId ? DEVICE_NAMES[robot.targetTankId] : '작업 없음'} · {ROBOT_MODE_TEXT[robot.mode]}
        </span>
      </div>
    </CardShell>
  );
}

export function ConveyorCard({ conveyor }: { conveyor: ConveyorState }) {
  const { disconnected, show } = useDisplayStatus();
  return (
    <CardShell id="conveyor-z">
      <Title id="conveyor-z">
        <StatusBadge status={show(conveyor.status)} size="sm" />
      </Title>
      <div className={`flex items-baseline justify-between ${disconnected ? 'text-slate-400' : 'text-slate-900'}`}>
        <span className="text-2xl font-bold">{conveyor.running ? '가동' : '정지'}</span>
        <span className="text-sm">적재 {formatLoadPercent(conveyor.loadPercent)}</span>
      </div>
    </CardShell>
  );
}

export function CompressorCard({ compressor }: { compressor: CompressorState }) {
  const { disconnected, show } = useDisplayStatus();
  return (
    <CardShell id="compressor-1">
      <Title id="compressor-1">
        <StatusBadge status={show(compressor.status)} size="sm" />
      </Title>
      <div className={`flex items-baseline justify-between ${disconnected ? 'text-slate-400' : 'text-slate-900'}`}>
        <span className="text-2xl font-bold">{compressor.running ? '가동' : '정지'}</span>
        <span className="text-sm">
          {formatPressureMpa(compressor.pressureMpa)} · {formatTemperatureC(compressor.temperatureC)}
        </span>
      </div>
    </CardShell>
  );
}

/** 아직 상태를 받지 못한 기기 자리 */
export function PendingCard({ id }: { id: DeviceId }) {
  return (
    <div className="flex min-h-12 flex-col gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4">
      <Title id={id} />
      <span className="text-slate-500">불러오는 중…</span>
    </div>
  );
}

/** 종류에 맞는 카드를 고른다. type으로 구분되는 유니온이라 빠진 종류는 컴파일 오류가 난다. */
export function DeviceCard({ device }: { device: DeviceState }) {
  switch (device.type) {
    case 'tank':
      return <TankCard tank={device} />;
    case 'robot':
      return <RobotCard robot={device} />;
    case 'conveyor':
      return <ConveyorCard conveyor={device} />;
    case 'compressor':
      return <CompressorCard compressor={device} />;
  }
}
