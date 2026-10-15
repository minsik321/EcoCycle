import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { TANK_IDS } from '@ecocycle/shared';
import type { Command, CommandType, DeviceStatus, RobotMode, RobotState, TankId } from '@ecocycle/shared';
import { CONTROL_TEXT, canUse, controlsFor } from '../../config/controls';
import { DEVICE_NAMES, ROBOT_MODE_HELP, ROBOT_MODE_ORDER, ROBOT_MODE_TEXT, formatLocalClock } from '../../config/display';
import { SECTOR_LABEL } from '../../config/processDisplay';
import { useAppSelector } from '../../store/hooks';
import { selectConnection, selectDevice, selectIsCommandPending, selectPermissions, selectRecentCommands } from '../../store/selectors';
import type { CommandEntryStatus } from '../../store';
import { Card } from '../common/Card';
import { StatusBadge } from '../status/StatusBadge';
import { CommandButton } from './CommandButton';
import { ConfirmDialog } from './ConfirmDialog';
import { useDeviceCommand } from './useDeviceCommand';

/** 마지막 모드 전환 명령의 결과 칩 (command.result 또는 GET /commands/{id}로 store에 쌓인 값) */
const RESULT_VIEW: Record<CommandEntryStatus, { tone: DeviceStatus; symbol: string; text: string }> = {
  sending: { tone: 'offline', symbol: '…', text: '적용 대기' },
  accepted: { tone: 'offline', symbol: '…', text: '적용 대기' },
  completed: { tone: 'normal', symbol: '✓', text: '적용됨' },
  rejected: { tone: 'caution', symbol: '▲', text: '거부됨' },
  failed: { tone: 'alarm', symbol: '✕', text: '실패' },
  unknown: { tone: 'caution', symbol: '?', text: '결과 확인 불가' },
};

const sameSet = (a: readonly TankId[], b: readonly TankId[]) => a.length === b.length && a.every((id) => b.includes(id));
const sectorList = (ids: readonly TankId[]) => ids.map((id) => DEVICE_NAMES[id]).join(', ');

/**
 * 로봇팔 운전 모드: 세 칸 하나(자동 | 자동 · 섹터 지정 | 수동)와 칸마다 필요한 조작 하나.
 * - 칸을 고르는 것은 초안이다. 서버가 확정한 모드에는 "지금" 표시가 붙고, 명령은 "적용"(또는 "집기")을 눌러 확인 단계를 거쳐야 나간다.
 * - 자동 · 섹터 지정: 섹터 칩(여러 개)과 "적용". 수동: "집을 섹터" 선택과 "집기"가 한 줄.
 * - 위험 조작이라 기기 페이지에서만 둔다(set_mode·pick_from, confirm: true). 권한·연결로 막는 것은 표시일 뿐이고 차단은 서버가 한다.
 * - 결과는 마지막 모드 전환 명령의 상태(적용 대기 → 적용됨·거부됨)로 보여 준다. 화면의 모드는 서버 상태가 바뀌어야 바뀐다.
 */
export function RobotModeControl({ className = '' }: { className?: string }) {
  const permissions = useAppSelector(selectPermissions);
  const connection = useAppSelector(selectConnection);
  const device = useAppSelector(selectDevice('robot-1'));
  const robot = device?.type === 'robot' ? device : null;
  // 로봇 조작 권한이 하나도 없으면(열람자) 그리지 않는다. 모드는 주요 수치에서 볼 수 있다
  if (!controlsFor('devicePage', 'robot').some((type) => canUse(permissions, type))) return null;

  const groupReason =
    connection.status === 'offline'
      ? '연결 끊김: 서버와 다시 연결될 때까지 조작할 수 없습니다.'
      : connection.status === 'connecting'
        ? '서버에 연결하는 중입니다.'
        : robot?.status === 'offline'
          ? '기기와 연결되어 있지 않습니다.'
          : !robot
            ? '기기 상태를 불러오는 중입니다.'
            : null;

  return (
    <Card title="운전 모드" aria-label="운전 모드" aside={<LastResult />} className={className}>
      {groupReason && (
        <p role="note" className="mb-3 text-sm font-medium text-ink-soft">
          {groupReason}
        </p>
      )}
      {robot ? (
        <ModeEditor
          key={`${robot.mode}:${robot.pinnedSectors.join(',')}`}
          robot={robot}
          blocked={!!groupReason}
          canMode={canUse(permissions, 'set_mode')}
          canPick={canUse(permissions, 'pick_from')}
        />
      ) : (
        <p className="text-sm text-ink-faint">로봇 상태를 불러오는 중…</p>
      )}
    </Card>
  );
}

