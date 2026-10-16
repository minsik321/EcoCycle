import { Router } from 'express';
import type { Response } from 'express';
import type { Command, CommandAcceptedResponse, CommandResultResponse, DeviceId } from '@ecocycle/shared';
import { COMMAND_RULES, IDEMPOTENCY_KEY_HEADER, ROBOT_MODES, TANK_IDS } from '@ecocycle/shared';
import type { CommandType } from '@ecocycle/shared';
import { sendError } from '../errors';
import { ROLE_PERMISSIONS } from '../fixtures/accounts';
import type { Account } from '../fixtures/accounts';
import { SETTING_DEFS } from '../fixtures/settings';
import { conflictReason, getRecord, submit } from '../sim/commands';
import { alarms, devices, isDeviceId } from '../sim/state';

export const commandsRouter = Router();

// 같은 사용자의 같은 Idempotency-Key 재전송은 처음 응답을 그대로 돌려준다 (중복 실행 방지).
// 오류 응답은 저장하지 않는다: 같은 키로 다시 보내면 새로 판단한다.
const idempotent = new Map<string, { fingerprint: string; response: CommandAcceptedResponse }>();

const fail422 = (res: Response, message: string) => sendError(res, 422, 'VALIDATION_FAILED', message);

type Parsed = { command: Command } | { error: string };

/** 본문을 검증해 Command로 만든다. 형식이 틀리면 422 메시지를 돌려준다. */
function parseCommand(type: CommandType, body: Record<string, unknown>, deviceId: DeviceId): Parsed {
  if (COMMAND_RULES[type].requiresConfirm && body.confirm !== true) {
    return { error: '이 명령은 confirm: true가 필요합니다.' };
  }
  switch (type) {
    case 'set_batch_mix':
    case 'set_batch_pressure':
    case 'pause_batch':
    case 'resume_batch':
    case 'skip_batch': {
      if (typeof body.batchId !== 'string' || !body.batchId) return { error: '배치 ID가 필요합니다.' };
      const base = { batchId: body.batchId, confirm: true as const };
      if (type === 'set_batch_mix') {
        if (!Array.isArray(body.mix) || !body.mix.every(m => m && TANK_IDS.includes(m.sectorId) && typeof m.percent === 'number' && Number.isFinite(m.percent))) return { error: '섹터와 숫자 배합비가 필요합니다.' };
        return { command: { ...base, type, mix: body.mix } };
      }
      if (type === 'set_batch_pressure') {
        if (typeof body.targetPressureMpa !== 'number' || !Number.isFinite(body.targetPressureMpa)) return { error: '압력 숫자가 필요합니다.' };
        return { command: { ...base, type, targetPressureMpa: body.targetPressureMpa } };
      }
      if (type === 'skip_batch') {
        if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 120) return { error: '사유는 1~120자입니다.' };
        return { command: { ...base, type, reason: body.reason.trim() } };
      }
      return { command: { ...base, type } };
    }
    case 'start':
    case 'pause':
    case 'resume':
    case 'stop':
      return { command: { type } };
    case 'set_mode': {
      const mode = body.mode;
      if (typeof mode !== 'string' || !(ROBOT_MODES as readonly string[]).includes(mode)) {
        return { error: `mode는 ${ROBOT_MODES.join(' 또는 ')}여야 합니다.` };
      }
      if (mode === 'auto_pinned') {
        const pins = body.pinnedSectors;
        if (!Array.isArray(pins) || !pins.length || pins.length > TANK_IDS.length || new Set(pins).size !== pins.length || !pins.every(id => TANK_IDS.includes(id))) {
          return { error: '지정 섹터는 중복 없는 유효 섹터 1~4개여야 합니다.' };
        }
        return { command: { type, mode, pinnedSectors: pins, confirm: true } };
      }
      if (body.pinnedSectors !== undefined) return { error: '섹터 지정 자동에서만 pinnedSectors를 보냅니다.' };
      return { command: { type, mode: mode as 'auto' | 'manual', confirm: true } };
    }
    case 'pick_from': {
      const tankId = body.tankId;
      if (typeof tankId !== 'string' || !(TANK_IDS as readonly string[]).includes(tankId)) {
        return { error: `tankId는 ${TANK_IDS.join(', ')} 중 하나여야 합니다.` };
      }
      return { command: { type, tankId: tankId as (typeof TANK_IDS)[number], confirm: true } };
    }
    case 'place_on_conveyor':
      return { command: { type, confirm: true } };
    case 'update_setting': {
      const defs = SETTING_DEFS[devices[deviceId].type];
      const def = defs.find((d) => d.key === body.key);
      if (!def) return { error: `이 기기의 설정 키: ${defs.map((d) => d.key).join(', ')}` };
      const value = body.value;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < def.min || value > def.max) {
        return { error: `${def.key}는 ${def.min}~${def.max} 사이의 숫자여야 합니다.` };
      }
      return { command: { type, key: def.key, value, confirm: true } };
    }
    case 'ack_alarm': {
      const alarmId = body.alarmId;
      const alarm = typeof alarmId === 'string' ? alarms.find((a) => a.id === alarmId) : undefined;
      // 알람은 그 알람이 속한 기기의 경로로 보낸다 (docs/questions.md B16)
      if (!alarm || alarm.deviceId !== deviceId) return { error: '이 기기의 알람 ID가 아닙니다.' };
      return { command: { type, alarmId: alarm.id } };
    }
  }
}

