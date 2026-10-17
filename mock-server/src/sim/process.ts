import type { BatchCommand, BatchControlState, BatchEvent, ControlledBatch, BaleDetail } from '@ecocycle/shared';
import type { Bale, BaleRecord, Batch, BatchRecord, CompressorState, MixPart, ProcessState, RobotMode, TankId, TankState, Vehicle, VehicleRecord } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import type { CompanyFixture, TruckFixture } from '../fixtures/process';
import {
  BATCH_TIMING_SEC,
  COMPANIES,
  MIX_RATIOS,
  PICKS_PER_BATCH,
  PRESSURE_PER_MOISTURE_MPA,
  RECENT_LIMIT,
  TARGET_PRESSURE_MPA,
  VEHICLE_TIMING_SEC,
} from '../fixtures/process';
import { publish } from './bus';
import { addToTank, excludedTanks } from './plant';
import { finishedBatchRecords, addBatchRecord, addVehicleRecord, baleIdOf, seedRecords, toVehicleRecord } from './records';
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
const pausedBatches = new Set<string>();
const skippedBatches = new Set<string>();
const baleDetails = new Map<string, BaleDetail>();
const events: BatchEvent[] = [];
export const batchEvents = () => events;
function event(batchId: string, type: BatchEvent['type'], actor: string, detail: string, baleId?: string, at = iso(Date.now())) {
  events.push({ id: `batch-event-${events.length + 1}`, batchId, type, actor, detail, ...(baleId ? { baleId } : {}), at });
}
const sectorCode = (id: TankId) => id.replace('tank-', '').toUpperCase();
const mixLabel = (mix: MixPart[]) => mix.map(m => `${sectorCode(m.sectorId)} ${m.percent}%`).join(' · ');
/** 베일·기록에 남길 배합: 실제로 놓은 배합이 있으면 그것, 아니면 계획 */
const pressedMix = (batch: Batch): MixPart[] => structuredClone(batch.actualMix?.length ? batch.actualMix : batch.mix);
export function baleDetail(id: string): BaleDetail | undefined {
  const detail = baleDetails.get(id);
  const live = bales.find(b => b.id === id);
  return detail ? { ...detail, ...(live ?? {}) } : undefined;
}
export function batchControlState(): BatchControlState {
  const active = batches.filter(b => b.stage !== 'completed');
  active.sort((a,b) => (a.stage === 'compressing' ? -1 : b.stage === 'compressing' ? 1 : a.id.localeCompare(b.id)));
  const describe = (batch: Batch | undefined): ControlledBatch | null => batch ? {
    batch: structuredClone(batch), paused: pausedBatches.has(batch.id), skipped: skippedBatches.has(batch.id),
    progressPercent: batch.stage === 'planned' ? 0 : batch.stage === 'mixing' ? Math.min(60, Math.round([...countFor(batch).values()].reduce((a,b)=>a+b,0) / PICKS_PER_BATCH * 60)) : Math.min(99, 60 + Math.round(compressSec / BATCH_TIMING_SEC.compress * 40)),
    currentPressureMpa: batch.stage === 'compressing' ? round1(compressor().pressureMpa) : 0,
    baleIds: bales.filter(b=>b.batchId === batch.id).map(b=>b.id),
  } : null;
  return { eventsRevision: events.length, current: describe(active[0]), next: describe(active[1]), pressureRange: TARGET_PRESSURE_MPA };
}
export function applyBatchCommand(command: BatchCommand, actor: string): string | undefined {
  if (compressor().status === 'offline' || compressor().status === 'alarm') return '압축기 상태를 확인하세요. 배치 명령을 적용할 수 없습니다.';
  const batch = batches.find(b => b.id === command.batchId);
  if (!batch || batch.stage === 'completed') return '이미 끝났거나 찾을 수 없는 배치입니다.';
  switch (command.type) {
    case 'set_batch_mix': {
      if (batch.stage === 'compressing' || [...countFor(batch).values()].some(n=>n>0)) return '투입이 시작된 배합은 변경할 수 없습니다. 다음 배치를 선택하세요.';
      const mix = command.mix;
      if (!mix.length || new Set(mix.map(m=>m.sectorId)).size !== mix.length || mix.some(m=>m.percent<0 || m.percent>100) || Math.abs(mix.reduce((sum,m)=>sum+m.percent,0)-100)>=1e-8) return '배합비 합계는 100%여야 합니다. 섹터 중복은 허용하지 않습니다.';
      if (mix.some(m=>m.percent>0 && (excludedTanks.has(m.sectorId) || tank(m.sectorId).fillPercent<=0))) return '사용할 수 없는 섹터가 포함되어 있습니다.';
      const before = mixLabel(batch.mix);
      batch.mix = structuredClone(mix);
      batch.avgMoisturePercent = round1(mix.reduce((sum,m)=>sum+tank(m.sectorId).moisturePercent*m.percent,0)/100);
      basisFor(batch).moisture = batch.avgMoisturePercent;
      event(batch.id, 'mix_changed', actor, `${before} → ${mixLabel(mix)}`);
      break;
    }
    case 'set_batch_pressure':
      if (batch.stage === 'compressing') return '압축이 시작된 뒤에는 목표 압력을 변경할 수 없습니다.';
      if (command.targetPressureMpa < TARGET_PRESSURE_MPA.min || command.targetPressureMpa > TARGET_PRESSURE_MPA.max) return `압력은 ${TARGET_PRESSURE_MPA.min}~${TARGET_PRESSURE_MPA.max} MPa 범위여야 합니다.`;
      event(batch.id, 'pressure_changed', actor, `${batch.targetPressureMpa} → ${command.targetPressureMpa} MPa`);
      batch.targetPressureMpa = command.targetPressureMpa;
      // 사람이 정한 목표 압력은 실제 배합으로 다시 계산하지 않는다
      basisFor(batch).pressureByHand = true;
      break;
    case 'pause_batch':
      if (pausedBatches.has(batch.id)) return '이미 일시정지된 배치입니다.';
      pausedBatches.add(batch.id);
      event(batch.id, 'paused', actor, '배치 일시정지');
      break;
    case 'resume_batch':
      if (!pausedBatches.has(batch.id)) return '일시정지 중인 배치만 재개할 수 있습니다.';
      pausedBatches.delete(batch.id);
      event(batch.id, 'resumed', actor, '배치 재개');
      break;
    case 'skip_batch':
      if (batch.stage === 'compressing') return '압축 중에는 배치를 건너뛸 수 없습니다.';
      if (!command.reason.trim() || command.reason.trim().length > 120) return '건너뛰기 사유는 1~120자입니다.';
      event(batch.id, 'skipped', actor, command.reason.trim());
      skippedBatches.add(batch.id);
      pausedBatches.delete(batch.id);
      batch.pinning = null;
      addBatchRecord({ id: batch.id, result: 'skipped', startedAt: batch.stageTimes.planned ?? batch.updatedAt, endedAt: iso(Date.now()), mix: structuredClone(batch.mix), actualMix: structuredClone(batch.actualMix), pinChanges: structuredClone(batch.pinChanges), avgMoisturePercent: batch.avgMoisturePercent, targetPressureMpa: batch.targetPressureMpa, actualPressureMpa: null, baleIds: [], balesProduced: 0 });
      batch.stage = 'completed';
      countFor(batch).clear();
      break;
  }
  batch.updatedAt = iso(Date.now());
  sendBatch(batch);
}


