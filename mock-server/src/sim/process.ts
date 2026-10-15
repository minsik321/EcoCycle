import type { Bale, Batch, CompressorState, MixPart, ProcessState, TankId, TankState, Vehicle } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import type { CompanyFixture, TruckFixture } from '../fixtures/process';
import {
  BATCH_TIMING_SEC,
  COMPANIES,
  MIX_RATIOS,
  PICKS_PER_BATCH,
  RECENT_LIMIT,
  TARGET_PRESSURE_MPA,
  VEHICLE_TIMING_SEC,
} from '../fixtures/process';
import { publish } from './bus';
import { addToTank, excludedTanks } from './plant';
import { devices, press, production } from './state';
import { addUnloadRecord, fillGainPercent, weighTruck } from './unloads';

// 공정 흐름 시뮬레이터: 차량(입고·인식·하역·출차), 배치(계획·배합·압축), 베일(배출·출하).
// 실서버에서는 서버가 정하는 값(회사·배정 섹터·배합비·목표 압력)을 fixtures의 예시로 흉내 낸다.
// stage가 바뀔 때마다 대상 전체 상태를 보낸다 (명세 6절 "공정 흐름").

const iso = (ms: number) => new Date(ms).toISOString();
const pad = (n: number, width: number) => String(n).padStart(width, '0');
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** 현장 날짜(한국 시각) yyyymmdd. ID에 쓴다 */
function siteDate(ms: number): string {
  return iso(ms + 9 * 3_600_000).slice(0, 10).replaceAll('-', '');
}

const tank = (id: TankId) => devices[id] as TankState;
const compressor = () => devices['compressor-1'] as CompressorState;

interface VehicleRun {
  vehicle: Vehicle;
  company: CompanyFixture;
  truck: TruckFixture;
  /** 계중대 무게 (입차 때 총중량, 출차 때 공차를 잰 것으로 친다) */
  weight: { grossT: number; tareT: number; netT: number };
  /** 하역 직전·직후 섹터 적재율 % */
  fillBefore: number | null;
  fillAfter: number | null;
  /** 지금 단계에 들어선 시각(ms) */
  stageAt: number;
}

const vehicles: Vehicle[] = [];
const batches: Batch[] = [];
const bales: Bale[] = [];

let activeRuns: VehicleRun[] = [];
let vehicleSeq = 31;
let batchSeq = 412;
let lastSpawnAt = 0;
/** 배합 중인 배치에 로봇이 올린 횟수 (섹터별) */
const placedCount = new Map<TankId, number>();
let batchStageAt = Date.now();
let compressSec = 0;
const pendingShip: { bale: Bale; at: number }[] = [];

function remember<T extends { id: string }>(list: T[], item: T): void {
  const index = list.findIndex((x) => x.id === item.id);
  if (index >= 0) list[index] = item;
  else list.push(item);
  while (list.length > RECENT_LIMIT) list.shift();
}

function sendVehicle(vehicle: Vehicle): void {
  remember(vehicles, vehicle);
  publish({ type: 'process.vehicle', vehicle: structuredClone(vehicle) });
}

function sendBatch(batch: Batch): void {
  remember(batches, batch);
  publish({ type: 'process.batch', batch: structuredClone(batch) });
}

function sendBale(bale: Bale): void {
  remember(bales, bale);
  publish({ type: 'process.bale', bale: structuredClone(bale) });
}

// ── 차량 ──────────────────────────────────────────────────────────────

function setVehicleStage(run: VehicleRun, stage: Vehicle['stage'], now: number): void {
  const v = run.vehicle;
  v.stage = stage;
  v.stageTimes[stage] = iso(now);
  v.updatedAt = iso(now);
  run.stageAt = now;
  if (stage === 'identified') {
    v.plate = run.truck.plate;
    v.companyName = run.company.name;
    v.sectorId = run.company.sectorId;
  }
  if (stage === 'unloading') run.fillBefore = tank(run.company.sectorId).fillPercent;
  if (stage === 'unloaded') run.fillAfter = tank(run.company.sectorId).fillPercent;
  // 출차 계량(공차)까지 마치면 하역 기록 한 줄이 생긴다
  if (stage === 'departed') recordUnload(run);
  sendVehicle(v);
}

/** 계중대가 비어 있고 받을 섹터가 있으면 차량 한 대를 들인다 (섹터 하나에 차량 한 대씩) */
function spawnVehicle(now: number): void {
  if (now - lastSpawnAt < VEHICLE_TIMING_SEC.spawnGap * 1000) return;
  if (activeRuns.length >= 2) return;
  if (activeRuns.some((r) => r.vehicle.stage === 'arrived' || r.vehicle.stage === 'identified')) return;
  const busy = new Set(activeRuns.map((r) => r.company.sectorId));
  const candidates = COMPANIES.filter((c) => !busy.has(c.sectorId) && tank(c.sectorId).fillPercent < 60);
  if (candidates.length === 0) return;
  const lowest = Math.min(...candidates.map((c) => tank(c.sectorId).fillPercent));
  const company = pick(candidates.filter((c) => tank(c.sectorId).fillPercent === lowest));

  const truck = pick(company.trucks);
  vehicleSeq += 1;
  lastSpawnAt = now;
  const run: VehicleRun = {
    vehicle: {
      id: `veh-${siteDate(now)}-${pad(vehicleSeq, 3)}`,
      stage: 'arrived',
      plate: null,
      companyName: null,
      sectorId: null,
      stageTimes: { arrived: iso(now) },
      updatedAt: iso(now),
    },
    company,
    truck,
    weight: weighTruck(truck),
    fillBefore: null,
    fillAfter: null,
    stageAt: now,
  };
  activeRuns.push(run);
  sendVehicle(run.vehicle);
}

