import type { Phase, RobotMode, RobotState, TankId, TankState } from '@ecocycle/shared';
import { publish } from './bus';
import { addToConveyor, excludedTanks, removeFromTank } from './plant';
import { mixingBatchId, nextPickSector, notePlaced } from './process';
import { publishDevice } from './publish';
import { pickVolumeM3, recordPick } from './picks';
import { devices, getSetting } from './state';

// 집기 → 이동 → 놓기 사이클을 흉내 낸다. 관절 값은 15Hz로 보낸다.
// 관절 순서와 범위는 fixtures/robotModel.ts (base, shoulder, elbow, wrist1, wrist2, wrist3, 단위 도).
// 자동 모드에서는 사이클을 계속 돌린다. 수동 모드에서는 사람이 두 번 나눠 조작한다(명세 6절 "로봇팔 7단위"):
//   pick_from → 섹터에서 집어 들고 그 위에서 멈춤(놓기 대기) → place_on_conveyor → 컨베이어로 옮겨 놓음.

const JOINTS_HZ = 15;
const DURATION_SEC: Record<Exclude<Phase, 'idle'>, number> = { pick: 4, move: 4, place: 3 };
/** 수동 집기는 내려가 집은 뒤 다시 들어 올리는 데까지라 조금 길다 */
const GRAB_SEC = 5;
const IDLE_GAP_SEC = 1;

type Pose = [number, number, number, number, number, number];

const HOME: Pose = [0, 10, -20, 0, 10, 0];
const TANK_BASE_DEG: Record<TankId, number> = { 'tank-a1': -60, 'tank-a2': -25, 'tank-b1': 25, 'tank-b2': 60 };
const CONVEYOR_BASE_DEG = 150;

const above = (base: number): Pose => [base, 25, -35, 0, 20, 0];
const down = (base: number): Pose => [base, 45, -70, 0, 25, 0];

const robot = () => devices['robot-1'] as RobotState;

const smooth = (p: number) => p * p * (3 - 2 * p);

function lerpPose(a: Pose, b: Pose, p: number): Pose {
  const k = smooth(Math.min(1, Math.max(0, p)));
  return a.map((v, i) => v + ((b[i] ?? v) - v) * k) as Pose;
}

/**
 * 사이클 종류: full(자동: 집기 → 이동 → 놓기), grab(수동 집기: 집어 들고 멈춤), place(놓기: 들고 있는 것을 옮겨 놓기).
 * 수동 모드의 두 명령과 자동 모드에서 들고 있던 것을 먼저 놓는 경우가 grab·place를 쓴다.
 */
type CycleKind = 'full' | 'grab' | 'place';
type Pending = { kind: 'grab'; tankId: TankId; actor: string } | { kind: 'place'; actor: string } | null;

let pose: Pose = [...HOME];
let startPose: Pose = [...HOME];
let elapsedSec = 0;
let idleSec = IDLE_GAP_SEC;
let seq = 0;
let lastTickAt = Date.now();
let picked = false;
let placed = false;
let pending: Pending = null;
let cycleKind: CycleKind = 'full';
let cycleMode: RobotMode = 'auto';
let cycleBatchId: string | null = null;
let pickedVolume = 0;
let pinCursor = 0;
/** 지금 들고 있는 것을 집은 시각·사람 (집기 기록에 함께 남긴다) */
let grabbedAt: string | null = null;
let grabbedBy: string | null = null;
let placedBy: string | null = null;

/** 시나리오용: 자동 사이클이 이 탱크를 건너뛰게 한다 */
export function excludeFromRotation(id: TankId): void {
  excludedTanks.add(id);
}

/** 자동 모드에서 다음에 집을 섹터. 배합할 배치가 없으면 null(기다린다) */
function autoTarget(): TankId | null {
  const r = robot();
  if (r.mode !== 'auto_pinned') return nextPickSector();
  if (!mixingBatchId()) return null;
  for (let i = 0; i < r.pinnedSectors.length; i++) {
    const id = r.pinnedSectors[pinCursor++ % r.pinnedSectors.length]!;
    const sector = devices[id] as TankState;
    if (!excludedTanks.has(id) && sector.status !== 'offline' && sector.volumeM3 > 0) return id;
  }
  return null;
}

