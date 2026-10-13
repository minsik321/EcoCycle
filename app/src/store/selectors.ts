import { createSelector } from '@reduxjs/toolkit';
import { COMMAND_RULES } from '@ecocycle/shared';
import type { Alarm, CommandType, DeviceId, DeviceState, Permission, TankState } from '@ecocycle/shared';
import type { RootState } from './index';

// 화면은 state를 직접 뒤지지 않고 이 선택자를 쓴다.

/**
 * 권한 판단은 이 선택자 하나로 한다. 화면에서 `role === 'admin'` 같은 비교를 하지 않는다 (권한 종류는 확정 전).
 * 버튼 표시·비활성에만 쓰고, 차단은 서버가 한다.
 */
export const selectCan = (permission: Permission) => (state: RootState): boolean =>
  state.auth.me?.permissions.includes(permission) ?? false;

/** 이 명령을 보낼 권한이 있는가 (필요 권한은 shared의 COMMAND_RULES가 정한다) */
export const selectCanCommand = (type: CommandType) => selectCan(COMMAND_RULES[type].permission);

export const selectMe = (state: RootState) => state.auth.me;
export const selectPermissions = (state: RootState): readonly Permission[] => state.auth.me?.permissions ?? EMPTY_PERMISSIONS;
const EMPTY_PERMISSIONS: readonly Permission[] = [];

// --- 연결 ---

export const selectConnection = (state: RootState) => state.connection;
/**
 * 값이 갱신되지 않는 상태. 연결 끊김과 마지막 수신 시각을 표시하고 로봇팔을 멈춘다.
 * 처음 연결 중(connecting)은 끊김이 아니다.
 */
export const selectIsDisconnected = (state: RootState): boolean => state.connection.status === 'offline';

// --- 기기 ---

export const selectPlantSummary = (state: RootState) => state.plant.summary;
export const selectDevice = (id: DeviceId) => (state: RootState): DeviceState | undefined => state.devices.byId[id];

export const selectTanks = createSelector(
  (state: RootState) => state.devices.byId,
  (byId): TankState[] =>
    (['tank-a1', 'tank-a2', 'tank-b1', 'tank-b2'] as const).flatMap((id) => {
      const d = byId[id];
      return d && d.type === 'tank' ? [d] : [];
    }),
);

// --- 알람 ---

/** 열려 있는 알람(active, acknowledged). 최신순 */
export const selectOpenAlarms = createSelector(
  (state: RootState) => state.alarms.byId,
  (byId): Alarm[] => Object.values(byId).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)),
);

export const selectActiveAlarmCount = createSelector(selectOpenAlarms, (alarms) => alarms.filter((a) => a.state === 'active').length);

export const selectAlarmsForDevice = (id: DeviceId) =>
  createSelector(selectOpenAlarms, (alarms) => alarms.filter((a) => a.deviceId === id));

// --- 명령 결과 ---

/** 최근 명령 결과, 최신순 (홈에서도 조작 결과를 바로 보여 준다) */
export const selectRecentCommands = createSelector(
  (state: RootState) => state.commands.byKey,
  (state: RootState) => state.commands.order,
  (byKey, order) => [...order].reverse().flatMap((key) => (byKey[key] ? [byKey[key]] : [])),
);

export const selectCommandByKey = (key: string | null | undefined) => (state: RootState) =>
  key ? state.commands.byKey[key] : undefined;
