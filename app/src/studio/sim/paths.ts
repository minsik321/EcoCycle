// 바닥 위 경로 (three 미사용). 모서리를 둥글린 꺾은선을 촘촘한 점으로 바꿔 두고 거리로 위치·방향을 읽는다.
// 방향(heading)은 three의 rotation.y와 같다: 0이면 +X를 보고, 앞 방향은 (cos h, 0, -sin h).

export type P2 = readonly [number, number];

export interface Path {
  /** x, z가 번갈아 들어 있다 */
  pts: number[];
  /** 각 점까지의 누적 거리 */
  dist: number[];
  total: number;
}

export interface Pose {
  x: number;
  z: number;
  heading: number;
}

const CORNER_STEPS = 10;

/** 꺾이는 곳을 반지름 radius쯤으로 둥글린 경로 */
export function roundedPath(points: readonly P2[], radius = 1.2): Path {
  const out: number[] = [];
  const push = (x: number, z: number) => {
    const n = out.length;
    if (n >= 2 && Math.hypot(out[n - 2]! - x, out[n - 1]! - z) < 1e-4) return;
    out.push(x, z);
  };
  const first = points[0];
  if (!first) return { pts: [0, 0], dist: [0], total: 0 };
  push(first[0], first[1]);
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = points[i - 1]!;
    const p = points[i]!;
    const b = points[i + 1]!;
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]);
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const d = Math.min(radius, la / 2, lb / 2);
    if (d < 1e-3) {
      push(p[0], p[1]);
      continue;
    }
    const ax = p[0] + ((a[0] - p[0]) / la) * d;
    const az = p[1] + ((a[1] - p[1]) / la) * d;
    const bx = p[0] + ((b[0] - p[0]) / lb) * d;
    const bz = p[1] + ((b[1] - p[1]) / lb) * d;
    for (let k = 0; k <= CORNER_STEPS; k += 1) {
      const t = k / CORNER_STEPS;
      const u = 1 - t;
      push(u * u * ax + 2 * u * t * p[0] + t * t * bx, u * u * az + 2 * u * t * p[1] + t * t * bz);
    }
  }
  const last = points[points.length - 1]!;
  push(last[0], last[1]);

  const dist: number[] = [0];
  for (let i = 2; i < out.length; i += 2) {
    dist.push(dist[dist.length - 1]! + Math.hypot(out[i]! - out[i - 2]!, out[i + 1]! - out[i - 1]!));
  }
  return { pts: out, dist, total: dist[dist.length - 1] ?? 0 };
}

/** 경로 위 거리 s의 위치와 방향. reverse면 후진(진행 방향의 반대를 본다) */
export function samplePath(path: Path, s: number, out: Pose, reverse = false): Pose {
  const n = path.dist.length;
  const clamped = Math.min(Math.max(s, 0), path.total);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path.dist[mid]! <= clamped) lo = mid;
    else hi = mid;
  }
  if (n < 2) {
    out.x = path.pts[0] ?? 0;
    out.z = path.pts[1] ?? 0;
    return out;
  }
  const d0 = path.dist[lo]!;
  const d1 = path.dist[hi]!;
  const k = d1 > d0 ? (clamped - d0) / (d1 - d0) : 0;
  const x0 = path.pts[lo * 2]!;
  const z0 = path.pts[lo * 2 + 1]!;
  const x1 = path.pts[hi * 2]!;
  const z1 = path.pts[hi * 2 + 1]!;
  out.x = x0 + (x1 - x0) * k;
  out.z = z0 + (z1 - z0) * k;
  out.heading = Math.atan2(-(z1 - z0), x1 - x0) + (reverse ? Math.PI : 0);
  return out;
}

/** 각도 차이를 -π~π로 */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** +X를 0으로 한 방향 (화면 좌표가 아니라 장면 좌표) */
export const headingTo = (fromX: number, fromZ: number, toX: number, toZ: number): number => Math.atan2(-(toZ - fromZ), toX - fromX);
