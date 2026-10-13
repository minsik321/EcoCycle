import { COMPRESSOR, CONVEYOR, SECTOR } from '../../../config/sceneLayout';
import { PALETTE as P } from '../../palette';
import { sectorDividers } from './building';
import type { PartList } from './parts';

// 설비의 움직이지 않는 몸체. 움직이는 부분(파지 더미, 벨트 줄무늬, 프레스 램, 상태 색)은 각 기기 컴포넌트가 그린다.

/** 수납 섹터 4칸: 칸막이 벽과 로봇 쪽 낮은 벽. 트럭 쪽은 열려 있다 */
export function addSectorBays(list: PartList): void {
  const dividers = sectorDividers();
  const length = SECTOR.maxX - SECTOR.minX;
  const centerX = (SECTOR.minX + SECTOR.maxX) / 2;
  for (const z of dividers) {
    list.box(P.bayWall, [centerX, 0, z], [length, SECTOR.wallHeight, SECTOR.wallThickness]);
  }
  const first = dividers[0] ?? 0;
  const last = dividers[dividers.length - 1] ?? 0;
  list.box(P.bayWall, [SECTOR.minX, 0, (first + last) / 2], [SECTOR.wallThickness, SECTOR.backWallHeight, last - first + SECTOR.wallThickness]);
}

/** 컨베이어(Section Z)의 틀: 벨트 몸통, 다리, 로봇이 내려놓는 쪽의 가드 */
export function addConveyorFrame(list: PartList): void {
  const { startX, endX, z, width, topY, thickness, legSpacing } = CONVEYOR;
  const length = Math.abs(startX - endX);
  const centerX = (startX + endX) / 2;
  list.box(P.belt, [centerX, topY - thickness, z], [length, thickness, width]);
  // 카메라에서 먼 쪽 옆 테두리 (가까운 쪽은 상태 색 띠가 붙는다)
  list.box(P.steel, [centerX, topY - 0.06, z + width / 2 + 0.03], [length, 0.14, 0.06], { shadow: false });

  const legHeight = topY - thickness;
  for (let x = startX - 0.25; x > endX + 0.5; x -= legSpacing) {
    for (const side of [-1, 1]) list.box(P.steel, [x, 0, z + side * (width / 2 - 0.06)], [0.09, legHeight, 0.09]);
    list.box(P.steel, [x, legHeight * 0.4, z], [0.06, 0.06, width - 0.2], { shadow: false });
  }

  // 로봇이 파지를 내려놓는 쪽의 가드 (흘리지 않게 둘러 막는다)
  const guardLength = 0.95;
  const guardX = startX - guardLength / 2;
  for (const side of [-1, 1]) {
    list.box(P.steelDark, [guardX, topY, z + side * (width / 2 + 0.02)], [guardLength, 0.26, 0.04], { shadow: false });
  }
  list.box(P.steelDark, [startX + 0.02, topY, z], [0.04, 0.26, width + 0.08], { shadow: false });
}

/** 압축기 몸체: 유압 장치, 압축실, 투입구, 결속부, 배출 슬라이드. 램(움직이는 판)은 기기 컴포넌트가 그린다 */
export function addCompressorBody(list: PartList, detail: number): void {
  const { x, z, width, depth, height, hopperTopY, ramGap, strapDepth, slideEndZ } = COMPRESSOR;
  const chamberMaxZ = z + depth / 2;
  const chamberMinZ = z - depth / 2;

  // 압축실
  list.box(P.machine, [x, 0, z], [width, height, depth]);
  list.box(P.machineDark, [x + width / 2 + 0.01, 0.28, z - 0.1], [0.03, 0.7, depth * 0.62], { shadow: false });
  list.box(P.cabinet, [x + width / 2 + 0.06, 0.5, chamberMaxZ - 0.22], [0.1, 0.5, 0.3], { shadow: false });

  // 투입구: 위가 열린 테두리 (컨베이어 끝이 이 위에 온다)
  const rim = hopperTopY - height;
  const wall = 0.08;
  for (const side of [-1, 1]) {
    list.box(P.machineDark, [x + side * (width / 2 - wall / 2), height, z], [wall, rim, depth], { shadow: false });
    list.box(P.machineDark, [x, height, z + side * (depth / 2 - wall / 2)], [width - wall * 2, rim, wall], { shadow: false });
  }

  // 유압 장치 (+Z 쪽): 램을 민다. 압축실과의 틈에서 램이 보인다
  const unitDepth = 1.1;
  const unitZ = chamberMaxZ + ramGap + unitDepth / 2;
  list.box(P.machineDark, [x, 0, unitZ], [0.95, 0.85, unitDepth]);
  list.cyl(P.steel, [x - 0.15, 0.85, unitZ + 0.15], [0.42, 0.34, 0.42], { shadow: false });
  // 틈을 잇는 가이드 빔
  for (const side of [-1, 1]) {
    list.box(P.steel, [x + side * 0.6, 0.06, chamberMaxZ + ramGap / 2], [0.1, 0.1, ramGap + 0.1], { shadow: false });
    list.box(P.steel, [x + side * 0.6, 0.9, chamberMaxZ + ramGap / 2], [0.1, 0.1, ramGap + 0.1], { shadow: false });
  }

  // 결속부: 배출구와 노란 문형 틀, 끈 타래
  const strapZ = chamberMinZ - strapDepth / 2;
  list.box(P.machine, [x, 0.3, strapZ], [width * 0.82, 0.8, strapDepth]);
  for (const side of [-1, 1]) list.box(P.hazard, [x + side * (width / 2 - 0.03), 0, strapZ - 0.06], [0.1, 1.5, 0.1]);
  list.box(P.hazard, [x, 1.5, strapZ - 0.06], [width + 0.04, 0.1, 0.1]);
  if (detail >= 1) {
    for (const side of [-1, 1]) {
      list.cyl(P.strap, [x + side * 0.3, 1.6, strapZ - 0.06], [0.3, 0.1, 0.3], { rz: Math.PI / 2, shadow: false });
    }
  }

  // 배출 슬라이드: 결속부에서 본관 밖 출하장으로 내려간다
  const slideStartZ = chamberMinZ - strapDepth;
  const run = slideStartZ - slideEndZ;
  const drop = 0.46;
  const slideLength = Math.hypot(run, drop);
  const tilt = -Math.atan2(drop, run);
  const slideZ = (slideStartZ + slideEndZ) / 2;
  list.box(P.steel, [x, 0.07 + drop / 2, slideZ], [width * 0.72, 0.06, slideLength], { rx: tilt });
  for (const side of [-1, 1]) {
    list.box(P.steelDark, [x + side * width * 0.36, 0.07 + drop / 2, slideZ], [0.05, 0.16, slideLength], { rx: tilt, shadow: false });
  }
  list.box(P.steel, [x, 0, slideStartZ - 0.25], [width * 0.6, 0.42, 0.08], { shadow: false });
}
