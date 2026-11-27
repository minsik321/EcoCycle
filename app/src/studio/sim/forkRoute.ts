import { YARD_FLOW } from '../../config/yard';
import { M } from '../world/layout';
import { WHEEL_R } from './mover';
import type { Mover } from './mover';
import { roundedPath, samplePath } from './paths';
import type { P2, Path } from './paths';

// 지게차 이동(S2s): 실제 축척 속도 한계, 꺾이는 점을 둥글린 한 경로(route)와 곡률에 맞춘 감속. three 미사용.
// 트럭은 mover.advance를 그대로 쓴다. 지게차는 여기 advanceRoute로 경로 끝에서만 서고, 모서리는 회전 반경으로 돈다.

/** 지게차 한계(월드 단위/초). config/yard.ts의 m/s 값을 월드(1단위 = 2 m)로 바꾼 것 */
export const FORK_LIMITS = {
  drive: M(YARD_FLOW.driveMps),
  reverse: M(YARD_FLOW.reverseMps),
  accel: M(YARD_FLOW.accelMps2),
  lift: M(YARD_FLOW.liftMps),
  /** 모서리에서 옆으로 받는 가속 한계: 곡률이 크면 이만큼으로 줄인다 */
  lateral: M(YARD_FLOW.cornerAccelMps2),
  /** 꺾이는 점을 둥글리는 접선 길이(회전 반경쯤) */
  corner: M(YARD_FLOW.cornerRadiusM),
  turn: YARD_FLOW.turnRadPerSec,
} as const;

/** 감속은 가속의 이 배수 (실제 지게차의 제동은 가속보다 세다: 2 m/s² × 2 = 4 m/s²) */
export const BRAKE = 2;

/** 포크를 놓을(집을) 높이보다 이만큼만 더 든다 (S2s #4: 맨 위 단까지 들지 않는다) */
export const LIFT_CLEAR = 0.12;

/** 경로 하나의 점별 속도 상한(곡률)과 지나는 점들의 거리 */
export interface RouteInfo {
  path: Path;
  /** 경로 점마다 곡률에서 나온 속도 상한 */
  caps: number[];
  /** 넣은 점(꺾이는 점)마다 경로 위 거리 */
  marks: number[];
}

/** from에서 pts를 차례로 지나는 둥근 경로 */
export function buildRoute(from: P2, pts: readonly P2[], corner: number = FORK_LIMITS.corner, lateral: number = FORK_LIMITS.lateral): RouteInfo {
  const all: P2[] = [from, ...pts];
  const path = roundedPath(all, corner);
  const n = path.dist.length;
  const caps = new Array<number>(n).fill(Infinity);
  for (let i = 1; i < n - 1; i += 1) {
    const ax = path.pts[i * 2]! - path.pts[i * 2 - 2]!;
    const az = path.pts[i * 2 + 1]! - path.pts[i * 2 - 1]!;
    const bx = path.pts[i * 2 + 2]! - path.pts[i * 2]!;
    const bz = path.pts[i * 2 + 3]! - path.pts[i * 2 + 1]!;
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    if (la < 1e-6 || lb < 1e-6) continue;
    const cos = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (la * lb)));
    const theta = Math.acos(cos);
    if (theta < 1e-4) continue;
    const k = theta / ((la + lb) / 2);
    caps[i] = Math.sqrt(lateral / k);
  }
  // 넣은 점마다 가장 가까운 경로 점의 거리
  const marks = all.map((p) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i += 1) {
      const d = Math.hypot(path.pts[i * 2]! - p[0], path.pts[i * 2 + 1]! - p[1]);
      if (d < bestD) {
        bestD = d;
        best = path.dist[i]!;
      }
    }
    return best;
  });
  return { path, caps, marks };
}

/** 지금 거리 s에서 낼 수 있는 속도: 끝에서 서고, 앞의 모서리 상한까지 제동 거리 안에서 줄인다 */
export function routeTarget(r: RouteInfo, s: number, vmax: number, accel: number): number {
  const { path, caps } = r;
  // 감속은 가속의 BRAKE배 (advanceRoute와 같은 값)
  const brake = 2 * accel * BRAKE;
  let v = Math.min(vmax, Math.sqrt(brake * Math.max(path.total - s, 0)) + 0.05);
  const reach = (vmax * vmax) / brake + 0.2;
  for (let i = 0; i < caps.length; i += 1) {
    const d = path.dist[i]! - s;
    if (d < -0.05) continue;
    if (d > reach) break;
    const cap = caps[i]!;
    if (cap === Infinity) continue;
    v = Math.min(v, Math.sqrt(cap * cap + brake * Math.max(d, 0)));
  }
  return v;
}

/**
 * 경로를 따라 나아간다(지게차). 끝에 닿으면 true(속도 0). blocked면 선다.
 * stopAt: 아직 지나지 못한 문(길·차례)의 거리. 그 앞에서 서도록 줄이고 넘지 않는다
 */
export function advanceRoute(m: Mover, r: RouteInfo, dt: number, vmax: number, accel: number, blocked: boolean, stopAt = Infinity): boolean {
  const path = r.path;
  const limit = Math.min(path.total, Math.max(stopAt, m.s));
  const remaining = limit - m.s;
  let target = blocked ? 0 : routeTarget(r, m.s, vmax, accel);
  if (limit < path.total) target = Math.min(target, Math.sqrt(2 * accel * BRAKE * Math.max(remaining, 0)));
  const dv = target - m.speed;
  m.speed += Math.max(-accel * BRAKE * 1.1 * dt, Math.min(accel * dt, dv));
  m.waiting = blocked;
  const ds = Math.min(remaining, Math.max(0, m.speed) * dt);
  m.s += ds;
  m.wheel += (ds / WHEEL_R) * (m.reverse ? -1 : 1);
  samplePath(path, m.s, m, m.reverse);
  if (limit < path.total) {
    if (remaining - ds <= 1e-3) m.speed = 0;
    return false;
  }
  if (remaining - ds > 1e-3) return false;
  m.speed = 0;
  return true;
}
