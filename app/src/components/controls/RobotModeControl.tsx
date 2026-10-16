import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { TANK_IDS } from '@ecocycle/shared';
import type { Command, CommandType, DeviceStatus, RobotMode, RobotState, TankId } from '@ecocycle/shared';
import { CONTROL_TEXT, canUse, controlsFor } from '../../config/controls';
import { DEVICE_NAMES, ROBOT_MODE_HELP, ROBOT_MODE_ORDER, ROBOT_MODE_TEXT, formatLocalClock } from '../../config/display';
import { SECTOR_LABEL, robotHoldText } from '../../config/processDisplay';
import { useAppSelector } from '../../store/hooks';
import { selectConnection, selectDevice, selectIsCommandPending, selectPermissions, selectRecentCommands } from '../../store/selectors';
import type { CommandEntryStatus } from '../../store';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { TABLET_QUERY } from '../device/DevicePage';
import { useMediaQuery } from '../device/DetailsSection';
import { StatusBadge } from '../status/StatusBadge';
import { CommandButton } from './CommandButton';
import { ConfirmDialog } from './ConfirmDialog';
import { useDeviceCommand } from './useDeviceCommand';

/** 마지막 로봇 명령(모드 전환·집기·놓기)의 결과 칩 (command.result 또는 GET /commands/{id}로 store에 쌓인 값) */
const RESULT_VIEW: Record<CommandEntryStatus, { tone: DeviceStatus; symbol: string; text: string }> = {
  sending: { tone: 'offline', symbol: '…', text: '적용 대기' },
  accepted: { tone: 'offline', symbol: '…', text: '적용 대기' },
  completed: { tone: 'normal', symbol: '✓', text: '적용됨' },
  rejected: { tone: 'caution', symbol: '▲', text: '거부됨' },
  failed: { tone: 'alarm', symbol: '✕', text: '실패' },
  unknown: { tone: 'caution', symbol: '?', text: '결과 확인 불가' },
};

/** 이 컴포넌트가 보내는 명령 (결과 칩이 보는 것) */
const ROBOT_COMMANDS: readonly CommandType[] = ['set_mode', 'pick_from', 'place_on_conveyor'];

const sameSet = (a: readonly TankId[], b: readonly TankId[]) => a.length === b.length && a.every((id) => b.includes(id));
const sectorList = (ids: readonly TankId[]) => ids.map((id) => DEVICE_NAMES[id]).join(', ');

export interface RobotModeControlProps {
  className?: string;
  /**
   * page: 로봇팔 기기 페이지의 카드(태블릿부터 "적용"은 세 칸 오른쪽).
   * panel: 3D 홈 로봇 상세 패널 안(카드 틀 없이, 좁은 패널이라 늘 폰 배치).
   */
  variant?: 'page' | 'panel';
}

/**
 * 로봇팔 운전 모드: 세 칸 하나(자동 | 자동 · 섹터 지정 | 수동)와 칸마다 필요한 조작. 기기 페이지와 3D 홈 로봇 패널이 같은 컴포넌트를 쓴다.
 * - 칸을 고르는 것은 초안이다. 서버가 확정한 모드에는 "지금" 표시가 붙고, 명령은 "적용"을 눌러 확인 단계를 거쳐야 나간다.
 *   "적용"은 줄 하나를 차지하지 않는다: 태블릿·데스크톱은 세 칸 오른쪽, 폰(과 패널)은 섹터 칩 줄의 마지막 칩(지정 모드), 그 밖에는 안내 글 오른쪽.
 *   바꾼 것이 없으면 비활성.
 * - 수동: 한 사이클을 두 번 나눠 조작한다. "집기"(고른 섹터에서 집어 듦) → "컨베이어에 놓기". 사이의 상태("A1에서 집음 · 놓기 대기")를 보여 주고,
 *   들고 있는 동안 "집기"는, 들고 있지 않은 동안 "컨베이어에 놓기"는 비활성이다. 순서는 서버가 다시 검사한다(409).
 * - 위험 조작이라 모두 확인 단계(confirm: true)를 거친다. 권한·연결로 막는 것은 표시일 뿐이고 차단은 서버가 한다.
 * - 기기 페이지는 로봇 조작 권한이 하나도 없으면(열람자) 그리지 않고, 3D 홈 패널은 이 조작들(robot.manual)의 권한이 없으면 그리지 않는다.
 *   상태는 주요 수치(기기 페이지)·상세 행(3D 홈)에서 볼 수 있다.
 * - 결과는 마지막 로봇 명령의 상태(적용 대기 → 적용됨·거부됨)로 보여 준다. 화면의 모드는 서버 상태가 바뀌어야 바뀐다.
 */
