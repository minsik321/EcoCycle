import type {
  Command,
  CommandStatus,
  CompressorState,
  ConveyorState,
  DeviceId,
  RobotState,
} from '@ecocycle/shared';
import { ACCOUNTS } from '../fixtures/accounts';
import { publish } from './bus';
import { applyBatchCommand, setRobotPin } from './process';
import { publishDevice, publishSummary } from './publish';
import { requestManualPick, requestManualPlace, resetRobotCycle } from './robot';
import { alarms, devices, setSetting } from './state';

// 명령 접수(202) → 잠시 뒤 실행 → command.result. 실행 결과는 GET /commands/{id} 로도 조회할 수 있다.

export interface CommandRecord {
  commandId: string;
  deviceId: DeviceId;
  userId: string;
  command: Command;
  status: CommandStatus;
  reason: string | null;
  createdAt: string;
}

interface Outcome {
  status: Exclude<CommandStatus, 'accepted'>;
  reason: string | null;
}

const records = new Map<string, CommandRecord>();
let seq = 8840;

/** 접수부터 결과까지 걸리는 시간(ms). 시나리오(slow-network)에서 늘린다. */
export const commandDelay = { minMs: 600, maxMs: 1200 };

// 같은 기기의 명령은 접수 순서대로 실행한다 (지연이 무작위여도 resume → stop 이 뒤바뀌지 않게)
const lastExecAt = new Map<DeviceId, number>();

export const getRecord = (commandId: string): CommandRecord | undefined => records.get(commandId);

const robot = () => devices['robot-1'] as RobotState;

/** 기록에 남길 사람 이름 (모의 계정 이름, 없으면 ID) */
const actorName = (userId: string) => ACCOUNTS.find((a) => a.id === userId)?.name ?? userId;

/**
 * 지금 상태에서 이 명령을 받을 수 없는 이유 (HTTP 409). 받을 수 있으면 undefined.
 * 형식 검증(422)과 권한(403)은 이미 통과한 뒤에 부른다.
 */
export function conflictReason(deviceId: DeviceId, command: Command): string | undefined {
  if (command.type === 'ack_alarm') {
    const alarm = alarms.find((a) => a.id === command.alarmId);
    return alarm?.state === 'active' ? undefined : '이미 확인했거나 해제된 알람입니다.';
  }
  const device = devices[deviceId];

  if (device.type === 'robot') {
    const r = robot();
    if (r.status === 'error' || r.status === 'offline') {
      return r.status === 'error' ? '로봇이 오류 상태입니다. 현장에서 확인하세요.' : '로봇과 연결되어 있지 않습니다.';
    }
    switch (command.type) {
      case 'start':
        return r.status === 'running' ? '이미 작동 중입니다.' : r.status === 'paused' ? '일시정지 중에는 재개를 사용하세요.' : undefined;
      case 'pause':
        return r.status === 'running' ? undefined : '작동 중일 때만 일시정지할 수 있습니다.';
      case 'resume':
        return r.status === 'paused' ? undefined : '일시정지 중일 때만 재개할 수 있습니다.';
      case 'stop':
        return r.status === 'stopped' ? '이미 정지 상태입니다.' : undefined;
      case 'set_mode':
        // 수동으로 집어 든 채 모드를 바꾸면 들고 있는 것이 어디로 갈지 사람이 모른다
        if (r.mode === 'manual' && r.heldSectorId) return '집어 든 파지를 먼저 컨베이어에 놓으세요.';
        return r.mode === command.mode && (command.mode !== 'auto_pinned' || (r.pinnedSectors.length === command.pinnedSectors.length && r.pinnedSectors.every(id => command.pinnedSectors.includes(id)))) ? '이미 해당 모드와 지정 섹터입니다.' : undefined;
      case 'pick_from':
      case 'place_on_conveyor':
        if (r.mode !== 'manual') return '수동 모드에서만 사용할 수 있습니다.';
        if (r.status !== 'running') return '로봇이 작동 중일 때만 사용할 수 있습니다.';
        if (r.phase !== 'idle') return '로봇이 작업 중입니다. 끝난 뒤 다시 시도하세요.';
        // 집기 → 놓기 순서는 서버가 지킨다
        if (command.type === 'pick_from' && r.heldSectorId) return '이미 집어 든 파지가 있습니다. 먼저 컨베이어에 놓으세요.';
        if (command.type === 'place_on_conveyor' && !r.heldSectorId) return '집어 든 파지가 없습니다. 먼저 집기를 하세요.';
        return undefined;
      default:
        return undefined;
    }
  }

  if (device.type === 'conveyor' || device.type === 'compressor') {
    const running = device.running;
    switch (command.type) {
      case 'start':
      case 'resume':
        return running ? '이미 가동 중입니다.' : undefined;
      case 'pause':
      case 'stop':
        return running ? undefined : '이미 멈춰 있습니다.';
      default:
        return undefined;
    }
  }
  return undefined;
}

