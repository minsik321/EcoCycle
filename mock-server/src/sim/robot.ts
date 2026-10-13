import type { Phase, RobotState, TankId } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import { publish } from './bus';
import { addToConveyor, removeFromTank } from './plant';
import { publishDevice } from './publish';
import { devices, getSetting } from './state';

// 집기 → 이동 → 놓기 사이클을 흉내 낸다. 관절 값은 15Hz로 보낸다.
// 관절 순서와 범위는 fixtures/robotModel.ts (base, shoulder, elbow, wrist1, wrist2, wrist3, 단위 도).
// 자동 모드에서는 사이클을 계속 돌리고, 수동 모드에서는 pick_from 명령 때만 한 사이클을 돈다.

const JOINTS_HZ = 15;
const DURATION_SEC: Record<Exclude<Phase, 'idle'>, number> = { pick: 4, move: 4, place: 3 };
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

let pose: Pose = [...HOME];
let startPose: Pose = [...HOME];
let elapsedSec = 0;
let idleSec = IDLE_GAP_SEC;
let nextTankIndex = 0;
let seq = 0;
let lastTickAt = Date.now();
let picked = false;
let placed = false;
let pendingTank: TankId | null = null;
const excludedTanks = new Set<TankId>();

/** 시나리오용: 자동 사이클이 이 탱크를 건너뛰게 한다 */
export function excludeFromRotation(id: TankId): void {
  excludedTanks.add(id);
}

function startCycle(tankId?: TankId): void {
  const r = robot();
  if (tankId) {
    r.targetTankId = tankId;
  } else {
    let next = TANK_IDS[nextTankIndex % TANK_IDS.length] ?? 'tank-a1';
    nextTankIndex += 1;
    for (let i = 0; i < TANK_IDS.length && excludedTanks.has(next); i += 1) {
      next = TANK_IDS[nextTankIndex % TANK_IDS.length] ?? 'tank-a1';
      nextTankIndex += 1;
    }
    r.targetTankId = next;
  }
  r.phase = 'pick';
  elapsedSec = 0;
  startPose = [...pose];
  picked = false;
  placed = false;
}

function poseFor(phase: Exclude<Phase, 'idle'>, progress: number, tankId: TankId): Pose {
  const base = TANK_BASE_DEG[tankId];
  if (phase === 'pick') {
    // 앞 절반: 탱크 위로 이동, 뒤 절반: 내려가서 집기
    return progress < 0.5
      ? lerpPose(startPose, above(base), progress / 0.5)
      : lerpPose(above(base), down(base), (progress - 0.5) / 0.5);
  }
  if (phase === 'move') {
    // 앞 25%: 들어 올리기, 나머지: 컨베이어 위로 이동
    return progress < 0.25
      ? lerpPose(down(base), above(base), progress / 0.25)
      : lerpPose(above(base), above(CONVEYOR_BASE_DEG), (progress - 0.25) / 0.75);
  }
  // place: 앞 절반 내려가서 놓기, 뒤 절반 다시 올라가기
  return progress < 0.5
    ? lerpPose(above(CONVEYOR_BASE_DEG), down(CONVEYOR_BASE_DEG), progress / 0.5)
    : lerpPose(down(CONVEYOR_BASE_DEG), above(CONVEYOR_BASE_DEG), (progress - 0.5) / 0.5);
}

function advance(dtSec: number): void {
  const r = robot();
  // 일시정지·정지·오류·연결 끊김에서는 사이클을 진행하지 않고 자세를 유지한다.
  if (r.status !== 'running') return;

  if (r.phase === 'idle') {
    if (r.mode === 'auto') {
      idleSec += dtSec;
      if (idleSec >= IDLE_GAP_SEC) startCycle();
    } else if (pendingTank) {
      const tank = pendingTank;
      pendingTank = null;
      startCycle(tank);
    }
    return;
  }

  // 진행 중인 사이클은 모드를 바꿔도 끝까지 마친다.
  const speed = getSetting('robot-1', 'speedPercent') / 100;
  const phase = r.phase;
  const tankId = r.targetTankId ?? 'tank-a1';
  elapsedSec += dtSec * speed;
  const progress = Math.min(1, elapsedSec / DURATION_SEC[phase]);
  pose = poseFor(phase, progress, tankId);

  if (phase === 'pick' && progress >= 0.9 && !picked) {
    picked = true;
    r.gripper = { closed: true, holding: true };
    removeFromTank(tankId, 1.2);
  }
  if (phase === 'place' && progress >= 0.5 && !placed) {
    placed = true;
    r.gripper = { closed: false, holding: false };
    addToConveyor(6);
  }

  if (progress >= 1) {
    elapsedSec = 0;
    startPose = [...pose];
    if (phase === 'pick') r.phase = 'move';
    else if (phase === 'move') r.phase = 'place';
    else {
      r.phase = 'idle';
      r.targetTankId = null;
      idleSec = 0;
    }
  }
}

/** 정지 명령: 하던 사이클을 버리고 대기 상태로 돌아간다 (자세는 그대로) */
export function resetRobotCycle(): void {
  const r = robot();
  r.phase = 'idle';
  r.targetTankId = null;
  r.gripper = { closed: false, holding: false };
  pendingTank = null;
  elapsedSec = 0;
  idleSec = IDLE_GAP_SEC;
  picked = false;
  placed = false;
}

/** 수동 모드에서 탱크 하나를 집어 컨베이어에 놓는 한 사이클을 요청한다. 지금 할 수 없으면 false */
export function requestManualPick(tankId: TankId): boolean {
  const r = robot();
  if (r.status !== 'running' || r.mode !== 'manual' || r.phase !== 'idle' || pendingTank) return false;
  pendingTank = tankId;
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
