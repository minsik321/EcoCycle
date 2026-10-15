import type { BatchRecord, MixPart, TankId, Vehicle, VehicleRecord } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import { BATCH_HISTORY, MIX_RATIOS, TARGET_PRESSURE_MPA } from '../fixtures/process';

// 공정 기록 (GET /vehicles/records, /batches/records 와 한 건 조회). 끝난 차량·배치를 보관하고,
// 기간 고르기·쪽 넘기기를 볼 수 있게 시작할 때 지난 며칠치 배치를 채워 둔다(차량 기록은 sim/unloads가 하역 기록과 함께 채운다).
// 지금 진행 중인 차량·배치는 sim/process가 `live...Records()`로 따로 내주고 라우터가 합친다. 회사·번호판은 가상이다.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 현장 시각(한국) = UTC + 9 */
const SITE_OFFSET = 9 * HOUR;

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const round1 = (n: number) => Math.round(n * 10) / 10;
const pad = (n: number, width: number) => String(n).padStart(width, '0');
const iso = (ms: number) => new Date(ms).toISOString();
const siteDate = (ms: number) => iso(ms + SITE_OFFSET).slice(0, 10).replaceAll('-', '');

const vehicleHistory: VehicleRecord[] = [];
const batchHistory: BatchRecord[] = [];

interface Weight {
  grossT: number;
  tareT: number;
  netT: number;
}

/** 공정 흐름의 차량 한 대를 기록 한 줄로: 출차 계량 전에는 공차·순중량이 없다 */
export function toVehicleRecord(vehicle: Vehicle, weight: Weight): VehicleRecord {
  const departed = vehicle.stage === 'departed';
  const status = departed ? 'departed' : vehicle.stage === 'unloading' || vehicle.stage === 'unloaded' ? 'unloading' : 'identified';
  return {
    id: vehicle.id,
    status,
    plate: vehicle.plate,
    companyName: vehicle.companyName,
    sectorId: vehicle.sectorId,
    arrivedAt: vehicle.stageTimes.arrived ?? vehicle.updatedAt,
    departedAt: vehicle.stageTimes.departed ?? null,
    grossT: weight.grossT,
    tareT: departed ? weight.tareT : null,
    netT: departed ? weight.netT : null,
    stageTimes: { ...vehicle.stageTimes },
  };
}

/** 출차를 마친 차량 기록 한 줄을 남긴다. 오래된 기록은 버린다 */
export function addVehicleRecord(record: VehicleRecord): void {
  vehicleHistory.push(record);
  const keepFrom = Date.now() - BATCH_HISTORY.keepDays * DAY;
  while (vehicleHistory[0] && Date.parse(vehicleHistory[0].arrivedAt) < keepFrom) vehicleHistory.shift();
}

/** 끝난 배치 기록 한 줄을 남긴다. 오래된 기록은 버린다 */
export function addBatchRecord(record: BatchRecord): void {
  batchHistory.push(record);
  const keepFrom = Date.now() - BATCH_HISTORY.keepDays * DAY;
  while (batchHistory[0] && Date.parse(batchHistory[0].startedAt) < keepFrom) batchHistory.shift();
}

export const finishedVehicleRecords = (): readonly VehicleRecord[] => vehicleHistory;
export const finishedBatchRecords = (): readonly BatchRecord[] => batchHistory;

/** 베일 ID: 배치 번호를 그대로 쓴다 (`batch-0407` → `BL-20261015-0407`) */
export const baleIdOf = (batchId: string, at: number): string => `BL-${siteDate(at)}-${batchId.split('-')[1] ?? '0000'}`;

/**
 * 시작할 때 지난 날의 배치를 채운다: 하루 몇 개, 작업 시간 안에 흩어서. 대부분 완료이고 가끔 건너뜀·일시정지됨.
 * 번호는 지난 예시 배치(sim/process의 seedRecent) 바로 앞에서 거꾸로 센다(`lastSeq`가 가장 최근 번호).
 */
function seedBatchHistory(until: number, lastSeq: number): void {
  const todaySite = Math.floor((until + SITE_OFFSET) / DAY) * DAY - SITE_OFFSET; // 오늘 0시(현장)의 UTC ms
  const [openH, closeH] = BATCH_HISTORY.workHours;
  const [minN, maxN] = BATCH_HISTORY.perDay;
  const starts: number[] = [];
  for (let day = BATCH_HISTORY.seedDays; day >= 0; day -= 1) {
    const count = minN + Math.floor(Math.random() * (maxN - minN + 1));
    for (let i = 0; i < count; i += 1) starts.push(todaySite - day * DAY + rnd(openH, closeH) * HOUR);
  }
  const times = starts.filter((t) => t < until).sort((a, b) => a - b);
  const firstSeq = lastSeq - times.length + 1;
  times.forEach((startMs, index) => {
    const seq = firstSeq + index;
    if (seq < 1) return;
    const id = `batch-${pad(seq, 4)}`;
    addBatchRecord(makeHistoricBatch(id, startMs));
  });
}

function makeHistoricBatch(id: string, startMs: number): BatchRecord {
  const ids = [...TANK_IDS].sort(() => Math.random() - 0.5);
  const ratio = MIX_RATIOS[Math.floor(Math.random() * MIX_RATIOS.length)] as [number, number];
  const mix: MixPart[] = [
    { sectorId: ids[0] as TankId, percent: ratio[0] },
    { sectorId: ids[1] as TankId, percent: ratio[1] },
  ];
  const avgMoisturePercent = round1(rnd(9.2, 14.2));
  const targetPressureMpa = round1(rnd(TARGET_PRESSURE_MPA.min, TARGET_PRESSURE_MPA.max));
  const roll = Math.random();
  const result = roll < BATCH_HISTORY.skipChance ? 'skipped' : roll < BATCH_HISTORY.skipChance + BATCH_HISTORY.pauseChance ? 'paused' : 'completed';
  const durationMs = (result === 'skipped' ? rnd(0.3, 1.5) : result === 'paused' ? rnd(3, 7) : rnd(4, 9)) * 60_000;
  const endMs = startMs + durationMs;
  const baleIds = result === 'completed' ? [baleIdOf(id, endMs)] : [];
  return {
    id,
    result,
    startedAt: iso(startMs),
    endedAt: iso(endMs),
    mix,
    avgMoisturePercent,
    targetPressureMpa,
    actualPressureMpa: result === 'completed' ? round1(targetPressureMpa + rnd(-0.5, 0.3)) : result === 'paused' ? round1(targetPressureMpa * rnd(0.4, 0.85)) : null,
    balesProduced: baleIds.length,
    baleIds,
  };
}

/** 차량 기록의 지난 며칠치는 하역 기록과 함께 sim/unloads가 채운다. 배치는 여기서, 가장 최근 번호는 sim/process의 지난 예시 배치 바로 앞 */
export function seedRecords(lastBatchSeq: number): void {
  seedBatchHistory(Date.now() - 45 * 60_000, lastBatchSeq);
}