function tickVehicles(now: number): void {
  for (const run of activeRuns) {
    const waitedSec = (now - run.stageAt) / 1000;
    switch (run.vehicle.stage) {
      case 'arrived':
        if (waitedSec >= VEHICLE_TIMING_SEC.identify) setVehicleStage(run, 'identified', now);
        break;
      case 'identified':
        if (waitedSec >= VEHICLE_TIMING_SEC.toSector) setVehicleStage(run, 'unloading', now);
        break;
      case 'unloading':
        // 쏟는 동안 섹터 더미가 조금씩 자란다
        addToTank(run.company.sectorId, fillGainPercent(run.weight.netT) / VEHICLE_TIMING_SEC.unload);
        if (waitedSec >= VEHICLE_TIMING_SEC.unload) setVehicleStage(run, 'unloaded', now);
        break;
      case 'unloaded':
        if (waitedSec >= VEHICLE_TIMING_SEC.leave) setVehicleStage(run, 'departed', now);
        break;
      case 'departed':
        break;
    }
  }
  activeRuns = activeRuns.filter((r) => r.vehicle.stage !== 'departed');
  spawnVehicle(now);
}

function recordUnload(run: VehicleRun): void {
  const v = run.vehicle;
  addUnloadRecord({
    id: v.id.replace(/^veh-/, 'unl-'),
    vehicleId: v.id,
    sectorId: run.company.sectorId,
    plate: run.truck.plate,
    companyName: run.company.name,
    unloadedAt: v.stageTimes.unloaded ?? v.updatedAt,
    ...run.weight,
    fillBeforePercent: run.fillBefore ?? tank(run.company.sectorId).fillPercent,
    fillAfterPercent: run.fillAfter ?? tank(run.company.sectorId).fillPercent,
  });
}

// ── 배치·베일 ─────────────────────────────────────────────────────────

const batchIn = (stage: Batch['stage']) => batches.find((b) => b.stage === stage);

function setBatchStage(batch: Batch, stage: Batch['stage'], now: number): void {
  batch.stage = stage;
  batch.stageTimes[stage] = iso(now);
  batch.updatedAt = iso(now);
  sendBatch(batch);
}

/** 적재가 많은 섹터 두 곳을 골라 배합을 계획한다 (예시 규칙) */
function planBatch(now: number): void {
  const usable = TANK_IDS.filter((id) => !excludedTanks.has(id) && tank(id).fillPercent > 15).sort(
    (a, b) => tank(b).fillPercent - tank(a).fillPercent,
  );
  const [first, second] = usable;
  if (!first) return;
  const ratio = pick(MIX_RATIOS);
  const mix: MixPart[] = second
    ? [
        { sectorId: first, percent: ratio[0] },
        { sectorId: second, percent: ratio[1] },
      ]
    : [{ sectorId: first, percent: 100 }];
  // 평균 수분은 섹터 수분의 배합비 가중 평균 (서버가 계산해 보내는 값)
  const avgMoisturePercent = round1(mix.reduce((sum, m) => sum + tank(m.sectorId).moisturePercent * m.percent, 0) / 100);
  const targetPressureMpa = round1(
    TARGET_PRESSURE_MPA.min + Math.random() * (TARGET_PRESSURE_MPA.max - TARGET_PRESSURE_MPA.min),
  );
  const batch: Batch = {
    id: `batch-${pad(batchSeq, 4)}`,
    stage: 'planned',
    mix,
    avgMoisturePercent,
    targetPressureMpa,
    stageTimes: { planned: iso(now) },
    updatedAt: iso(now),
  };
  batchSeq += 1;
  batchStageAt = now;
  placedCount.clear();
  sendBatch(batch);
}

/** 로봇이 다음에 집을 섹터. 배합 중인 배치의 배합비를 따라 서버가 정한다. 없으면 null(대기) */
export function nextPickSector(): TankId | null {
  const batch = batchIn('mixing');
  if (!batch) return null;
  let best: TankId | null = null;
  let bestGap = 0;
  for (const part of batch.mix) {
    const gap = (part.percent / 100) * PICKS_PER_BATCH - (placedCount.get(part.sectorId) ?? 0);
    if (gap > bestGap) {
      bestGap = gap;
      best = part.sectorId;
    }
  }
  return best ?? batch.mix[0]?.sectorId ?? null;
}