function startCycle(kind: CycleKind, target: TankId, actor: string | null = null): void {
  const r = robot();
  cycleKind = kind;
  cycleMode = r.mode;
  r.targetTankId = target;
  r.phase = kind === 'place' ? 'move' : 'pick';
  elapsedSec = 0;
  startPose = [...pose];
  placed = false;
  if (kind === 'place') {
    // 놓을 배치는 옮기기 시작할 때 정한다(수동은 집기와 놓기 사이에 배치가 바뀔 수 있다)
    cycleBatchId = mixingBatchId();
    placedBy = actor;
  } else {
    cycleBatchId = kind === 'full' ? mixingBatchId() : null;
    picked = false;
    pickedVolume = 0;
    grabbedBy = actor;
    placedBy = null;
  }
}

function poseFor(phase: Exclude<Phase, 'idle'>, progress: number, tankId: TankId): Pose {
  const base = TANK_BASE_DEG[tankId];
  if (phase === 'pick') {
    if (cycleKind === 'grab') {
      // 수동 집기: 섹터 위로 → 내려가 집기 → 다시 들어 올려 그 위에서 멈춤
      if (progress < 0.4) return lerpPose(startPose, above(base), progress / 0.4);
      if (progress < 0.75) return lerpPose(above(base), down(base), (progress - 0.4) / 0.35);
      return lerpPose(down(base), above(base), (progress - 0.75) / 0.25);
    }
    // 앞 절반: 탱크 위로 이동, 뒤 절반: 내려가서 집기
    return progress < 0.5
      ? lerpPose(startPose, above(base), progress / 0.5)
      : lerpPose(above(base), down(base), (progress - 0.5) / 0.5);
  }
  if (phase === 'move') {
    // 앞 25%: 지금 자세에서 들어 올리기(수동 놓기는 이미 들어 올린 자세), 나머지: 컨베이어 위로 이동
    return progress < 0.25
      ? lerpPose(startPose, above(base), progress / 0.25)
      : lerpPose(above(base), above(CONVEYOR_BASE_DEG), (progress - 0.25) / 0.75);
  }
  // place: 앞 절반 내려가서 놓기, 뒤 절반 다시 올라가기
  return progress < 0.5
    ? lerpPose(above(CONVEYOR_BASE_DEG), down(CONVEYOR_BASE_DEG), progress / 0.5)
    : lerpPose(down(CONVEYOR_BASE_DEG), above(CONVEYOR_BASE_DEG), (progress - 0.5) / 0.5);
}

function grab(tankId: TankId): void {
  const r = robot();
  picked = true;
  // 집히는 부피는 더미 높이·등급에 따라 매번 다르다. 섹터에 남은 양보다 많이 집을 수는 없다
  const sector = devices[tankId] as TankState;
  const wanted = pickVolumeM3(sector.fillPercent, sector.grade);
  pickedVolume = removeFromTank(tankId, (wanted / sector.capacityM3) * 100);
  grabbedAt = new Date().toISOString();
  if (pickedVolume > 0) {
    r.gripper = { closed: true, holding: true };
    r.heldSectorId = tankId;
  } else {
    // 빈 섹터라 아무것도 못 집었다
    r.gripper = { closed: true, holding: false };
    r.heldSectorId = null;
  }
}

function place(tankId: TankId): void {
  const r = robot();
  placed = true;
  r.gripper = { closed: false, holding: false };
  r.heldSectorId = null;
  // 빈 섹터라 아무것도 못 집었으면 벨트에 올라가는 덩어리도 없다
  if (pickedVolume > 0) {
    const batchId = notePlaced(tankId, cycleBatchId, pickedVolume);
    addToConveyor(6);
    recordPick({
      mode: cycleMode,
      sectorId: tankId,
      volumeM3: pickedVolume,
      conveyorId: 'conveyor-z',
      batchId,
      grabbedAt: grabbedAt ?? new Date().toISOString(),
      grabbedBy,
      placedBy,
    });
    r.pickRecordsRevision += 1;
  }
  pickedVolume = 0;
  grabbedAt = null;
}

