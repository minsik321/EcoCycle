import { TANK_IDS } from '@ecocycle/shared';
import { BUILDING, COMPRESSOR, SECTOR_Z } from '../../../config/sceneLayout';
import { PALETTE as P } from '../../palette';
import type { PartList } from './parts';
import { worker } from './props';

const { minX, maxX, minZ, maxZ, wallHeight: H, wallThickness: T, stubHeight: S } = BUILDING;
const WIDTH = maxX - minX;
const DEPTH = maxZ - minZ;
const CENTER_X = (minX + maxX) / 2;
const CENTER_Z = (minZ + maxZ) / 2;
/** 섹터 문 사이에 남긴 기둥의 높이 (안이 가려지지 않게 낮게 자른다) */
const POST_HEIGHT = 1.0;

/** 섹터 칸막이가 서는 Z 자리 (칸 경계) */
export const sectorDividers = (): number[] => [...new Set(TANK_IDS.flatMap((id) => [...SECTOR_Z[id]]))].sort((a, b) => a - b);

/**
 * 본관: 지붕을 잘라낸 건물. 카메라에서 먼 두 면은 흰 벽에 파란 띠·창·셔터 문을 두고,
 * 가까운 두 면은 안이 보이도록 낮게 자른다. 트럭이 드나드는 섹터 문은 기둥만 남긴다.
 */
export function addBuilding(list: PartList, detail: number): void {
  // 먼 쪽 벽 (+Z)
  const backZ = maxZ + T / 2;
  list.box(P.wall, [CENTER_X - T / 2, 0, backZ], [WIDTH + T, H, T]);
  list.box(P.wallBase, [CENTER_X - T / 2, 0, backZ], [WIDTH + T + 0.02, 0.34, T + 0.03], { shadow: false });
  list.box(P.trim, [CENTER_X - T / 2, H - 0.3, backZ], [WIDTH + T + 0.04, 0.32, T + 0.05], { shadow: false });
  // 먼 쪽 벽 (-X)
  const sideX = minX - T / 2;
  list.box(P.wall, [sideX, 0, CENTER_Z], [T, H, DEPTH]);
  list.box(P.wallBase, [sideX, 0, CENTER_Z], [T + 0.03, 0.34, DEPTH + 0.02], { shadow: false });
  list.box(P.trim, [sideX, H - 0.3, CENTER_Z], [T + 0.05, 0.32, DEPTH + 0.04], { shadow: false });

  // 셔터 문 두 개 (+Z 벽 안쪽 면)
  const shutters = [-6.25, -4.65];
  for (const x of shutters) {
    list.box(P.shutter, [x, 0, maxZ - 0.02], [1.4, 2.1, 0.05], { shadow: false });
    list.box(P.trimDark, [x, 2.1, maxZ - 0.03], [1.56, 0.16, 0.09], { shadow: false });
    if (detail >= 1) {
      for (let y = 0.3; y < 2.05; y += 0.35) list.box(P.shutterRib, [x, y, maxZ - 0.04], [1.4, 0.05, 0.06], { shadow: false });
    }
  }
  // 높은 창 (+Z 벽)
  for (let x = -3.3; x <= 2.3; x += 1.4) list.box(P.glass, [x, 1.85, maxZ - 0.02], [0.95, 0.5, 0.05], { shadow: false });
  // 창과 작업자 문 (-X 벽)
  for (let z = -2.1; z <= 1.2; z += 1.1) list.box(P.glass, [minX + 0.02, 1.85, z], [0.05, 0.5, 0.8], { shadow: false });
  list.box(P.trim, [minX + 0.02, 0, 2.35], [0.05, 1.35, 0.62], { shadow: false });

  // 가까운 쪽 벽 (-Z): 낮게 자르고 압축기 배출 슬라이드 자리는 비운다
  const gapMin = COMPRESSOR.x - COMPRESSOR.width / 2;
  const gapMax = COMPRESSOR.x + COMPRESSOR.width / 2;
  const frontZ = minZ - T / 2;
  const stub = (x0: number, x1: number) => {
    list.box(P.wall, [(x0 + x1) / 2, 0, frontZ], [x1 - x0, S, T]);
    list.box(P.trim, [(x0 + x1) / 2, S, frontZ], [x1 - x0 + 0.02, 0.05, T + 0.04], { shadow: false });
  };
  stub(minX - T, gapMin);
  stub(gapMax, maxX + 0.15);

  // 가까운 쪽 벽 (+X): 섹터 문 사이의 기둥만 남긴다
  for (const z of sectorDividers()) {
    list.box(P.wall, [maxX, 0, z], [0.3, POST_HEIGHT, 0.3]);
    list.box(P.trim, [maxX, POST_HEIGHT, z], [0.34, 0.08, 0.34], { shadow: false });
  }
  // 섹터 줄 끝과 본관 모서리 사이를 메우는 낮은 벽
  const dividers = sectorDividers();
  const firstZ = dividers[0] ?? minZ;
  const lastZ = dividers[dividers.length - 1] ?? maxZ;
  if (firstZ - minZ > 0.16) list.box(P.wall, [maxX, 0, (firstZ + minZ) / 2], [T, S, firstZ - minZ]);
  if (maxZ - lastZ > 0.16) list.box(P.wall, [maxX, 0, (lastZ + maxZ) / 2], [T, POST_HEIGHT, maxZ - lastZ]);
}

