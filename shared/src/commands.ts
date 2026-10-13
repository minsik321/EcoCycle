import type { DeviceType, TankId } from './ids';
import type { Permission } from './auth';
import type { RobotMode } from './robot';

/** 명령 처리 상태. `rejected`와 `failed`에는 reason이 따른다. */
export const COMMAND_STATUSES = ['accepted', 'rejected', 'completed', 'failed'] as const;
export type CommandStatus = (typeof COMMAND_STATUSES)[number];

/** POST /devices/{id}/commands 에 반드시 붙이는 헤더. 같은 키 재전송은 첫 결과를 그대로 돌려받는다. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** 명령 본문. 이름이 아니라 정해진 종류(`type`)로 보낸다. */
export type Command =
  | { type: 'start' | 'pause' | 'resume' | 'stop' }
  | { type: 'set_mode'; mode: RobotMode; confirm: true }
  | { type: 'pick_from'; tankId: TankId; confirm: true }
  | { type: 'update_setting'; key: string; value: string | number | boolean; confirm: true }
  | { type: 'ack_alarm'; alarmId: string };

export type CommandType = Command['type'];

/** 명령 하나에 대해 `type`으로 좁힌 본문 타입 */
export type CommandOf<T extends CommandType> = Extract<Command, { type: T }>;

/**
 * 위험도. 화면 분기와 모의 서버 검증이 함께 쓰므로 이 표 한 곳에만 둔다.
 * - low: 되돌리기 쉽고 위험이 낮다. 홈·확대 화면에서 가능.
 * - high: 기기 페이지에서만 가능하고 확인 단계(`confirm: true`)를 거친다.
 * 실제 조작 목록은 프로토타입 피드백으로 확정한다 (docs/questions.md A3).
 */
export type CommandRisk = 'low' | 'high';

export interface CommandRule {
  risk: CommandRisk;
  /** 필요 권한. 화면은 버튼 표시·비활성에만 쓰고, 차단은 서버가 한다. */
  permission: Permission;
  /** 명령 대상. `alarm`은 기기가 아니라 알람에 거는 명령 */
  targets: ReadonlyArray<DeviceType | 'alarm'>;
  /** 요청에 `confirm: true`가 있어야 하는가 */
  requiresConfirm: boolean;
}

const MACHINES = ['robot', 'conveyor', 'compressor'] as const;

export const COMMAND_RULES: Record<CommandType, CommandRule> = {
  start: { risk: 'low', permission: 'robot.control', targets: MACHINES, requiresConfirm: false },
  pause: { risk: 'low', permission: 'robot.control', targets: MACHINES, requiresConfirm: false },
  resume: { risk: 'low', permission: 'robot.control', targets: MACHINES, requiresConfirm: false },
  stop: { risk: 'low', permission: 'robot.control', targets: MACHINES, requiresConfirm: false },
  set_mode: { risk: 'high', permission: 'robot.manual', targets: ['robot'], requiresConfirm: true },
  // 수동 모드에서만 실행된다 (아니면 서버가 409)
  pick_from: { risk: 'high', permission: 'robot.manual', targets: ['robot'], requiresConfirm: true },
  update_setting: {
    risk: 'high',
    permission: 'settings.write',
    targets: ['tank', 'robot', 'conveyor', 'compressor'],
    requiresConfirm: true,
  },
  ack_alarm: { risk: 'low', permission: 'alarm.ack', targets: ['alarm'], requiresConfirm: false },
};

/** 202 응답: 접수되었을 뿐 완료가 아니다. 결과는 WebSocket `command.result` 또는 GET /commands/{id} */
export interface CommandAcceptedResponse {
  commandId: string;
  status: 'accepted';
}

/**
 * GET /commands/{commandId} — WebSocket `command.result`를 못 받았을 때 조회.
 * ⚠ 명세에 응답 예시가 없어 `command.result`와 같은 필드로 둔 제안안이다.
 */
export interface CommandResultResponse {
  commandId: string;
  status: CommandStatus;
  reason: string | null;
}
