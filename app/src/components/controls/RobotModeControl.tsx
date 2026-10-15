import { useState } from 'react';
import type { CommandOf, RobotState, TankId } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import { DEVICE_NAMES, ROBOT_MODE_TEXT } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectIsCommandPending } from '../../store/selectors';
import { CommandButton } from './CommandButton';

/** 모드 초안은 서버 확정값과 분리한다. 부모의 기존 확인 대화상자로만 명령을 보낸다. */
export function RobotModeControl({ robot, allowed, disabledByGroup, onMode }: {
  robot: RobotState; allowed: boolean; disabledByGroup: boolean;
  onMode: (command: CommandOf<'set_mode'>) => void;
}) {
  const [pins, setPins] = useState<TankId[]>(robot.pinnedSectors ?? []);
  const pending = useAppSelector(selectIsCommandPending(robot.id, 'set_mode'));
  const picking = useAppSelector(selectIsCommandPending(robot.id, 'pick_from'));
  const disabled = !allowed || disabledByGroup || picking;
  const reason = !allowed ? '권한이 없습니다' : picking ? '집기를 마친 뒤 전환하세요' : null;
  return <div className="flex w-full flex-col gap-3 border-t border-line pt-3">
    <p className="text-sm text-ink-soft">현재 모드: <strong className="text-ink">{disabledByGroup ? '–' : ROBOT_MODE_TEXT[robot.mode]}</strong></p>
    <div className="flex flex-wrap items-start gap-2" aria-label="모드 전환">
      {(['auto', 'manual'] as const).map(mode => <CommandButton key={mode}
        label={`${ROBOT_MODE_TEXT[mode]} 모드로 전환`} pending={pending}
        disabled={disabled || robot.mode === mode} reason={reason}
        onClick={() => onMode({ type: 'set_mode', mode, confirm: true })} />)}
    </div>
    <p className="text-xs text-ink-soft">자동은 배치 계획을 따릅니다. 수동은 섹터를 골라 한 번씩 집습니다.</p>
    {robot.mode === 'auto_pinned' && <div className="rounded-control border border-accent bg-accent-soft p-3 text-sm text-ink">
      <p role="status" className="font-semibold">지정된 섹터: {disabledByGroup ? '–' : robot.pinnedSectors.map(id => <span key={id} className="mr-2 inline-block whitespace-nowrap">{DEVICE_NAMES[id]}</span>)}</p>
      <p className="mt-1 whitespace-normal">선택 섹터만 자동으로 집습니다. 위의 ‘자동 모드로 전환’으로 지정을 해제하고 배치 계획으로 복귀합니다.</p>
    </div>}
    <fieldset disabled={disabled || pending} className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold text-ink">자동 · 섹터 지정</legend>
      <p className="text-xs text-ink-soft">섹터를 1개 이상 선택하세요. 선택은 적용 전 초안입니다.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TANK_IDS.map(id => <label key={id} className="flex min-h-12 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm text-ink">
          <input type="checkbox" checked={pins.includes(id)} onChange={e => setPins(prev => e.target.checked ? [...prev, id] : prev.filter(x => x !== id))} />
          {DEVICE_NAMES[id]}
        </label>)}
      </div>
    </fieldset>
    <CommandButton label="자동 · 섹터 지정 적용" pending={pending} disabled={disabled || !pins.length} reason={reason ?? (!pins.length ? '섹터를 1개 이상 선택하세요' : null)}
      onClick={() => onMode({ type: 'set_mode', mode: 'auto_pinned', pinnedSectors: [...pins], confirm: true })} />
    <p className="text-xs text-ink-soft">모드·섹터 변경은 다음 사이클부터 적용됩니다. 진행 중인 집기는 마친 뒤 전환합니다.</p>
  </div>;
}
