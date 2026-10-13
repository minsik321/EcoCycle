import type { IsoTimestamp } from './common';
import type { Alarm } from './alarms';
import type { CommandStatus } from './commands';
import type { DeviceState, Gripper, PlantSummary } from './devices';
import type { RobotId, TankId } from './ids';
import type { Bale, Batch, Vehicle } from './process';
import type { Phase } from './robot';

/**
 * 구독 주제. 관절 값은 양이 많아 홈과 로봇 확대 화면에 있을 때만 구독하고 나머지 화면에서는 해제한다.
 */
export type Topic = 'plant' | 'devices' | 'alarms' | 'process' | `${RobotId}.joints`;

/** 클라이언트 → 서버 */
export type ClientMessage =
  | { type: 'subscribe'; topics: Topic[] }
  | { type: 'unsubscribe'; topics: Topic[] };

/**
 * `robot.joints`: seq로 순서를, ts로 지연을 확인해 부드럽게 보간한다.
 * `joints`의 순서와 단위는 `GET /robots/{id}/model`의 정의를 따른다(도).
 */
export interface RobotJointsMessage {
  type: 'robot.joints';
  deviceId: RobotId;
  seq: number;
  ts: IsoTimestamp;
  joints: number[];
  gripper: Gripper;
  phase: Phase;
  targetTankId: TankId | null;
}

/** 변할 때, 최소 5초마다. ⚠ 명세에 메시지 예시가 없어 필드 이름(`summary`)은 제안안이다. */
export interface PlantSummaryMessage {
  type: 'plant.summary';
  summary: PlantSummary;
}

/** 변할 때, 최소 5초마다. 상태 형식은 조회 API와 같다. ⚠ 필드 이름(`state`)은 제안안이다. */
export interface DeviceStateMessage {
  type: 'device.state';
  state: DeviceState;
}

/** 발생·해제 시 알람 하나 */
export interface AlarmMessage {
  type: 'alarm';
  alarm: Alarm;
}

/** 명령 처리 결과. `rejected`·`failed`에는 reason을 담는다. */
export interface CommandResultMessage {
  type: 'command.result';
  commandId: string;
  status: CommandStatus;
  reason: string | null;
}

/** 5초마다. ⚠ 명세에 "서버 시각"만 있어 필드 이름(`ts`)은 제안안이다. */
export interface HeartbeatMessage {
  type: 'heartbeat';
  ts: IsoTimestamp;
}

/** 공정 흐름: 차량의 stage나 값이 바뀔 때 차량 하나의 전체 상태 */
export interface ProcessVehicleMessage {
  type: 'process.vehicle';
  vehicle: Vehicle;
}

/** 공정 흐름: 배치의 stage나 값이 바뀔 때 배치 하나의 전체 상태 */
export interface ProcessBatchMessage {
  type: 'process.batch';
  batch: Batch;
}

/** 공정 흐름: 베일의 stage가 바뀔 때 베일 하나의 전체 상태 */
export interface ProcessBaleMessage {
  type: 'process.bale';
  bale: Bale;
}

/** 서버 → 클라이언트. `type`으로 구분되어 switch에서 빠진 경우가 컴파일 오류가 된다. */
export type ServerMessage =
  | PlantSummaryMessage
  | DeviceStateMessage
  | RobotJointsMessage
  | AlarmMessage
  | CommandResultMessage
  | ProcessVehicleMessage
  | ProcessBatchMessage
  | ProcessBaleMessage
  | HeartbeatMessage;
