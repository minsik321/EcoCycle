import type { IsoTimestamp } from './common';
import type { TankId } from './ids';

/*
 * 공정 흐름 (명세 6절 "공정 흐름"): 입고 → 차량 인식 → 하역 → 배합 → 압축 → 출하.
 * 번호판 → 회사 → 배정 섹터, 배합비, 목표 압력은 모두 서버가 정한다. 화면은 표시하고 움직임으로 옮기기만 한다.
 * 사건만 흘리지 않고 대상(차량·배치·베일)의 전체 상태를 `stage`와 함께 보낸다 (`device.state`와 같은 방식).
 * ⚠ 프론트 제안 형식이며 서버 담당과 합의 전이다 (`docs/questions.md` B23~B27).
 * 실시간 메시지에는 무게 필드가 없다. 계중대 무게는 하역 기록(`UnloadRecord`, records.ts)으로 따로 받는다.
 */

/** arrived(계중대 도착) → identified(번호판 인식) → unloading(하역 중) → unloaded(하역 완료) → departed(출차) */
export const VEHICLE_STAGES = ['arrived', 'identified', 'unloading', 'unloaded', 'departed'] as const;
export type VehicleStage = (typeof VEHICLE_STAGES)[number];

/** planned(배합 계획) → mixing(배합 중) → compressing(압축 중) → completed(완료) */
export const BATCH_STAGES = ['planned', 'mixing', 'compressing', 'completed'] as const;
export type BatchStage = (typeof BATCH_STAGES)[number];

/** created(결속 후 배출) → shipped(출하) */
export const BALE_STAGES = ['created', 'shipped'] as const;
export type BaleStage = (typeof BALE_STAGES)[number];

/** 단계에 들어선 시각. 아직 거치지 않은 단계는 없다. */
export type StageTimes<S extends string> = Partial<Record<S, IsoTimestamp>>;

export interface Vehicle {
  id: string;
  stage: VehicleStage;
  /** 번호판·회사·배정 섹터는 `arrived`에서는 null이고 `identified`부터 채워진다 */
  plate: string | null;
  companyName: string | null;
  /** 배정 섹터. 섹터와 탱크는 같은 대상이라 탱크 기기 ID를 그대로 쓴다 */
  sectorId: TankId | null;
  stageTimes: StageTimes<VehicleStage>;
  updatedAt: IsoTimestamp;
}

export interface MixPart {
  sectorId: TankId;
  /** 배합 비율 % (0~100), 배치 안에서 합이 100 */
  percent: number;
}

export interface Batch {
  id: string;
  stage: BatchStage;
  mix: MixPart[];
  avgMoisturePercent: number;
  /** 서버가 이 배치에 지정한 목표 압력. 실제 압력은 압축기 상태의 `pressureMpa` */
  targetPressureMpa: number;
  stageTimes: StageTimes<BatchStage>;
  updatedAt: IsoTimestamp;
}

export interface Bale {
  /** 예: `BL-20261013-0412` */
  id: string;
  batchId: string;
  stage: BaleStage;
  stageTimes: StageTimes<BaleStage>;
  updatedAt: IsoTimestamp;
}

/** GET /process/state — 진행 중인 대상과 최근 목록(표·검색·재동기화용, 종류별 최근 20건 가정) */
export interface ProcessState {
  vehicles: Vehicle[];
  batches: Batch[];
  bales: Bale[];
  updatedAt: IsoTimestamp;
}

/** `GET /plant/history`의 metric (지표 카드의 작은 추이선용) */
export const PLANT_METRICS = ['balesToday', 'averageMoisturePercent', 'compressorUptimePercent'] as const;
export type PlantMetric = (typeof PLANT_METRICS)[number];


export interface ControlledBatch {
  batch: Batch;
  paused: boolean;
  skipped: boolean;
  progressPercent: number;
  currentPressureMpa: number;
  baleIds: string[];
}
export interface BatchControlState {
  /** 사건 기록이 바뀌면 증가한다 */
  eventsRevision: number;
  current: ControlledBatch | null;
  next: ControlledBatch | null;
  pressureRange: { min: number; max: number };
}
export interface BaleDetail extends Bale {
  pressureMpa: number;
  avgMoisturePercent: number;
  mix: MixPart[];
}
export interface BatchEvent {
  id: string;
  batchId: string;
  at: IsoTimestamp;
  type: 'created' | 'mix_changed' | 'pressure_changed' | 'paused' | 'resumed' | 'skipped' | 'bale_produced';
  actor: string;
  detail: string;
  baleId?: string;
}
