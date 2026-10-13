import type { Gripper, Phase, TankId } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import { DEMO_CYCLE, TANK_BASE_DEG } from '../../config/sceneLayout';
import type { JointBuffer, JointSample } from '../../realtime';

// 로봇팔 그리기는 입력과 분리한다. RobotArm은 JointSource에서 관절 각도·그리퍼를 받아 그리기만 하고,
// 입력을 바꿔도(정해진 자세, 시연 동작, 실제 값) 그리기 코드는 그대로다.
//
// 후퇴 순서(명세): ① 관절 값 실시간(live) → ② 단계+진행률 → ③ 정해진 동작 반복(demo, 최후).
// ②는 서버가 진행률을 주는 형식이 정해지면 만든다(지금 명세에는 없다).

export type JointSourceKind = 'live' | 'demo' | 'fixed';

export interface JointSource {
  kind: JointSourceKind;
  /**
   * 지금 그릴 자세를 out에 채운다. 아직 값이 없으면 out을 건드리지 않고 false (그리는 쪽은 마지막 자세를 유지한다).
   * 매 프레임 부르므로 새 객체를 만들지 않는다.
   */
  read(nowMs: number, out: JointSample): boolean;
}

export const emptySample = (): JointSample => ({ joints: [], gripper: { closed: false, holding: false }, phase: 'idle', targetTankId: null });

/** 한 번 읽어 새 객체로 돌려준다 (테스트·표시용. 매 프레임에는 read를 쓴다) */
export function sampleOf(source: JointSource, nowMs: number): JointSample | null {
  const out = emptySample();
  return source.read(nowMs, out) ? out : null;
}

function copyInto(out: JointSample, from: JointSample): void {
  out.joints.length = from.joints.length;
  for (let i = 0; i < from.joints.length; i += 1) out.joints[i] = from.joints[i]!;
  out.gripper.closed = from.gripper.closed;
  out.gripper.holding = from.gripper.holding;
  out.phase = from.phase;
  out.targetTankId = from.targetTankId;
}

const OPEN: Gripper = { closed: false, holding: false };

/** 정해진 자세로 서 있다 (값이 없을 때의 기본 자세) */
export function fixedSource(joints: readonly number[] = DEMO_CYCLE.home): JointSource {
  const sample: JointSample = { joints: [...joints], gripper: OPEN, phase: 'idle', targetTankId: null };
  return {
    kind: 'fixed',
    read(_nowMs, out) {
      copyInto(out, sample);
      return true;
    },
  };
}

/**
 * 실제 관절 값: realtime의 jointBuffer를 읽는다. 버퍼는 지연 보간된 값을 주고, 마지막 프레임 뒤에는 마지막 자세를 유지한다
 * (연결이 끊기면 팔이 그 자세로 멈춘다. 추측해서 움직이지 않는다).
 */
export function liveSource(getBuffer: () => JointBuffer | null): JointSource {
  return { kind: 'live', read: (nowMs, out) => getBuffer()?.sampleInto(nowMs, out) ?? false };
}

// --- 시연 동작 (최후의 수단). 실제와 어긋날 수 있으므로 화면에 "시연 동작"임을 표시한다. ---

type Pose = readonly number[];
const above = (base: number): Pose => [base, 25, -35, 0, 20, 0];
const down = (base: number): Pose => [base, 45, -70, 0, 25, 0];

const smooth = (p: number) => p * p * (3 - 2 * p);
function lerp(a: Pose, b: Pose, p: number): number[] {
  const k = smooth(Math.min(1, Math.max(0, p)));
  return a.map((v, i) => v + ((b[i] ?? v) - v) * k);
}

const CYCLE_SEC = DEMO_CYCLE.pickSec + DEMO_CYCLE.moveSec + DEMO_CYCLE.placeSec + DEMO_CYCLE.idleSec;

/** 시연 동작의 한 시점: 탱크 4개를 차례로 돌며 집기 → 이동 → 놓기를 반복한다. 시각만으로 정해진다. */
export function demoPose(tSec: number): JointSample {
  const t = ((tSec % (CYCLE_SEC * TANK_IDS.length)) + CYCLE_SEC * TANK_IDS.length) % (CYCLE_SEC * TANK_IDS.length);
  const index = Math.floor(t / CYCLE_SEC);
  const tankId: TankId = TANK_IDS[index] ?? 'tank-a1';
  const base = TANK_BASE_DEG[tankId];
  const conveyor = DEMO_CYCLE.conveyorBaseDeg;
  const local = t - index * CYCLE_SEC;
  const { pickSec, moveSec, placeSec } = DEMO_CYCLE;

  let joints: number[];
  let phase: Phase;
  let gripper: Gripper = OPEN;
  if (local < pickSec) {
    const p = local / pickSec;
    phase = 'pick';
    joints = p < 0.5 ? lerp(above(conveyor), above(base), p / 0.5) : lerp(above(base), down(base), (p - 0.5) / 0.5);
    if (p >= 0.9) gripper = { closed: true, holding: true };
  } else if (local < pickSec + moveSec) {
    const p = (local - pickSec) / moveSec;
    phase = 'move';
    joints = p < 0.25 ? lerp(down(base), above(base), p / 0.25) : lerp(above(base), above(conveyor), (p - 0.25) / 0.75);
    gripper = { closed: true, holding: true };
  } else if (local < pickSec + moveSec + placeSec) {
    const p = (local - pickSec - moveSec) / placeSec;
    phase = 'place';
    joints = p < 0.5 ? lerp(above(conveyor), down(conveyor), p / 0.5) : lerp(down(conveyor), above(conveyor), (p - 0.5) / 0.5);
    gripper = p < 0.5 ? { closed: true, holding: true } : OPEN;
  } else {
    phase = 'idle';
    joints = [...above(conveyor)];
  }
  return { joints, gripper, phase, targetTankId: phase === 'idle' ? null : tankId };
}

export function demoSource(startMs = 0): JointSource {
  return {
    kind: 'demo',
    read(nowMs, out) {
      copyInto(out, demoPose((nowMs - startMs) / 1000));
      return true;
    },
  };
}
