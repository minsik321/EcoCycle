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
}

export const WHEEL_R = 0.26;

/** 처음 본 단계가 이 시간 안에 시작됐으면 들어오는 모습부터 보여 준다 (그보다 오래됐으면 있어야 할 자리에 바로 놓는다) */
export const FRESH_MS = 8000;

export function mover(x: number, z: number, heading: number): Mover {
  return { x, z, heading, path: null, s: 0, reverse: false, speed: 0, waiting: false, wheel: 0 };
}

/** 경로를 따라 나아간다. 끝에 닿으면 true. blocked면 멈춘다 */
export function advance(m: Mover, dt: number, vmax: number, accel: number, blocked: boolean): boolean {
  const path = m.path;
  if (!path) return true;
  const remaining = path.total - m.s;
  const target = blocked ? 0 : Math.min(vmax, Math.sqrt(2 * accel * Math.max(remaining, 0)) + 0.1);
  const dv = target - m.speed;
  m.speed += Math.max(-accel * 2.2 * dt, Math.min(accel * dt, dv));
  m.waiting = blocked;
  const ds = Math.min(remaining, m.speed * dt);
  m.s += ds;
  m.wheel += (ds / WHEEL_R) * (m.reverse ? -1 : 1);
  samplePath(path, m.s, m, m.reverse);
  if (remaining - ds > 1e-3) return false;
  m.speed = 0;
  return true;
}

export function follow(m: Mover, points: readonly P2[] | Path, reverse = false, radius = 1.7): void {
  m.path = 'pts' in points ? points : roundedPath(points, radius);
  m.s = 0;
  m.reverse = reverse;
}