let activeRuns: VehicleRun[] = [];
let vehicleSeq = 31;
let batchSeq = 412;
let lastSpawnAt = 0;
/** 배합 중인 배치에 로봇이 올린 횟수 (섹터별) */
const placedCounts = new Map<string, Map<TankId, number>>();
function countFor(batch: Batch): Map<TankId, number> {
  let count = placedCounts.get(batch.id);
  if (!count) { count = new Map(); placedCounts.set(batch.id, count); }
  return count;
}
let compressSec = 0;

// ── 섹터 지정과 실제 배합 (명세 6절 "로봇팔 7단위") ───────────────────
// 로봇이 자동 · 섹터 지정이면 배합 중인 배치에 지정을 걸고, 그 배치에 실제로 놓은 부피로 실제 배합을 계산한다.
// 평균 수분과 목표 압력은 실제 배합으로 여기(서버)서 다시 계산한다. 지정이 끝나면 남은 집기는 계획 배합비를 따른다.

/** 로봇의 지금 섹터 지정 (auto_pinned가 아니면 null) */
let robotPin: { sectors: TankId[]; actor: string } | null = null;
/** 배치별로 컨베이어에 놓은 부피(m³, 섹터별) */
const placedVolumes = new Map<string, Map<TankId, number>>();
/** 지정이 끝난 때의 놓은 횟수. 남은 집기(배치당 횟수 − 그때까지 놓은 횟수)는 이 뒤로 계획 배합비를 따른다 */
const resumeBase = new Map<string, { counts: Map<TankId, number>; placed: number }>();
/** 다시 계산의 기준: 계획 배합의 평균 수분과 계획(또는 사람이 정한) 목표 압력 */
const bases = new Map<string, { moisture: number; pressure: number; pressureByHand: boolean }>();

