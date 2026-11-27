import { C } from '../theme';
import type { Kit, Vec3 } from '../three/kit';
import { BALE, YARD, YARD_FRAME } from './layout';

// 압축기 배출구 앞 바닥 철판과 베일 저울 (S2t, 마당 좌표계). 전의 금속 받침대(양옆 레일·가로 받침)를 대신한다.
// 통로 바닥(stand.outletY)에서 짧은 경사 철판(속이 찬 쐐기)이 땅으로 내려오고, 그 앞에 바닥에 깐 평평한 무늬 철판이 이어진다.
// 베일은 철판 위로 밀려 미끄러져 나온다(움직임은 sim/yard.ts). 햇빛에 하얗게 날리지 않게 어두운 회색 무광으로 칠한다.

/** 철판 색: 어두운 회색 강판, 무늬 줄·이음매는 조금 밝게 */
const PLATE = '#5b616b';
const PLATE_LINE = '#737a85';
const PLATE_SEAM = '#4a5059';
/** 철판 폭: 베일 폭 + 양옆 여유 (2.1 m) */
export const PLATE_W = BALE.w + 0.5;

const mid = (a: number, b: number): number => (a + b) / 2;

export function balePlate(k: Kit, top: number): void {
  const { stand, scale } = YARD;
  k.at([YARD_FRAME.x, top, YARD_FRAME.z], YARD_FRAME.rotY, () => {
    const z0 = stand.outletZ;
    const zs = stand.slopeEnd;
    const z1 = stand.outletZ + stand.length;
    const x0 = stand.x - PLATE_W / 2;
    const x1 = stand.x + PLATE_W / 2;
    const yo = stand.outletY;
    const yp = stand.y;
    // 경사 철판: 윗면 + 양옆 삼각 면 (속이 찬 쐐기라 밑이 뜨지 않는다). 배출구 쪽은 벽 안이라 막지 않는다
    const a: Vec3 = [x0, yo, z0];
    const b: Vec3 = [x1, yo, z0];
    const c: Vec3 = [x1, yp, zs];
    const d: Vec3 = [x0, yp, zs];
    const e1: Vec3 = [x1, 0, zs];
    const f1: Vec3 = [x1, 0, z0];
    const e0: Vec3 = [x0, 0, zs];
    const f0: Vec3 = [x0, 0, z0];
    k.tris(PLATE, [a, d, c, a, c, b, f1, c, e1, f1, b, c, f0, e0, d, f0, d, a]);
    // 평평한 철판: 땅 위 얇은 판 (윗면 stand.y)
    k.box(PLATE, [PLATE_W, yp, z1 - zs], [stand.x, 0, mid(zs, z1)], { r: 0 });
    // 무늬 철판 느낌의 얕은 줄 (경사·바닥 모두) + 판 이음매
    const len = Math.hypot(zs - z0, yo - yp);
    for (let s = 0.12; s < len - 0.05; s += 0.22) {
      const t = s / len;
      k.box(PLATE_LINE, [PLATE_W - 0.14, 0.006, 0.035], [stand.x, yo + (yp - yo) * t, z0 + (zs - z0) * t], { r: 0, rot: [stand.slope, 0, 0] });
    }
    for (let z = zs + 0.12; z < z1 - 0.06; z += 0.22) k.box(PLATE_LINE, [PLATE_W - 0.14, 0.006, 0.035], [stand.x, yp, z], { r: 0 });
    k.box(PLATE_SEAM, [PLATE_W, 0.008, 0.025], [stand.x, yp, zs], { r: 0 });
    k.box(PLATE_SEAM, [PLATE_W, 0.008, 0.025], [stand.x, yp, mid(zs, z1)], { r: 0 });
    // 바닥 철판 양옆 얇은 노랑 띠와 끝 낮은 턱 (배출구 쪽 경사 철판은 테두리 없음)
    for (const x of [x0 + 0.02, x1 - 0.02]) k.box(C.yellow, [0.035, 0.008, z1 - zs - 0.04], [x, yp, mid(zs, z1)], { r: 0 });
    k.box(C.yellow, [PLATE_W, 0.07, 0.05], [stand.x, 0, z1 + 0.025], { r: 0.015 });

    // 베일 저울: 낮은 판 + 노란 테두리 + 표시 기둥(숫자 없음)
    const s = scale.size;
    k.box(C.dark, [s, scale.y, s], [scale.x, 0, scale.z], { r: 0.02, mat: 'metal' });
    // 저울 윗판도 철판처럼 어두운 회색 무광 (S2t: 햇빛에 하얗게 날리지 않게)
    k.box(PLATE_LINE, [s - 0.12, 0.02, s - 0.12], [scale.x, scale.y - 0.01, scale.z], { r: 0 });
    for (const [dx, dz, w, dd] of [
      [0, s / 2, s + 0.08, 0.06],
      [0, -s / 2, s + 0.08, 0.06],
      [s / 2, 0, 0.06, s + 0.08],
      [-s / 2, 0, 0.06, s + 0.08],
    ] as const) {
      k.box(C.yellow, [w, 0.05, dd], [scale.x + dx, scale.y - 0.02, scale.z + dz], { r: 0.01 });
    }
    k.cyl(C.steel, 0.04, 1.1, [scale.x - s / 2 - 0.25, 0, scale.z - s / 2], { seg: 8, mat: 'metal' });
    k.box(C.wall, [0.2, 0.28, 0.1], [scale.x - s / 2 - 0.25, 1.1, scale.z - s / 2], { r: 0.03 });
  });
}
