import { PALETTE as P } from '../../palette';
import { offset } from './parts';
import type { PartList } from './parts';

// 여러 곳에 놓는 작은 소품. 모두 조각 몇 개로 된 저폴리 모양이다.

/** 반사조끼를 입은 작업자 (서 있는 모습). ry는 바라보는 방향 */
export function worker(list: PartList, x: number, z: number, ry = 0): void {
  list.box(P.pants, [x, 0, z], [0.17, 0.28, 0.12], { ry });
  list.box(P.vest, [x, 0.28, z], [0.21, 0.26, 0.14], { ry, shadow: false });
  list.box(P.vestStripe, [x, 0.36, z], [0.22, 0.05, 0.15], { ry, shadow: false });
  list.box(P.skin, [x, 0.54, z], [0.13, 0.12, 0.12], { ry, shadow: false });
  list.box(P.helmet, [x, 0.65, z], [0.16, 0.06, 0.15], { ry, shadow: false });
}

/** 나무. kind 0은 침엽수(원뿔 두 단), 1은 둥근 나무(상자 수관) */
export function tree(list: PartList, x: number, z: number, size = 1, kind: 0 | 1 = 0): void {
  list.box(P.trunk, [x, 0, z], [0.12 * size, 0.4 * size, 0.12 * size], { shadow: false });
  if (kind === 0) {
    list.cone(P.leafDark, [x, 0.3 * size, z], [0.8 * size, 0.8 * size, 0.8 * size]);
    list.cone(P.leaf, [x, 0.75 * size, z], [0.58 * size, 0.7 * size, 0.58 * size], { shadow: false });
  } else {
    list.box(P.leaf, [x, 0.38 * size, z], [0.7 * size, 0.55 * size, 0.7 * size], { ry: 0.5 });
    list.box(P.leafDark, [x + 0.08 * size, 0.8 * size, z - 0.05 * size], [0.45 * size, 0.35 * size, 0.45 * size], { ry: 0.2, shadow: false });
  }
}

/** 낮은 덤불 */
export function bush(list: PartList, x: number, z: number, size = 1): void {
  list.box(P.leafDark, [x, 0, z], [0.5 * size, 0.24 * size, 0.36 * size], { ry: 0.3, shadow: false });
}

/** 가로등. ry 방향으로 팔이 뻗는다 */
export function lamp(list: PartList, x: number, z: number, ry = 0): void {
  list.box(P.lampPole, [x, 0, z], [0.07, 1.7, 0.07]);
  const [ax, az] = offset(x, z, ry, 0.2, 0);
  list.box(P.lampPole, [ax, 1.66, az], [0.42, 0.05, 0.05], { ry, shadow: false });
  const [hx, hz] = offset(x, z, ry, 0.38, 0);
  list.box(P.lampHead, [hx, 1.6, hz], [0.22, 0.06, 0.12], { ry, shadow: false });
}

/** 주차된 승용차. ry=0이면 앞이 +X */
export function car(list: PartList, x: number, z: number, ry: number, color: string, wheels: boolean): void {
  list.box(color, [x, 0.08, z], [1.1, 0.24, 0.5], { ry });
  const [cx, cz] = offset(x, z, ry, -0.06, 0);
  list.box(P.carGlass, [cx, 0.32, cz], [0.58, 0.2, 0.44], { ry, shadow: false });
  list.box(color, [cx, 0.52, cz], [0.52, 0.03, 0.42], { ry, shadow: false });
  if (!wheels) return;
  for (const dx of [-0.34, 0.34]) {
    for (const dz of [-0.25, 0.25]) {
      const [wx, wz] = offset(x, z, ry, dx, dz);
      list.box(P.tire, [wx, 0, wz], [0.2, 0.18, 0.06], { ry, shadow: false });
    }
  }
}

export const BALE_SIZE = { x: 0.6, y: 0.46, z: 0.5 } as const;

/** 결속된 베일 하나. y는 밑면 높이 */
export function bale(list: PartList, x: number, y: number, z: number, ry = 0, straps = true): void {
  list.box(P.bale, [x, y, z], [BALE_SIZE.x, BALE_SIZE.y, BALE_SIZE.z], { ry });
  if (!straps) return;
  for (const dx of [-0.16, 0.16]) {
    const [sx, sz] = offset(x, z, ry, dx, 0);
    list.box(P.strap, [sx, y - 0.005, sz], [0.03, BALE_SIZE.y + 0.012, BALE_SIZE.z + 0.012], { ry, shadow: false });
  }
}

/** 울타리 한 줄: 기둥을 일정 간격으로 세우고 가로대 두 줄을 건다 (X나 Z에 나란한 직선만) */
export function fenceRun(list: PartList, x0: number, z0: number, x1: number, z1: number, spacing: number): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  if (length < 0.01) return;
  const count = Math.max(1, Math.round(length / spacing));
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    list.box(P.fence, [x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t], [0.06, 0.55, 0.06], { shadow: false });
  }
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (const y of [0.22, 0.46]) {
    list.box(P.fence, [(x0 + x1) / 2, y, (z0 + z1) / 2], alongX ? [length, 0.04, 0.03] : [0.03, 0.04, length], { shadow: y > 0.4 });
  }
}