// POST /devices/{id}/commands — 접수(202)일 뿐 완료가 아니다. 결과는 WebSocket command.result 또는 GET /commands/{id}
commandsRouter.post('/devices/:id/commands', (req, res) => {
  const account = res.locals.account as Account;
  const deviceId = req.params.id;
  if (!isDeviceId(deviceId)) return fail422(res, `알 수 없는 기기 ID: ${deviceId}`);

  const key = req.header(IDEMPOTENCY_KEY_HEADER);
  if (!key) return fail422(res, `${IDEMPOTENCY_KEY_HEADER} 헤더가 필요합니다.`);

  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;

  const storeKey = `${account.id}:${key}`;
  const fingerprint = JSON.stringify({ deviceId, body });
  const previous = idempotent.get(storeKey);
  if (previous) {
    if (previous.fingerprint !== fingerprint) return fail422(res, '같은 Idempotency-Key로 다른 요청을 보냈습니다.');
    return void res.status(202).json(previous.response);
  }

  const type = body.type;
  if (typeof type !== 'string' || !Object.hasOwn(COMMAND_RULES, type)) {
    return fail422(res, `type은 ${Object.keys(COMMAND_RULES).join(', ')} 중 하나여야 합니다.`);
  }
  const rule = COMMAND_RULES[type as CommandType];

  const deviceType = devices[deviceId].type;
  if (!rule.targets.includes('alarm') && !rule.targets.includes(deviceType)) {
    return fail422(res, `${type}은 ${deviceType} 기기에 보낼 수 없습니다.`);
  }

  // 권한은 서버가 판단한다. 프론트의 비활성 버튼은 편의일 뿐이다.
  if (!ROLE_PERMISSIONS[account.role].includes(rule.permission)) {
    return sendError(res, 403, 'FORBIDDEN', `${type} 명령을 보낼 권한이 없습니다.`);
  }

  const parsed = parseCommand(type as CommandType, body, deviceId);
  if ('error' in parsed) return fail422(res, parsed.error);

  const conflict = conflictReason(deviceId, parsed.command);
  if (conflict) return sendError(res, 409, 'CONFLICT', conflict);

  const record = submit(deviceId, account.id, parsed.command);
  const response: CommandAcceptedResponse = { commandId: record.commandId, status: 'accepted' };
  idempotent.set(storeKey, { fingerprint, response });
  res.status(202).json(response);
});

// GET /commands/{commandId} — WebSocket command.result를 못 받았을 때 조회
commandsRouter.get('/commands/:commandId', (req, res) => {
  const account = res.locals.account as Account;
  const record = getRecord(req.params.commandId);
  if (!record) return fail422(res, `알 수 없는 명령 ID: ${req.params.commandId}`);
  if (record.userId !== account.id) return sendError(res, 403, 'FORBIDDEN', '다른 사용자의 명령입니다.');
  const body: CommandResultResponse = { commandId: record.commandId, status: record.status, reason: record.reason };
  res.json(body);
});
