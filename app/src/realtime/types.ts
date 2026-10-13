import type { Alarm, CommandStatus, DeviceState, PlantSummary } from '@ecocycle/shared';

/** online: 연결됨, connecting: 처음 연결 중, offline: 끊김(재연결 시도 중 포함) */
export type ConnectionStatus = 'online' | 'connecting' | 'offline';

export interface ConnectionState {
  status: ConnectionStatus;
  /** 마지막 메시지를 받은 시각(ISO 8601 UTC). 한 번도 못 받았으면 null */
  lastReceivedAt: string | null;
}

export interface CommandResult {
  commandId: string;
  status: CommandStatus;
  reason: string | null;
}

/**
 * realtime이 값을 내보내는 곳. store(Redux)가 이 모양으로 연결한다.
 * realtime은 store를 직접 import하지 않는다 (테스트와 의존 방향을 위해).
 * 고빈도 관절 값(robot.joints)은 여기로 나가지 않고 jointBuffer로 간다.
 */
export interface RealtimeSink {
  /** 연결 상태가 바뀔 때만 부른다 (메시지마다 부르지 않는다) */
  onConnection(state: ConnectionState): void;
  onPlantSummary(summary: PlantSummary): void;
  /** 같은 기기는 마지막 값만 담아 묶어서 보낸다 (store 반영을 초당 몇 번으로 줄인다) */
  onDeviceStates(states: DeviceState[]): void;
  onAlarm(alarm: Alarm): void;
  onCommandResult(result: CommandResult): void;
  /**
   * 연결(재연결 포함)이 되면 REST로 요약·기기 상태·활성 알람을 다시 받아 맞춘다.
   * 실패하면 reject하고, realtime이 몇 번 다시 시도한다.
   */
  resync(): Promise<void>;
}