/** 로봇이 컨베이어에 한 번 올렸을 때 (로봇 시뮬레이터가 호출) */
export function notePlaced(sectorId: TankId): void {
  if (!batchIn('mixing')) return;
  placedCount.set(sectorId, (placedCount.get(sectorId) ?? 0) + 1);
}

function tickBatches(now: number): void {
  const mixing = batchIn('mixing');
  const compressing = batchIn('compressing');
  const planned = batchIn('planned');

  if (compressing) {
    // 압축기가 멈춰 있으면 압축은 진행되지 않는다
    if (compressor().running) compressSec += 1;
    if (compressSec >= BATCH_TIMING_SEC.compress) {
      press.targetMpa = null;
      setBatchStage(compressing, 'completed', now);
      const seq = compressing.id.split('-')[1] ?? '0000';
      const bale: Bale = {
        id: `BL-${siteDate(now)}-${seq}`,
        batchId: compressing.id,
        stage: 'created',
        stageTimes: { created: iso(now) },
        updatedAt: iso(now),
      };
      production.balesToday += 1;
      sendBale(bale);
      pendingShip.push({ bale, at: now + BATCH_TIMING_SEC.ship * 1000 });
    }
  }

  if (mixing) {
    const placed = [...placedCount.values()].reduce((sum, n) => sum + n, 0);
    // 앞 배치의 압축이 끝나야 다음 배치가 압축기로 들어간다
    if (placed >= PICKS_PER_BATCH && !batchIn('compressing')) {
      compressSec = 0;
      press.targetMpa = mixing.targetPressureMpa;
      setBatchStage(mixing, 'compressing', now);
    }
  } else if (planned) {
    if ((now - batchStageAt) / 1000 >= BATCH_TIMING_SEC.plan) setBatchStage(planned, 'mixing', now);
  } else {
    planBatch(now);
  }

  while (pendingShip[0] && pendingShip[0].at <= now) {
    const { bale } = pendingShip.shift() as { bale: Bale };
    bale.stage = 'shipped';
    bale.stageTimes.shipped = iso(now);
    bale.updatedAt = iso(now);
    sendBale(bale);
  }
}

/** 1초마다 */
export function tickProcess(): void {
  const now = Date.now();
  tickVehicles(now);
  tickBatches(now);
}

export function processState(): ProcessState {
  return structuredClone({ vehicles, batches, bales, updatedAt: iso(Date.now()) });
}

/** 시작할 때 표가 비어 있지 않게 지나간 예시 기록을 채워 둔다 */
function seedRecent(): void {
  const now = Date.now();
  for (let i = 4; i >= 1; i -= 1) {
    const at = now - i * 9 * 60_000;
    const company = COMPANIES[(i * 2) % COMPANIES.length] as CompanyFixture;
    const truck = company.trucks[0] as TruckFixture;
    const vehicleId = `veh-${siteDate(at)}-${pad(vehicleSeq - i + 1, 3)}`;
    const weight = weighTruck(truck);
    const fillAfter = tank(company.sectorId).fillPercent;
    addUnloadRecord({
      id: vehicleId.replace(/^veh-/, 'unl-'),
      vehicleId,
      sectorId: company.sectorId,
      plate: truck.plate,
      companyName: company.name,
      unloadedAt: iso(at + 31_000),
      ...weight,
      fillBeforePercent: round1(Math.max(0, fillAfter - fillGainPercent(weight.netT))),
      fillAfterPercent: fillAfter,
    });
    vehicles.push({
      id: vehicleId,
      stage: 'departed',
      plate: truck.plate,
      companyName: company.name,
      sectorId: company.sectorId,
      stageTimes: {
        arrived: iso(at),
        identified: iso(at + 6_000),
        unloading: iso(at + 22_000),
        unloaded: iso(at + 31_000),
        departed: iso(at + 45_000),
      },
      updatedAt: iso(at + 45_000),
    });

    const seq = pad(batchSeq - i, 4);
    const ratio = MIX_RATIOS[i % MIX_RATIOS.length] as [number, number];
    const first = TANK_IDS[i % 4] as TankId;
    const second = TANK_IDS[(i + 2) % 4] as TankId;
    const done = at + 4 * 60_000;
    batches.push({
      id: `batch-${seq}`,
      stage: 'completed',
      mix: [
        { sectorId: first, percent: ratio[0] },
        { sectorId: second, percent: ratio[1] },
      ],
      avgMoisturePercent: round1(10.4 + i * 0.4),
      targetPressureMpa: round1(27.6 + i * 0.5),
      stageTimes: { planned: iso(at), mixing: iso(at + 3_000), compressing: iso(done - 8_000), completed: iso(done) },
      updatedAt: iso(done),
    });
    bales.push({
      id: `BL-${siteDate(done)}-${seq}`,
      batchId: `batch-${seq}`,
      stage: 'shipped',
      stageTimes: { created: iso(done), shipped: iso(done + 25_000) },
      updatedAt: iso(done + 25_000),
    });
  }
}

seedRecent();
