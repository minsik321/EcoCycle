import { roundedPath, samplePath } from './paths';
import type { P2, Path, Pose } from './paths';

// 경로를 따라 움직이는 것(트럭·지게차·작업자)의 공통 부분. three 미사용.

export interface Mover extends Pose {
  path: Path | null;
  s: number;
  reverse: boolean;
  speed: number;
  waiting: boolean;
  /** 바퀴 굴림(라디안 누적) */
  wheel: number;
  /** 멈추지 않고 지나간(through) 경로 끝에서 남은 거리: 다음 경로가 이만큼 앞에서 시작한다 */
  carry: number;
}

export const WHEEL_R = 0.26;

/** 처음 본 단계가 이 시간 안에 시작됐으면 들어오는 모습부터 보여 준다 (그보다 오래됐으면 있어야 할 자리에 바로 놓는다) */
export const FRESH_MS = 8000;

export function mover(x: number, z: number, heading: number): Mover {
  return { x, z, heading, path: null, s: 0, reverse: false, speed: 0, waiting: false, wheel: 0, carry: 0 };
}

/**
 * 경로를 따라 나아간다. 끝에 닿으면 true. blocked면 멈춘다.
 * through면 끝에서 서지 않는다(바로 다음 경로로 이어 달린다): 끝 앞에서 감속하지 않고 속도를 남기며, 넘친 거리는 carry에 둔다
 */
export function advance(m: Mover, dt: number, vmax: number, accel: number, blocked: boolean, through = false): boolean {
  const path = m.path;
  if (!path) return true;
  const remaining = path.total - m.s;
  const target = blocked ? 0 : through ? vmax : Math.min(vmax, Math.sqrt(2 * accel * Math.max(remaining, 0)) + 0.1);
  const dv = target - m.speed;
  m.speed += Math.max(-accel * 2.2 * dt, Math.min(accel * dt, dv));
  m.waiting = blocked;
  const ds = Math.min(remaining, m.speed * dt);
  m.s += ds;
  m.wheel += (ds / WHEEL_R) * (m.reverse ? -1 : 1);
  samplePath(path, m.s, m, m.reverse);
  if (remaining - ds > 1e-3) return false;
  if (through) m.carry = Math.max(0, m.speed * dt - remaining);
  else m.speed = 0;
  return true;
}

export function follow(m: Mover, points: readonly P2[] | Path, reverse = false, radius = 1.7): void {
  m.path = 'pts' in points ? points : roundedPath(points, radius);
  m.s = 0;
  m.reverse = reverse;
}

/** through로 끝에 닿은 뒤 다음 경로로 이어 간다: 속도는 그대로, 넘친 거리만큼 앞에서 시작 (자리·방향이 끊기지 않는다) */
export function followOn(m: Mover, points: readonly P2[] | Path, radius = 1.7): void {
  follow(m, points, false, radius);
  m.s = Math.min(m.carry, m.path!.total);
  m.carry = 0;
  samplePath(m.path!, m.s, m, false);
}