function LastResult() {
  const entries = useAppSelector(selectRecentCommands);
  const last = entries.find((e) => e.deviceId === 'robot-1' && e.type === 'set_mode');
  if (!last) return null;
  const view = RESULT_VIEW[last.status];
  return (
    <span role="status" aria-label="모드 전환 결과" className="flex min-w-0 items-center gap-1.5">
      <StatusBadge status={view.tone} symbol={view.symbol} label={view.text} size="sm" />
      <span className="text-xs whitespace-nowrap text-ink-faint">{formatLocalClock(last.createdAt, true)}</span>
    </span>
  );
}

interface Confirming {
  command: Command;
  type: CommandType;
  detail: string;
}

/**
 * 서버 모드·지정 섹터가 바뀌면 부모가 key로 새로 그려 초안을 서버 값으로 되돌린다(적용된 뒤 초안이 남지 않게).
 */
function ModeEditor({ robot, blocked, canMode, canPick }: { robot: RobotState; blocked: boolean; canMode: boolean; canPick: boolean }) {
  const [draft, setDraft] = useState<RobotMode>(robot.mode);
  const [pins, setPins] = useState<TankId[]>(robot.pinnedSectors);
  const [pickTarget, setPickTarget] = useState<TankId>(TANK_IDS[0]);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const modePending = useAppSelector(selectIsCommandPending('robot-1', 'set_mode'));
  const picking = useAppSelector(selectIsCommandPending('robot-1', 'pick_from'));
  const send = useDeviceCommand();
  const groupId = useId();
  const pickReasonId = useId();
  const segments = useRef<Array<HTMLButtonElement | null>>([]);

  // 섹터 칩은 서버 순서(A1·A2·B1·B2)로 보낸다
  const orderedPins = useMemo(() => TANK_IDS.filter((id) => pins.includes(id)), [pins]);

  useEffect(() => {
    if (blocked) setConfirming(null);
  }, [blocked]);

  const modeDisabled = !canMode || blocked || picking;
  const modeReason = !canMode ? '권한이 없습니다' : picking ? '집기를 마친 뒤 전환하세요' : null;
  const askMode = (mode: RobotMode) => {
    const to = mode === 'auto_pinned' ? `${ROBOT_MODE_TEXT[mode]} (${sectorList(orderedPins)})` : ROBOT_MODE_TEXT[mode];
    const command: Command =
      mode === 'auto_pinned' ? { type: 'set_mode', mode, pinnedSectors: orderedPins, confirm: true } : { type: 'set_mode', mode, confirm: true };
    setConfirming({ command, type: 'set_mode', detail: `${ROBOT_MODE_TEXT[robot.mode]} → ${to} · 다음 사이클부터 적용` });
  };

  const onSegmentKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = ROBOT_MODE_ORDER.indexOf(draft);
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + ROBOT_MODE_ORDER.length) % ROBOT_MODE_ORDER.length;
    setDraft(ROBOT_MODE_ORDER[nextIndex]!);
    segments.current[nextIndex]?.focus();
  };

  // 같은 모드(지정 모드는 같은 섹터)면 적용할 것이 없다
  const unchanged = draft === robot.mode && (draft !== 'auto_pinned' || sameSet(orderedPins, robot.pinnedSectors));
  const applyReason = modeReason ?? (draft === 'auto_pinned' && orderedPins.length === 0 ? '섹터를 1개 이상 고르세요' : unchanged ? '지금 적용된 모드입니다' : null);
  const applyDisabled = modeDisabled || modePending || unchanged || (draft === 'auto_pinned' && orderedPins.length === 0);

  const manualNow = robot.mode === 'manual';
  const pickDisabled = !canPick || blocked || !manualNow;
  const pickReason = !canPick ? '권한이 없습니다' : !manualNow ? '수동 모드가 적용된 뒤 집을 수 있습니다' : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="모드"
        aria-describedby={`${groupId}-help`}
        onKeyDown={onSegmentKey}
        className="grid grid-cols-[1fr_1.45fr_1fr] gap-1 rounded-control bg-paper-deep p-1"
      >
        {ROBOT_MODE_ORDER.map((mode, i) => {
          const selected = draft === mode;
          const current = robot.mode === mode;
          return (
            <button
              key={mode}
              ref={(el) => {
                segments.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setDraft(mode)}
              className={`relative flex min-h-12 min-w-0 flex-col items-center justify-center rounded-[calc(var(--radius-control)-4px)] px-1 text-sm leading-tight font-semibold whitespace-nowrap select-none ${
                selected ? 'bg-surface text-ink shadow-soft-1' : 'text-ink-soft active:bg-surface/60'
              }`}
            >
              <span>{ROBOT_MODE_TEXT[mode]}</span>
              {current && <span className="text-[11px] font-medium text-accent-strong">● 지금</span>}
            </button>
          );
        })}
      </div>
      <p id={`${groupId}-help`} className="text-sm text-ink-soft">
        {ROBOT_MODE_HELP[draft]}
      </p>

      {draft === 'auto_pinned' && (
        <fieldset className="flex flex-col gap-2" disabled={modeDisabled || modePending}>
          <legend className="mb-2 text-sm font-semibold text-ink">집을 섹터 (여러 개)</legend>
          <div className="grid grid-cols-4 gap-2">
            {TANK_IDS.map((id) => {
              const on = pins.includes(id);
              const applied = robot.mode === 'auto_pinned' && robot.pinnedSectors.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${DEVICE_NAMES[id]}${applied ? ' (적용됨)' : ''}`}
                  onClick={() => setPins((prev) => (on ? prev.filter((x) => x !== id) : [...prev, id]))}
                  className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-control border text-sm font-semibold whitespace-nowrap select-none disabled:opacity-50 ${
                    on ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink active:bg-paper-deep'
                  }`}
                >
                  <span>
                    {on ? '✓ ' : ''}
                    {SECTOR_LABEL[id]}
                  </span>
                  {applied && <span className={`text-[11px] font-medium ${on ? 'text-white/85' : 'text-accent-strong'}`}>적용됨</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {(draft !== 'manual' || !manualNow) && (
        <CommandButton
          label="적용"
          variant="primary"
          pending={modePending}
          disabled={applyDisabled}
          reason={applyReason}
          onClick={() => askMode(draft)}
        />
      )}

      {draft === 'manual' && (
        <div className="flex flex-col gap-1">
          {/* 이름표·선택·버튼을 한 줄, 같은 높이(48px)와 같은 가운데선에. 이유 글은 이 줄 밖(아래)에 둔다 */}
          <div className="flex items-center gap-2">
            <label htmlFor={`${groupId}-pick`} className="shrink-0 text-sm leading-none whitespace-nowrap text-ink-soft">
              집을 섹터
            </label>
            <select
              id={`${groupId}-pick`}
              value={pickTarget}
              onChange={(e) => setPickTarget(e.target.value as TankId)}
              disabled={pickDisabled || picking}
              aria-describedby={pickReason ? pickReasonId : undefined}
              className="h-12 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-base leading-none text-ink disabled:text-ink-faint"
            >
              {TANK_IDS.map((id) => (
                <option key={id} value={id}>
                  {DEVICE_NAMES[id]}
                </option>
              ))}
            </select>
            <CommandButton
              label="집기"
              pending={picking}
              disabled={pickDisabled}
              onClick={() =>
                setConfirming({
                  command: { type: 'pick_from', tankId: pickTarget, confirm: true },
                  type: 'pick_from',
                  detail: DEVICE_NAMES[pickTarget],
                })
              }
            />
          </div>
          {pickDisabled && pickReason && (
            <span id={pickReasonId} className="text-xs text-ink-faint">
              {pickReason}
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-ink-soft">모드·섹터 변경은 다음 사이클부터 적용됩니다. 진행 중인 집기는 마친 뒤 바뀝니다.</p>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? CONTROL_TEXT[confirming.type].label : ''}
        message={confirming ? `${CONTROL_TEXT[confirming.type].confirmMessage ?? '계속할까요?'} (${confirming.detail})` : ''}
        confirmLabel="실행"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) send('robot-1', confirming.command);
          setConfirming(null);
        }}
      />
    </div>
  );
}