export function submit(deviceId: DeviceId, userId: string, command: Command): CommandRecord {
  seq += 1;
  const record: CommandRecord = {
    commandId: `cmd-${seq}`,
    deviceId,
    userId,
    command,
    status: 'accepted',
    reason: null,
    createdAt: new Date().toISOString(),
  };
  records.set(record.commandId, record);
  const wanted = Date.now() + commandDelay.minMs + Math.random() * (commandDelay.maxMs - commandDelay.minMs);
  const execAt = Math.max(wanted, (lastExecAt.get(deviceId) ?? 0) + 50);
  lastExecAt.set(deviceId, execAt);
  setTimeout(() => void finish(record), execAt - Date.now());
  return record;
}

async function finish(record: CommandRecord): Promise<void> {
  let outcome: Outcome;
  try {
    outcome = await execute(record);
  } catch {
    outcome = { status: 'failed', reason: '모의 서버 내부 오류' };
  }
  record.status = outcome.status;
  record.reason = outcome.reason;
  publish({ type: 'command.result', commandId: record.commandId, status: outcome.status, reason: outcome.reason });
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function execute({ deviceId, command, userId }: CommandRecord): Promise<Outcome> {
  if ('batchId' in command) {
    const reason = applyBatchCommand(command, userId);
    return { status: reason ? 'rejected' : 'completed', reason: reason ?? null };
  }
  const device = devices[deviceId];

  switch (command.type) {
    case 'start':
    case 'pause':
    case 'resume':
    case 'stop': {
      if (device.type === 'robot') {
        const r = robot();
        // 접수 뒤에 로봇이 오류로 바뀌었으면 실행하지 않는다
        if (r.status === 'error' || r.status === 'offline') return { status: 'failed', reason: '로봇이 오류 상태가 되어 실행하지 못했습니다.' };
        if (command.type === 'start' || command.type === 'resume') r.status = 'running';
        else if (command.type === 'pause') r.status = 'paused';
        else {
          r.status = 'stopped';
          resetRobotCycle();
        }
      } else if (device.type === 'conveyor' || device.type === 'compressor') {
        (device as ConveyorState | CompressorState).running = command.type === 'start' || command.type === 'resume';
      }
      publishDevice(device, true);
      publishSummary();
      return { status: 'completed', reason: null };
    }

    case 'set_mode': {
      const reason = conflictReason(deviceId, command);
      if (reason) return { status: 'rejected', reason };
      robot().mode = command.mode;
      robot().pinnedSectors = command.mode === 'auto_pinned' ? [...command.pinnedSectors] : [];
      // 배합 중인 배치에 지정을 걸거나 푼다 (실제 배합·사건 기록)
      setRobotPin(command.mode === 'auto_pinned' ? command.pinnedSectors : null, actorName(userId));
      publishDevice(robot(), true);
      return { status: 'completed', reason: null };
    }

    case 'pick_from':
    case 'place_on_conveyor': {
      // 접수 뒤에 상태가 바뀌었을 수 있어 실행 때 다시 검사한다
      const reason = conflictReason(deviceId, command);
      if (reason) return { status: 'rejected', reason };
      const actor = actorName(userId);
      const requested = command.type === 'pick_from' ? requestManualPick(command.tankId, actor) : requestManualPlace(actor);
      if (!requested) return { status: 'rejected', reason: '로봇이 작업 중이거나 수동 모드가 아니어서 실행하지 않았습니다.' };
      // 움직임이 시작되어 끝날 때까지 기다린다 (최대 40초)
      const deadline = Date.now() + 40_000;
      while (robot().phase === 'idle' && Date.now() < deadline) await wait(100);
      while (robot().phase !== 'idle' && Date.now() < deadline) await wait(200);
      if (Date.now() >= deadline) return { status: 'failed', reason: '시간 안에 작업이 끝나지 않았습니다.' };
      if (command.type === 'pick_from' && robot().heldSectorId !== command.tankId) {
        return { status: 'failed', reason: '집지 못했습니다. 섹터가 비어 있거나 도중에 멈췄습니다.' };
      }
      return { status: 'completed', reason: null };
    }

    case 'update_setting': {
      setSetting(deviceId, command.key, Number(command.value));
      return { status: 'completed', reason: null };
    }

    case 'ack_alarm': {
      const alarm = alarms.find((a) => a.id === command.alarmId);
      if (!alarm || alarm.state !== 'active') return { status: 'rejected', reason: '이미 확인했거나 해제된 알람입니다.' };
      alarm.state = 'acknowledged';
      publish({ type: 'alarm', alarm: { ...alarm } });
      return { status: 'completed', reason: null };
    }
  }
}