export function RobotModeControl({ className = '', variant = 'page' }: RobotModeControlProps) {
  const permissions = useAppSelector(selectPermissions);
  const connection = useAppSelector(selectConnection);
  const device = useAppSelector(selectDevice('robot-1'));
  const tablet = useMediaQuery(TABLET_QUERY);
  const robot = device?.type === 'robot' ? device : null;
  // 기기 페이지: 로봇 조작 권한이 하나라도 있으면(작업자) 보이되 위험 조작은 비활성과 이유로. 열람자는 그리지 않는다.
  // 3D 홈 패널: 이 조작들의 권한이 없으면 그리지 않는다(상태는 패널의 행이 보여 준다)
  const relevant = variant === 'panel' ? ROBOT_COMMANDS : controlsFor('devicePage', 'robot');
  if (!relevant.some((type) => canUse(permissions, type))) return null;

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

  const body = (
    <>
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
          inline={variant === 'page' && tablet}
          canMode={canUse(permissions, 'set_mode')}
          canPick={canUse(permissions, 'pick_from')}
          canPlace={canUse(permissions, 'place_on_conveyor')}
        />
      ) : (
        <p className="text-sm text-ink-faint">로봇 상태를 불러오는 중…</p>
      )}
    </>
  );

  if (variant === 'panel') {
    return (
      <section aria-label="운전 모드" className={`flex flex-col gap-2 ${className}`}>
        <header className="flex min-w-0 items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink-soft">운전 모드</h3>
          <LastResult />
        </header>
        {body}
      </section>
    );
  }
  return (
    <Card title="운전 모드" aria-label="운전 모드" aside={<LastResult />} className={className}>
      {body}
    </Card>
  );
}

