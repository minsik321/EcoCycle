import type { IsoTimestamp } from './common';
import type { TankId } from './ids';
import type { BaleStage, BatchPinChange, MixPart, StageTimes, VehicleStage } from './process';

/*
 * 공정 기록 (명세 6절 "공정 기록(차량·배치·베일)"): "공정 기록" 화면의 차량·배치·베일 목록과 한 건 조회.
 *   GET /vehicles/records, GET /vehicles/{id}  → VehicleRecord
 *   GET /batches/records,  GET /batches/{id}   → BatchRecord
 *   GET /bales/records → BaleRecord, GET /bales/{id} → BaleDetail (process.ts)
 * 목록은 기록 목록 모양(`RecordPage<T>`, records.ts)이고 지금 진행 중인 차량·배치도 들어 있다. 끝나면 같은 줄이 바뀐다.
 * ⚠ 프론트 제안 형식이다 (서버 담당 확인 전, `docs/questions.md` B31).
 */

/** identified(인식: 계중대 도착·번호판 인식) → unloading(하역: 하역 중·하역 완료) → departed(출차). 서버가 정한다 */
export const VEHICLE_RECORD_STATUSES = ['identified', 'unloading', 'departed'] as const;
export type VehicleRecordStatus = (typeof VEHICLE_RECORD_STATUSES)[number];

/** completed(완료) · skipped(건너뜀: 압축하지 않고 넘어감) · paused(일시정지됨: 일시정지된 채 끝남) */
export const BATCH_RESULTS = ['completed', 'skipped', 'paused'] as const;
export type BatchResult = (typeof BATCH_RESULTS)[number];

/** 차량 기록 한 줄. 기록 시각은 입차 시각 `arrivedAt` */
export interface VehicleRecord {
  id: string;
  status: VehicleRecordStatus;
  /** 번호판·회사·배정 섹터는 인식 전에는 null */
  plate: string | null;
  companyName: string | null;
  sectorId: TankId | null;
  /** 입차(계중대 도착) 시각 */
  arrivedAt: IsoTimestamp;
  /** 출차 시각. 출차 전에는 null */
  departedAt: IsoTimestamp | null;
  /** 입차 총중량 t (입차 계량이라 처음부터 있다) */
  grossT: number;
  /** 출차 공차 t. 출차 계량 전에는 null */
  tareT: number | null;
  /** 순중량 t (grossT − tareT, 서버가 계산). 출차 계량 전에는 null */
  netT: number | null;
  stageTimes: StageTimes<VehicleStage>;
}

/** 배치 기록 한 줄. 기록 시각은 시작 시각 `startedAt` */
export interface BatchRecord {
  id: string;
  /** 진행 중이면 null */
  result: BatchResult | null;
  startedAt: IsoTimestamp;
  /** 진행 중이면 null */
  endedAt: IsoTimestamp | null;
  /** 계획 배합 */
  mix: MixPart[];
  /** 실제 배합 (섹터 지정이 걸린 적 없는 배치는 null, `Batch.actualMix`와 같다) */
  actualMix: MixPart[] | null;
  /** 섹터 지정 시작·변경·해제 기록 */
  pinChanges: BatchPinChange[];
  avgMoisturePercent: number;
  targetPressureMpa: number;
  /** 압축 때 실제로 낸 압력 MPa. 압축하지 않았거나 압축 전이면 null */
  actualPressureMpa: number | null;
  /** `baleIds.length` */
  balesProduced: number;
  baleIds: string[];
}

/** 베일 기록 한 줄. 기록 시각은 생산(결속·배출) 시각 `createdAt`. 압력·수분은 생산 당시 값(스냅샷) */
export interface BaleRecord {
  id: string;
  batchId: string;
  /** created(적치) · shipped(출하). 서버가 정한다 */
  stage: BaleStage;
  createdAt: IsoTimestamp;
  /** 출하 전에는 null */
  shippedAt: IsoTimestamp | null;
  pressureMpa: number;
  avgMoisturePercent: number;
}
