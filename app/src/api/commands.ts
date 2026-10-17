import { COMMAND_RULES, IDEMPOTENCY_KEY_HEADER } from '@ecocycle/shared';
import type { Command, CommandAcceptedResponse, CommandResultResponse, DeviceId, Permission } from '@ecocycle/shared';
import { ApiError, request } from './http';

/** 권한이 없어 앱이 보내지 않은 명령의 오류 코드 (서버가 막은 403 FORBIDDEN과 구분한다) */
export const PERMISSION_MISSING = 'PERMISSION_MISSING';

/**
 * 요청마다 새 Idempotency-Key를 만든다. crypto.randomUUID는 보안 컨텍스트(https, localhost)에서만 있어서
 * 개발 중 LAN 주소(http)로 접속하는 태블릿에서는 getRandomValues로 만든다.
 */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface SendCommandOptions {
  /**
   * 보내는 사람의 권한(`GET /me`의 permissions). 이 명령의 필요 권한(shared `COMMAND_RULES`)이 없으면 요청을 보내지 않는다.
   * api는 store를 모르므로 부르는 쪽이 넘긴다. 앱의 확인은 편의이고 차단은 서버가 한다(403).
   */
  permissions: readonly Permission[];
  /** 같은 버튼을 다시 보낼 때는 처음 키를 그대로 넘긴다 (서버가 중복 실행하지 않는다) */
  idempotencyKey?: string;
  // 위험도 높은 명령의 재인증(비밀번호·PIN)은 방식이 서버와 확정되면 여기에 추가한다.
}

export interface SendCommandResult {
  /** 다시 보낼 때 재사용할 키 */
  idempotencyKey: string;
  /** 202 응답. 접수되었을 뿐 완료가 아니다. 결과는 WebSocket command.result 또는 getCommand로 받는다. */
  accepted: CommandAcceptedResponse;
}

export async function sendCommand(
  deviceId: DeviceId,
  command: Command,
  options: SendCommandOptions,
): Promise<SendCommandResult> {
  // 권한이 없으면 서버에 보내지 않는다: 화면이 버튼을 막지 못한 경우(오래된 화면, 재시도)에도 요청이 나가지 않는다.
  if (!options.permissions.includes(COMMAND_RULES[command.type].permission)) {
    throw new ApiError(403, PERMISSION_MISSING, '이 조작을 할 권한이 없습니다.');
  }
  // 타입이 막아 주지만 마지막으로 한 번 더 확인한다: 위험도 높은 명령은 confirm 없이 보내지 않는다.
  if (COMMAND_RULES[command.type].requiresConfirm && !('confirm' in command && command.confirm === true)) {
    throw new Error(`${command.type} 명령은 확인 단계(confirm: true) 없이 보낼 수 없습니다.`);
  }
  const idempotencyKey = options.idempotencyKey ?? newIdempotencyKey();
  const accepted = await request<CommandAcceptedResponse>(`/devices/${deviceId}/commands`, {
    method: 'POST',
    body: command,
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
  });
  return { idempotencyKey, accepted };
}

/** WebSocket command.result를 못 받았을 때 결과를 조회한다. */
export const getCommand = (commandId: string): Promise<CommandResultResponse> =>
  request<CommandResultResponse>(`/commands/${commandId}`);
