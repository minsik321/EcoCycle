import type { DeviceStatus, IsoTimestamp } from './common';
import type { CompressorId, ConveyorId, DeviceId, RobotId, TankId } from './ids';
import type { Phase, RobotMode, RobotStatus } from './robot';

export type TankSection = 'A1' | 'A2' | 'B1' | 'B2';

/** 섹터(탱크)의 등급. ⚠ 등급 종류는 가정이다 (`docs/questions.md` A8). */
export type SectorGrade = 'A' | 'C';

/** GET /devices/tank-a1/state — 무게는 쓰지 않고 부피·용량만 쓴다. */
export interface TankState {
  id: TankId;
  type: 'tank';
  section: TankSection;
  grade: SectorGrade;
  status: DeviceStatus;
  /** 수위·적재율 % (0~100) */
  fillPercent: number;
  volumeM3: number;
  capacityM3: number;
  /** 수분 % (0~100) */
  moisturePercent: number;
  /** 지금 적용 중인 주의 기준 적재율 % (설정 `cautionThresholdPercent`의 현재값). 서버는 이 값으로 status를 판정하고 화면은 주의선으로 그리기만 한다 */
  cautionThresholdPercent: number;
  updatedAt: IsoTimestamp;
}

export interface Gripper {
  closed: boolean;
  holding: boolean;
}

/** GET /devices/robot-1/state — status는 DeviceStatus가 아니라 RobotStatus다. */
export interface RobotState {
  id: RobotId;
  type: 'robot';
  status: RobotStatus;
  mode: RobotMode;
  pinnedSectors: TankId[];
  pickRecordsRevision: number;
  phase: Phase;
  /** 작업 중인 탱크. 작업 중이 아니면 null */
  targetTankId: TankId | null;
  gripper: Gripper;
  updatedAt: IsoTimestamp;
}

/** GET /devices/conveyor-z/state */
export interface ConveyorState {
  id: ConveyorId;
  type: 'conveyor';
  status: DeviceStatus;
  running: boolean;
  /** 적재 정도 % (0~100) */
  loadPercent: number;
  updatedAt: IsoTimestamp;
}

/** GET /devices/compressor-1/state */
export interface CompressorState {
  id: CompressorId;
  type: 'compressor';
  status: DeviceStatus;
  running: boolean;
  pressureMpa: number;
  temperatureC: number;
  updatedAt: IsoTimestamp;
}

/** `type`으로 구분되는 유니온 — switch에서 빠진 경우가 컴파일 오류가 된다. */
export type DeviceState = TankState | RobotState | ConveyorState | CompressorState;

/** GET /devices */
export type DeviceListResponse = DeviceState[];

/**
 * GET /plant/summary — 상단 카드용 요약(평균 수분, 전체 적재율, 시스템 상태).
 * ⚠ 명세에 JSON 예시가 없어 필드 이름은 제안안이다. 명세 확정 후 맞춘다.
 */
export interface PlantSummary {
  averageMoisturePercent: number;
  totalFillPercent: number;
  /** 오늘 처리량(베일 수) */
  balesToday: number;
  /** 압축기 가동률 % (0~100) */
  compressorUptimePercent: number;
  status: DeviceStatus;
  updatedAt: IsoTimestamp;
}

/**
 * GET /devices/{id}/history?metric=...&from=...&to=...&interval=...
 * ⚠ 명세에 응답 예시가 없어 형식은 제안안이다. 명세 확정 후 맞춘다.
 */
export interface HistoryPoint {
  ts: IsoTimestamp;
  value: number;
}

/** GET /plant/history?metric=...&from=...&to=...&interval=... — 요약 값의 이력. 형식은 기기 이력과 같다. */
export interface PlantHistoryResponse {
  metric: string;
  interval: string;
  from: IsoTimestamp;
  to: IsoTimestamp;
  points: HistoryPoint[];
}

export interface HistoryResponse {
  deviceId: DeviceId;
  metric: string;
  interval: string;
  from: IsoTimestamp;
  to: IsoTimestamp;
  points: HistoryPoint[];
}