function basisFor(batch: Batch) {
  let basis = bases.get(batch.id);
  if (!basis) {
    basis = { moisture: batch.avgMoisturePercent, pressure: batch.targetPressureMpa, pressureByHand: false };
    bases.set(batch.id, basis);
  }
  return basis;
}

function volumesFor(batch: Batch): Map<TankId, number> {
  let volumes = placedVolumes.get(batch.id);
  if (!volumes) { volumes = new Map(); placedVolumes.set(batch.id, volumes); }
  return volumes;
}

/** 섹터별 부피 → 정수 % (합 100, 나머지가 큰 섹터부터 1씩 더한다). 섹터 순서는 A1·A2·B1·B2 */
function percentMix(volumes: Map<TankId, number>): MixPart[] {
  const total = [...volumes.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const parts = TANK_IDS.filter((id) => (volumes.get(id) ?? 0) > 0).map((id) => {
    const exact = ((volumes.get(id) ?? 0) / total) * 100;
    return { sectorId: id, percent: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let missing = 100 - parts.reduce((sum, p) => sum + p.percent, 0);
  for (const part of [...parts].sort((a, b) => b.rest - a.rest)) {
    if (missing <= 0) break;
    part.percent += 1;
    missing -= 1;
  }
  return parts.map(({ sectorId, percent }) => ({ sectorId, percent }));
}

/** 실제 배합과 그것으로 다시 계산한 평균 수분·목표 압력 */
function recomputeActual(batch: Batch): void {
  const volumes = volumesFor(batch);
  batch.actualMix = percentMix(volumes);
  const total = [...volumes.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  const basis = basisFor(batch);
  const moisture = round1([...volumes].reduce((sum, [id, v]) => sum + tank(id).moisturePercent * v, 0) / total);
  batch.avgMoisturePercent = moisture;
  if (!basis.pressureByHand) {
    const target = basis.pressure + PRESSURE_PER_MOISTURE_MPA * (moisture - basis.moisture);
    batch.targetPressureMpa = round1(Math.min(TARGET_PRESSURE_MPA.max, Math.max(TARGET_PRESSURE_MPA.min, target)));
  }
}

function pinBatch(batch: Batch, pin: { sectors: TankId[]; actor: string }, now: number, type: 'pin_started' | 'pin_changed', carried = false): void {
  basisFor(batch);
  batch.pinning = { sectors: [...pin.sectors], since: iso(now), actor: pin.actor };
  batch.pinChanges.push({ at: iso(now), actor: pin.actor, sectors: [...pin.sectors] });
  resumeBase.delete(batch.id);
  if (!batch.actualMix) recomputeActual(batch);
  event(batch.id, type, pin.actor, `${pin.sectors.map(sectorCode).join(' · ')}${carried ? ' (지정 유지, 새 배치)' : ''}`);
  batch.updatedAt = iso(now);
}

/** 로봇 모드 전환이 실행될 때 (sim/commands): 지정 섹터(지정 해제는 null)와 바꾼 사람 */
export function setRobotPin(sectors: TankId[] | null, actor: string): void {
  robotPin = sectors ? { sectors: [...sectors], actor } : null;
  const batch = batchIn('mixing');
  if (!batch) return;
  const now = Date.now();
  if (robotPin) {
    pinBatch(batch, robotPin, now, batch.pinning ? 'pin_changed' : 'pin_started');
  } else if (batch.pinning) {
    batch.pinning = null;
    batch.pinChanges.push({ at: iso(now), actor, sectors: [] });
    const counts = countFor(batch);
    resumeBase.set(batch.id, { counts: new Map(counts), placed: [...counts.values()].reduce((a, b) => a + b, 0) });
    event(batch.id, 'pin_ended', actor, '남은 집기는 계획 배합대로');
    batch.updatedAt = iso(now);
  } else return;
  sendBatch(batch);
}
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
  const detail = baleDetails.get(bale.id);
  if (detail) baleDetails.set(bale.id, { ...detail, ...structuredClone(bale) });
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
  if (stage === 'departed') {
    recordUnload(run);
    addVehicleRecord(toVehicleRecord(v, run.weight));
  }
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
  // 지정 중에 배합을 시작하는 배치에는 같은 지정을 건다. 배합이 끝나면 지정은 풀린다(기록은 남는다)
  if (stage === 'mixing' && robotPin) pinBatch(batch, robotPin, now, 'pin_started', true);
  if (stage !== 'mixing') batch.pinning = null;
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
    actualMix: null,
    pinning: null,
    pinChanges: [],
    avgMoisturePercent,
    targetPressureMpa,
    stageTimes: { planned: iso(now) },
    updatedAt: iso(now),
  };
  batchSeq += 1;
  countFor(batch).clear();
  sendBatch(batch);
  event(batch.id, 'created', '자동 공정', mixLabel(batch.mix));
}

/** 로봇이 다음에 집을 섹터. 배합 중인 배치의 배합비를 따라 서버가 정한다. 없으면 null(대기) */
export function nextPickSector(): TankId | null {
  const batch = batchIn('mixing');
  if (!batch || pausedBatches.has(batch.id)) return null;
  // 지정이 끝난 배치는 남은 횟수만 계획 배합비로 나눈다 (지정 중에 놓은 몫을 메우지 않는다)
  const base = resumeBase.get(batch.id);
  const remaining = PICKS_PER_BATCH - (base?.placed ?? 0);
  let best: TankId | null = null;
  let bestGap = 0;
  for (const part of batch.mix) {
    const done = (countFor(batch).get(part.sectorId) ?? 0) - (base?.counts.get(part.sectorId) ?? 0);
    const gap = (part.percent / 100) * remaining - done;
    if (gap > bestGap) {
      bestGap = gap;
      best = part.sectorId;
    }
  }
  return best;
}

/** 새 사이클에 투입 가능한 배치. 진행 중 사이클은 이 ID를 기억한다. */
export function mixingBatchId(): string | null {
  const batch = batchIn('mixing');
  return batch && !pausedBatches.has(batch.id) ? batch.id : null;
}

/** 진행 중 집기가 끝나면 원래 배치에만 반영한다. 일시정지 중에도 이미 집은 양은 보존한다. */
export function notePlaced(sectorId: TankId, batchId: string | null, volumeM3: number, mode: RobotMode = 'auto'): string | null {
  const batch = batches.find(b => b.id === batchId && b.stage === 'mixing');
  if (!batch) return null;
  countFor(batch).set(sectorId, (countFor(batch).get(sectorId) ?? 0) + 1);
  const volumes = volumesFor(batch);
  volumes.set(sectorId, (volumes.get(sectorId) ?? 0) + volumeM3);
  // 수동 투입도 실제 배합을 시작한다. 이전 자동 투입량과 이후 투입량을 모두 포함한다.
  if (mode === 'manual' || batch.actualMix !== null) {
    recomputeActual(batch);
    batch.updatedAt = iso(Date.now());
    sendBatch(batch);
  }
  return batch.id;
}

/** 압축 시간 중 앞부분은 누르기, 나머지는 결속·배출로 친다 (예시 비율) */
const PRESSING_SHARE = 0.7;

/** 압축기 사이클 단계: 압축 중인 배치가 있으면 누르기 → 결속·배출, 아니면 배합 중인 배치를 받는 중(투입), 둘 다 없으면 대기 */
function syncPressStage(): void {
  const compressing = batchIn('compressing');
  const mixing = batchIn('mixing');
  if (compressing && !pausedBatches.has(compressing.id)) {
    press.stage = compressSec < BATCH_TIMING_SEC.compress * PRESSING_SHARE ? 'pressing' : 'ejecting';
  } else if (mixing && !pausedBatches.has(mixing.id)) {
    press.stage = 'filling';
  } else {
    press.stage = 'idle';
  }
}

function tickBatches(now: number): void {
  const mixing = batchIn('mixing');
  const compressing = batchIn('compressing');
  const planned = batchIn('planned');

  if (compressing && !pausedBatches.has(compressing.id)) {
    // 압축기가 멈춰 있으면 압축은 진행되지 않는다
    if (compressor().running) compressSec += 1;
    if (compressSec >= BATCH_TIMING_SEC.compress) {
      press.targetMpa = null;
      setBatchStage(compressing, 'completed', now);
      const bale: Bale = {
        id: baleIdOf(compressing.id, now),
        batchId: compressing.id,
        stage: 'created',
        stageTimes: { created: iso(now) },
        updatedAt: iso(now),
      };
      // 끝난 배치는 공정 기록에 남긴다 (실제로 낸 압력은 압축기가 지금 내는 압력)
      addBatchRecord({
        id: compressing.id,
        result: 'completed',
        startedAt: compressing.stageTimes.planned ?? compressing.updatedAt,
        endedAt: iso(now),
        mix: structuredClone(compressing.mix),
        actualMix: structuredClone(compressing.actualMix),
        pinChanges: structuredClone(compressing.pinChanges),
        avgMoisturePercent: compressing.avgMoisturePercent,
        targetPressureMpa: compressing.targetPressureMpa,
        actualPressureMpa: round1(compressor().pressureMpa),
        balesProduced: 1,
        baleIds: [bale.id],
      });
      baleDetails.set(bale.id, { ...structuredClone(bale), pressureMpa: round1(compressor().pressureMpa), avgMoisturePercent: compressing.avgMoisturePercent, mix: pressedMix(compressing) });
      event(compressing.id, 'bale_produced', '자동 공정', `${bale.id} 생산`, bale.id);
      production.balesToday += 1;
      sendBale(bale);
      pendingShip.push({ bale, at: now + BATCH_TIMING_SEC.ship * 1000 });
    }
  }

  if (mixing) {
    if (!planned) planBatch(now);
    const placed = [...countFor(mixing).values()].reduce((sum, n) => sum + n, 0);
    // 앞 배치의 압축이 끝나야 다음 배치가 압축기로 들어간다
    if (!pausedBatches.has(mixing.id) && placed >= PICKS_PER_BATCH && !batchIn('compressing')) {
      compressSec = 0;
      press.targetMpa = mixing.targetPressureMpa;
      setBatchStage(mixing, 'compressing', now);
    }
  } else if (planned) {
    if (!pausedBatches.has(planned.id) && (now - Date.parse(planned.stageTimes.planned ?? planned.updatedAt)) / 1000 >= BATCH_TIMING_SEC.plan) setBatchStage(planned, 'mixing', now);
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
  syncPressStage();
}

export function processState(): ProcessState {
  return structuredClone({ vehicles, batches, bales, updatedAt: iso(Date.now()) });
}

/** 지금 진행 중인 차량의 공정 기록 줄 (끝난 차량은 sim/records가 보관한다) */
export const liveVehicleRecords = (): VehicleRecord[] => activeRuns.map((run) => toVehicleRecord(run.vehicle, run.weight));

/** 지금 진행 중인 배치의 공정 기록 줄 (끝난 배치는 sim/records가 보관한다). 아직 압축하지 않아 실제 압력·베일은 없다 */
export const liveBatchRecords = (): BatchRecord[] =>
  batches
    .filter((b) => b.stage !== 'completed')
    .map((b) => ({
      id: b.id,
      result: null,
      startedAt: b.stageTimes.planned ?? b.updatedAt,
      endedAt: null,
      mix: structuredClone(b.mix),
      actualMix: structuredClone(b.actualMix),
      pinChanges: structuredClone(b.pinChanges),
      avgMoisturePercent: b.avgMoisturePercent,
      targetPressureMpa: b.targetPressureMpa,
      actualPressureMpa: null,
      balesProduced: 0,
      baleIds: [],
    }));

/** 베일 기록 줄 (GET /bales/records): 만든 모든 베일. 단계·출하 시각은 지금 상태, 압력·수분은 생산 당시 값 */
export const baleRecords = (): BaleRecord[] =>
  [...baleDetails.keys()].flatMap((id) => {
    const bale = baleDetail(id);
    if (!bale) return [];
    return [{
      id: bale.id,
      batchId: bale.batchId,
      stage: bale.stage,
      createdAt: bale.stageTimes.created ?? bale.updatedAt,
      shippedAt: bale.stageTimes.shipped ?? null,
      pressureMpa: bale.pressureMpa,
      avgMoisturePercent: bale.avgMoisturePercent,
    }];
  });

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
    const vehicle: Vehicle = {
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
    };
    vehicles.push(vehicle);
    addVehicleRecord(toVehicleRecord(vehicle, weight));

    const seq = pad(batchSeq - i, 4);
    const ratio = MIX_RATIOS[i % MIX_RATIOS.length] as [number, number];
    const first = TANK_IDS[i % 4] as TankId;
    const second = TANK_IDS[(i + 2) % 4] as TankId;
    const done = at + 4 * 60_000;
    const batch: Batch = {
      id: `batch-${seq}`,
      stage: 'completed',
      mix: [
        { sectorId: first, percent: ratio[0] },
        { sectorId: second, percent: ratio[1] },
      ],
      actualMix: null,
      pinning: null,
      pinChanges: [],
      avgMoisturePercent: round1(10.4 + i * 0.4),
      targetPressureMpa: round1(27.6 + i * 0.5),
      stageTimes: { planned: iso(at), mixing: iso(at + 3_000), compressing: iso(done - 8_000), completed: iso(done) },
      updatedAt: iso(done),
    };
    batches.push(batch);
    addBatchRecord({
      id: batch.id,
      result: 'completed',
      startedAt: iso(at),
      endedAt: iso(done),
      mix: structuredClone(batch.mix),
      actualMix: null,
      pinChanges: [],
      avgMoisturePercent: batch.avgMoisturePercent,
      targetPressureMpa: batch.targetPressureMpa,
      actualPressureMpa: round1(batch.targetPressureMpa - 0.2),
      balesProduced: 1,
      baleIds: [baleIdOf(batch.id, done)],
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
// 그 앞의 지난 날 배치 (번호는 지난 예시 배치 바로 앞에서 거꾸로)
seedRecords(batchSeq - 5);

for (const record of finishedBatchRecords()) {
  event(record.id, 'created', '자동 공정', mixLabel(record.mix), undefined, record.startedAt);
  for (const id of record.baleIds) {
    const at = record.endedAt ?? record.startedAt;
    baleDetails.set(id, { id, batchId: record.id, stage: 'shipped', stageTimes: { created: at, shipped: iso(Date.parse(at)+25000) }, updatedAt: at, pressureMpa: record.actualPressureMpa ?? record.targetPressureMpa, avgMoisturePercent: record.avgMoisturePercent, mix: structuredClone(record.mix) });
    event(record.id, 'bale_produced', '자동 공정', `${id} 생산`, id, at);
  }
  if (record.result === 'skipped') event(record.id, 'skipped', '관리자(모의)', '배합 품질 재점검', undefined, record.endedAt ?? record.startedAt);
  if (record.result === 'paused') event(record.id, 'paused', '관리자(모의)', '자동 공정', undefined, record.endedAt ?? record.startedAt);
}