function LastResult() {
  const entries = useAppSelector(selectRecentCommands);
  const last = entries.find((e) => e.deviceId === 'robot-1' && ROBOT_COMMANDS.includes(e.type));
  if (!last) return null;
  const view = RESULT_VIEW[last.status];
  return (
    <span role="status" aria-label="로봇 명령 결과" className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-xs whitespace-nowrap text-ink-soft">{CONTROL_TEXT[last.type].label}</span>
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

interface ModeEditorProps {
  robot: RobotState;
  blocked: boolean;
  /** "적용"을 세 칸 오른쪽에 (태블릿·데스크톱의 기기 페이지) */
  inline: boolean;
  canMode: boolean;
  canPick: boolean;
  canPlace: boolean;
}

/**
 * 서버 모드·지정 섹터가 바뀌면 부모가 key로 새로 그려 초안을 서버 값으로 되돌린다(적용된 뒤 초안이 남지 않게).
 */
function ModeEditor({ robot, blocked, inline, canMode, canPick, canPlace }: ModeEditorProps) {
  const [draft, setDraft] = useState<RobotMode>(robot.mode);
  const [pins, setPins] = useState<TankId[]>(robot.pinnedSectors);
  const [pickTarget, setPickTarget] = useState<TankId>(TANK_IDS[0]);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const modePending = useAppSelector(selectIsCommandPending('robot-1', 'set_mode'));
  const picking = useAppSelector(selectIsCommandPending('robot-1', 'pick_from'));
  const placing = useAppSelector(selectIsCommandPending('robot-1', 'place_on_conveyor'));
  const send = useDeviceCommand();
  const groupId = useId();
  const segments = useRef<Array<HTMLButtonElement | null>>([]);

  // 섹터 칩은 서버 순서(A1·A2·B1·B2)로 보낸다
  const orderedPins = useMemo(() => TANK_IDS.filter((id) => pins.includes(id)), [pins]);

  useEffect(() => {
    if (blocked) setConfirming(null);
  }, [blocked]);

  const manualNow = robot.mode === 'manual';
  const holding = robot.heldSectorId !== null;
  const manualBusy = picking || placing;
  // 수동으로 집어 든 채 모드를 바꾸면 들고 있는 것이 어디로 갈지 모른다(서버도 409)
  const holdBlocksMode = manualNow && holding;

  const modeDisabled = !canMode || blocked || manualBusy || holdBlocksMode;
  const modeReason = !canMode
    ? '권한이 없습니다'
    : holdBlocksMode
      ? '집어 든 파지를 먼저 컨베이어에 놓으세요'
      : manualBusy
        ? '집기·놓기를 마친 뒤 전환하세요'
        : null;
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
  const noPins = draft === 'auto_pinned' && orderedPins.length === 0;
  const applyReason = modeReason ?? (noPins ? '섹터를 1개 이상 고르세요' : unchanged ? '바꾼 것이 없습니다' : null);
  const applyDisabled = modeDisabled || modePending || unchanged || noPins;
  const applyReasonId = `${groupId}-apply-reason`;

  // 수동 두 단계: 집기는 들고 있지 않을 때, 놓기는 들고 있을 때만. 작업 중(phase ≠ idle)에는 둘 다 기다린다
  const working = robot.phase !== 'idle';
  const pickDisabled = !canPick || blocked || !manualNow || holding || working || manualBusy;
  const pickReason = !canPick
    ? '권한이 없습니다'
    : !manualNow
      ? '수동 모드가 적용된 뒤 집을 수 있습니다'
      : holding
        ? '먼저 컨베이어에 놓으세요'
        : working && !manualBusy
          ? '로봇이 작업 중입니다'
          : null;
  const placeDisabled = !canPlace || blocked || !manualNow || !holding || working || manualBusy;
  const placeReason = !canPlace ? '권한이 없습니다' : manualNow && !holding && !working && !manualBusy ? '먼저 집기를 하세요' : null;

  const applyButton = (chip: boolean) => (
    <Button
      variant="primary"
      onClick={() => askMode(draft)}
      disabled={applyDisabled}
      loading={modePending}
      aria-describedby={applyDisabled && applyReason ? applyReasonId : undefined}
      className={chip ? 'w-full min-w-0 px-1 text-sm' : 'shrink-0'}
    >
      {modePending ? '적용 중' : '적용'}
    </Button>
  );
  // 지정 모드(폰·패널)는 섹터 칩 줄의 마지막 칩, 태블릿·데스크톱은 세 칸 오른쪽, 그 밖(폰의 자동·수동)은 안내 글 오른쪽
  const applyPlace: 'segments' | 'chips' | 'help' = inline ? 'segments' : draft === 'auto_pinned' ? 'chips' : 'help';

  const holdText = robotHoldText(robot);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-2">
        <div
          role="radiogroup"
          aria-label="모드"
          aria-describedby={`${groupId}-help`}
          onKeyDown={onSegmentKey}
          className="grid min-w-0 flex-1 grid-cols-[1fr_1.45fr_1fr] gap-1 rounded-control bg-paper-deep p-1"
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
        {applyPlace === 'segments' && <div className="flex shrink-0 items-center">{applyButton(false)}</div>}
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p id={`${groupId}-help`} className="min-w-0 text-sm text-ink-soft">
          {ROBOT_MODE_HELP[draft]}
        </p>
        {applyPlace === 'help' && applyButton(false)}
      </div>

      {draft === 'auto_pinned' && (
        <fieldset className="flex flex-col gap-2" disabled={modeDisabled || modePending}>
          <legend className="mb-2 text-sm font-semibold text-ink">집을 섹터 (여러 개)</legend>
          <div className={`grid gap-2 ${applyPlace === 'chips' ? 'grid-cols-5' : 'grid-cols-4'}`}>
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
            {/* 적용은 fieldset의 disabled를 따르지 않도록 바깥 조건만 쓴다(fieldset이 막아도 같은 조건이다) */}
            {applyPlace === 'chips' && applyButton(true)}
          </div>
        </fieldset>
      )}

      {applyDisabled && applyReason && (
        <span id={applyReasonId} className="-mt-1 text-xs text-ink-faint">
          적용: {applyReason}
        </span>
      )}

      {draft === 'manual' && (
        <ManualSteps
          groupId={groupId}
          manualNow={manualNow}
          holdText={holdText}
          pickTarget={pickTarget}
          onPickTarget={setPickTarget}
          pick={{ disabled: pickDisabled, pending: picking, reason: pickReason }}
          place={{ disabled: placeDisabled, pending: placing, reason: placeReason }}
          onPick={() =>
            setConfirming({
              command: { type: 'pick_from', tankId: pickTarget, confirm: true },
              type: 'pick_from',
              detail: DEVICE_NAMES[pickTarget],
            })
          }
          onPlace={() =>
            setConfirming({
              command: { type: 'place_on_conveyor', confirm: true },
              type: 'place_on_conveyor',
              detail: robot.heldSectorId ? `${DEVICE_NAMES[robot.heldSectorId]}에서 집은 파지` : '집어 든 파지',
            })
          }
        />
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

interface StepState {
  disabled: boolean;
  pending: boolean;
  reason: string | null;
}

/** 수동 두 단계: 상태 한 줄, "집을 섹터"·선택·"집기" 한 줄(같은 높이·가운데선), "컨베이어에 놓기" */
function ManualSteps({
  groupId,
  manualNow,
  holdText,
  pickTarget,
  onPickTarget,
  pick,
  place,
  onPick,
  onPlace,
}: {
  groupId: string;
  manualNow: boolean;
  holdText: string | null;
  pickTarget: TankId;
  onPickTarget: (id: TankId) => void;
  pick: StepState;
  place: StepState;
  onPick: () => void;
  onPlace: () => void;
}) {
  const reasons: ReactNode[] = [];
  const pickWhy = pick.disabled ? pick.reason : null;
  const placeWhy = place.disabled ? place.reason : null;
  if (pickWhy && pickWhy === placeWhy) reasons.push(<span key="both">집기·놓기: {pickWhy}</span>);
  else {
    if (pickWhy) reasons.push(<span key="pick">집기: {pickWhy}</span>);
    if (placeWhy) reasons.push(<span key="place">놓기: {placeWhy}</span>);
  }
  return (
    <div className="flex flex-col gap-2">
      {manualNow && (
        <p role="status" aria-label="수동 집기 상태" className="flex min-w-0 items-center gap-2 rounded-control bg-paper px-3 py-2 text-sm font-semibold text-ink">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${holdText ? 'bg-accent' : 'bg-ink-faint'}`} />
          <span className="min-w-0 truncate">{holdText ?? '빈 손 · 집을 섹터를 고르세요'}</span>
        </p>
      )}
      {/* 이름표·선택·버튼을 한 줄, 같은 높이(48px)와 같은 가운데선에. 이유 글은 이 줄 밖(아래)에 둔다 */}
      <div className="flex items-center gap-2">
        <label htmlFor={`${groupId}-pick`} className="shrink-0 text-sm leading-none whitespace-nowrap text-ink-soft">
          집을 섹터
        </label>
        <select
          id={`${groupId}-pick`}
          value={pickTarget}
          onChange={(e) => onPickTarget(e.target.value as TankId)}
          disabled={pick.disabled}
          className="h-12 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 text-base leading-none text-ink disabled:text-ink-faint"
        >
          {TANK_IDS.map((id) => (
            <option key={id} value={id}>
              {DEVICE_NAMES[id]}
            </option>
          ))}
        </select>
        <CommandButton label="집기" pending={pick.pending} disabled={pick.disabled} onClick={onPick} />
      </div>
      <CommandButton label="컨베이어에 놓기" variant="primary" pending={place.pending} disabled={place.disabled} onClick={onPlace} />
      {reasons.length > 0 && <span className="flex flex-col text-xs text-ink-faint">{reasons}</span>}
    </div>
  );
}