/** 본관 안의 설비 아닌 것들: 제어실, 배전반, 로봇 구역 난간, 팔레트, 작업자 */
export function addInterior(list: PartList, detail: number): void {
  // 제어실: 창 띠를 두른 작은 방
  const [bx, bz] = [-2.6, 2.2];
  list.box(P.wall, [bx, 0, bz], [1.6, 1.15, 1.2]);
  list.box(P.glass, [bx, 0.55, bz - 0.6], [1.3, 0.4, 0.04], { shadow: false });
  list.box(P.glass, [bx + 0.8, 0.55, bz], [0.04, 0.4, 0.9], { shadow: false });
  list.box(P.trim, [bx, 1.15, bz], [1.72, 0.1, 1.32], { shadow: false });

  // 배전반 (-X 벽 앞)
  for (const z of [0.9, 1.5]) {
    list.box(P.cabinet, [minX + 0.28, 0, z], [0.4, 1.3, 0.52]);
    list.box(P.steelDark, [minX + 0.49, 0.75, z], [0.02, 0.3, 0.3], { shadow: false });
  }

  // 로봇 구역 난간 (로봇과 작업 통로 사이)
  const railX = -1.15;
  for (let z = 0.1; z <= 1.31; z += 0.6) list.box(P.hazard, [railX, 0, z], [0.06, 0.62, 0.06], { shadow: false });
  list.box(P.hazard, [railX, 0.58, 0.7], [0.05, 0.05, 1.26]);
  list.box(P.hazard, [railX, 0.3, 0.7], [0.04, 0.04, 1.26], { shadow: false });

  if (detail >= 1) {
    // 팔레트에 쌓아 둔 파지 묶음 (셔터 문 앞)
    for (const [x, z, n] of [
      [-5.5, 2.3, 2],
      [-4.75, 2.35, 1],
    ] as const) {
      list.box(P.pallet, [x, 0, z], [0.62, 0.07, 0.5], { shadow: false });
      for (let i = 0; i < n; i += 1) list.box(P.bale, [x, 0.07 + i * 0.36, z], [0.56, 0.36, 0.44]);
    }
    worker(list, -3.7, 1.3, 0.6);
    worker(list, -5.2, 0.4, -1.2);
  }
  if (detail >= 2) {
    // 소화기함과 공구함
    list.box(P.barrierRed, [minX + 0.12, 0.5, -2.6], [0.12, 0.4, 0.26], { shadow: false });
    list.box(P.steel, [-0.6, 0, 2.7], [0.9, 0.7, 0.36]);
    list.box(P.steelDark, [-0.6, 0.7, 2.7], [0.94, 0.04, 0.4], { shadow: false });
  }
}
