import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Command, CommandStatus, CommandType, DeviceId } from '@ecocycle/shared';
import * as api from '../../api';
import {
  COMMAND_POLL_GIVE_UP_MS,
  COMMAND_POLL_INTERVAL_MS,
  COMMAND_RESULT_WAIT_MS,
} from '../../config/realtime';

// 보낸 명령과 결과. 홈에서도 조작 결과(성공, 거부, 실패)를 바로 보여 주기 위해 둔다.

/**
 * sending: 서버에 보내는 중, accepted: 접수됨(완료 아님), completed/rejected/failed: 서버가 알려 준 결과,
 * unknown: 결과를 끝내 확인하지 못함(WebSocket도 조회도 실패)
 */
export type CommandEntryStatus = 'sending' | CommandStatus | 'unknown';

export interface CommandEntry {
  /** 이 조작의 Idempotency-Key. 같은 버튼을 다시 보내도 같은 항목을 쓴다. */
  key: string;
  deviceId: DeviceId;
  type: CommandType;
  /** 202를 받은 뒤에 생긴다 */
  commandId: string | null;
  status: CommandEntryStatus;
  reason: string | null;
  /** 서버가 HTTP 오류(403, 409, 422 등)로 거부했을 때의 상태 코드 */
  httpStatus: number | null;
  createdAt: string;
}

export interface CommandsState {
  byKey: Record<string, CommandEntry>;
  /** 오래된 것부터 */
  order: string[];
  /** 202보다 WebSocket 결과가 먼저 도착한 경우를 위해 잠시 보관 (느린 네트워크) */
  earlyResults: Record<string, { status: CommandStatus; reason: string | null }>;
}

const MAX_ENTRIES = 30;
const MAX_EARLY_RESULTS = 20;

const initialState: CommandsState = { byKey: {}, order: [], earlyResults: {} };

export const isFinal = (status: CommandEntryStatus): boolean =>
  status === 'completed' || status === 'rejected' || status === 'failed' || status === 'unknown';

const slice = createSlice({
  name: 'commands',
  initialState,
  reducers: {
    commandStarted(state, action: PayloadAction<{ key: string; deviceId: DeviceId; type: CommandType; createdAt: string }>) {
      const { key, deviceId, type, createdAt } = action.payload;
      const existing = state.byKey[key];
      if (existing) {
        // 같은 버튼 재시도: 항목을 새로 만들지 않고 다시 보내는 중으로 바꾼다
        existing.status = 'sending';
        existing.reason = null;
        existing.httpStatus = null;
        return;
      }
      state.byKey[key] = { key, deviceId, type, commandId: null, status: 'sending', reason: null, httpStatus: null, createdAt };
      state.order.push(key);
      while (state.order.length > MAX_ENTRIES) {
        const oldest = state.order.shift();
        if (oldest) delete state.byKey[oldest];
      }
    },
    /** 202 접수 */
    commandAccepted(state, action: PayloadAction<{ key: string; commandId: string }>) {
      const entry = state.byKey[action.payload.key];
      if (!entry) return;
      entry.commandId = action.payload.commandId;
      const early = state.earlyResults[action.payload.commandId];
      if (early) {
        entry.status = early.status;
        entry.reason = early.reason;
        delete state.earlyResults[action.payload.commandId];
      } else {
        entry.status = 'accepted';
      }
    },
    /** 서버가 요청 자체를 HTTP 오류로 거부했거나 보내지 못했다 */
    commandSendFailed(state, action: PayloadAction<{ key: string; reason: string; httpStatus: number }>) {
      const entry = state.byKey[action.payload.key];
      if (!entry) return;
      entry.status = 'rejected';
      entry.reason = action.payload.reason;
      entry.httpStatus = action.payload.httpStatus;
    },
    /** WebSocket `command.result` 또는 GET /commands/{id} 조회 결과 */
    commandResultReceived(state, action: PayloadAction<{ commandId: string; status: CommandStatus; reason: string | null }>) {
      const { commandId, status, reason } = action.payload;
      const entry = Object.values(state.byKey).find((e) => e.commandId === commandId);
      if (!entry) {
        // 아직 202를 못 받았거나 다른 사용자의 명령이다. 잠시 보관했다가 접수되면 맞춘다.
        state.earlyResults[commandId] = { status, reason };
        const ids = Object.keys(state.earlyResults);
        if (ids.length > MAX_EARLY_RESULTS) delete state.earlyResults[ids[0]!];
        return;
      }
      if (isFinal(entry.status) && entry.status !== 'unknown') return; // 이미 결과가 있다
      entry.status = status;
      entry.reason = reason;
    },
    /** 결과를 끝내 확인하지 못했다 */
    commandResultUnknown(state, action: PayloadAction<{ key: string }>) {
      const entry = state.byKey[action.payload.key];
      if (entry && !isFinal(entry.status)) {
        entry.status = 'unknown';
        entry.reason = '결과를 확인하지 못했습니다. 설비 상태를 직접 확인하세요.';
      }
    },
  },
});

export const { commandStarted, commandAccepted, commandSendFailed, commandResultReceived, commandResultUnknown } =
  slice.actions;
export default slice.reducer;

// --- 명령 보내기 ---

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface SendArgs {
  deviceId: DeviceId;
  command: Command;
  /** 같은 버튼을 다시 보낼 때 처음 키를 넘긴다 */
  idempotencyKey?: string;
}

type ThunkConfig = { state: { commands: CommandsState } };

/**
 * 명령을 보내고 결과를 추적한다.
 * 202는 접수일 뿐이다. 결과는 WebSocket으로 받고, 일정 시간 안에 안 오면 GET /commands/{id}로 조회한다.
 * 반환값은 이 조작의 키(재시도에 쓴다). 완료까지 기다릴 필요는 없다.
 */
export const sendDeviceCommand = createAsyncThunk<string, SendArgs, ThunkConfig>(
  'commands/send',
  async ({ deviceId, command, idempotencyKey }, { dispatch, getState }) => {
    const key = idempotencyKey ?? api.newIdempotencyKey();
    dispatch(commandStarted({ key, deviceId, type: command.type, createdAt: new Date().toISOString() }));

    let commandId: string;
    try {
      const { accepted } = await api.sendCommand(deviceId, command, { idempotencyKey: key });
      commandId = accepted.commandId;
    } catch (error) {
      const httpStatus = error instanceof api.ApiError ? error.status : 0;
      const reason = error instanceof Error ? error.message : '명령을 보내지 못했습니다.';
      dispatch(commandSendFailed({ key, reason, httpStatus }));
      return key;
    }
    dispatch(commandAccepted({ key, commandId }));

    const isDone = () => {
      const entry = getState().commands.byKey[key];
      return !entry || isFinal(entry.status);
    };

    // 1) WebSocket command.result를 잠시 기다린다
    const waitUntil = Date.now() + COMMAND_RESULT_WAIT_MS;
    while (!isDone() && Date.now() < waitUntil) await sleep(100);

    // 2) 안 오면 서버에 직접 물어본다
    const giveUpAt = Date.now() + COMMAND_POLL_GIVE_UP_MS;
    while (!isDone() && Date.now() < giveUpAt) {
      try {
        const result = await api.getCommand(commandId);
        if (result.status !== 'accepted') dispatch(commandResultReceived(result));
      } catch {
        // 조회 실패는 다음 주기에 다시 시도한다
      }
      if (!isDone()) await sleep(COMMAND_POLL_INTERVAL_MS);
    }
    if (!isDone()) dispatch(commandResultUnknown({ key }));
    return key;
  },
);