function advance(dtSec: number): void {
  const r = robot();
  // 일시정지·정지·오류·연결 끊김에서는 사이클을 진행하지 않고 자세를 유지한다.
  if (r.status !== 'running') return;

  if (r.phase === 'idle') {
    if (r.mode !== 'manual') {
      idleSec += dtSec;
      if (idleSec < IDLE_GAP_SEC) return;
      // 들고 있던 것(수동에서 바꾸기 전, 정지 뒤)이 있으면 먼저 놓는다
      if (r.heldSectorId) return startCycle('place', r.heldSectorId);
      const target = autoTarget();
      if (target) startCycle('full', target);
    } else if (pending) {
      const next = pending;
      pending = null;
      if (next.kind === 'grab') startCycle('grab', next.tankId, next.actor);
      else if (r.heldSectorId) startCycle('place', r.heldSectorId, next.actor);
    }
    return;
  }

  // 진행 중인 사이클은 모드를 바꿔도 끝까지 마친다.
  const speed = getSetting('robot-1', 'speedPercent') / 100;
  const phase = r.phase;
  const tankId = r.targetTankId ?? 'tank-a1';
  const duration = phase === 'pick' && cycleKind === 'grab' ? GRAB_SEC : DURATION_SEC[phase];
  elapsedSec += dtSec * speed;
  const progress = Math.min(1, elapsedSec / duration);
  pose = poseFor(phase, progress, tankId);

  if (phase === 'pick' && !picked && progress >= (cycleKind === 'grab' ? 0.72 : 0.9)) grab(tankId);
  if (phase === 'place' && progress >= 0.5 && !placed) place(tankId);

  if (progress >= 1) {
    elapsedSec = 0;
    startPose = [...pose];
    if (phase === 'pick' && cycleKind !== 'grab' && r.heldSectorId) r.phase = 'move';
    else if (phase === 'move') r.phase = 'place';
    else {
      // 수동 집기는 들어 올린 채 멈춘다(놓기 대기). 못 집었으면 그리퍼를 연다
      if (!r.heldSectorId) r.gripper = { closed: false, holding: false };
      r.phase = 'idle';
      r.targetTankId = null;
      idleSec = 0;
    }
  }
}

/**
 * 정지 명령·오류: 하던 사이클을 버리고 대기 상태로 돌아간다 (자세는 그대로).
 * 들고 있는 것은 놓지 않는다(그리퍼는 닫힌 채): 수동이면 "놓기"로, 자동이면 다음 사이클에서 먼저 놓는다.
 */
export function resetRobotCycle(): void {
  const r = robot();
  r.phase = 'idle';
  r.targetTankId = null;
  if (!r.heldSectorId) r.gripper = { closed: false, holding: false };
  pending = null;
  elapsedSec = 0;
  idleSec = IDLE_GAP_SEC;
  picked = false;
  placed = false;
}

/** 수동 모드 집기를 요청한다. 지금 할 수 없으면(작업 중·들고 있음·수동 아님) false */
export function requestManualPick(tankId: TankId, actor: string): boolean {
  const r = robot();
  if (r.status !== 'running' || r.mode !== 'manual' || r.phase !== 'idle' || r.heldSectorId || pending) return false;
  pending = { kind: 'grab', tankId, actor };
  return true;
}

/** 수동 모드 놓기를 요청한다. 들고 있는 것이 없거나 지금 할 수 없으면 false */
export function requestManualPlace(actor: string): boolean {
  const r = robot();
  if (r.status !== 'running' || r.mode !== 'manual' || r.phase !== 'idle' || !r.heldSectorId || pending) return false;
  pending = { kind: 'place', actor };
  return true;
}

/** 1/15초마다: 사이클 진행, 상태 변화 알림, robot.joints 전송 */
export function tickRobot(): void {
  const now = Date.now();
  const dtSec = Math.min(0.5, (now - lastTickAt) / 1000);
  lastTickAt = now;

  advance(dtSec);
  publishDevice(robot());

  const r = robot();
  seq += 1;
  publish({
    type: 'robot.joints',
    deviceId: 'robot-1',
    seq,
    ts: new Date(now).toISOString(),
    joints: pose.map((v) => Math.round(v * 10) / 10),
    gripper: { ...r.gripper },
    phase: r.phase,
    targetTankId: r.targetTankId,
  });
}

export const ROBOT_TICK_MS = Math.round(1000 / JOINTS_HZ);
