import { GATE, ROAD, WEIGHBRIDGE } from '../../../config/sceneLayout';
import { PALETTE as P } from '../../palette';
import type { PartList } from './parts';
import { worker } from './props';

const LANE_Z = (ROAD.minZ + ROAD.maxZ) / 2;

/** 차단기 하나: 기둥과 빨강·흰색 막대. raised면 들어 올린 모습 */
function barrier(list: PartList, x: number, pivotZ: number, direction: 1 | -1, length: number, raised: boolean): void {
  list.box(P.steelDark, [x, 0, pivotZ], [0.16, 0.5, 0.16]);
  const segments = 4;
  const piece = length / segments;
  const angle = raised ? (direction * -70 * Math.PI) / 180 : 0;
  for (let i = 0; i < segments; i += 1) {
    const along = (i + 0.5) * piece;
    const z = pivotZ + direction * along * Math.cos(angle);
    const y = 0.42 + along * Math.abs(Math.sin(angle));
    list.box(i % 2 === 0 ? P.barrierRed : P.laneMark, [x, y - 0.03, z], [0.05, 0.06, piece], { rx: angle, shadow: i === 0 });
  }
}

/** 정문과 경비실: 문기둥, 들어오는 차로·나가는 차로의 차단기, 경비실 */
export function addGate(list: PartList, detail: number): void {
  const x = GATE.x;
  // 문기둥 (파란 머리)
  for (const z of [ROAD.minZ - 0.18, ROAD.maxZ + 0.18]) {
    list.box(P.wall, [x, 0, z], [0.3, 1.25, 0.3]);
    list.box(P.trim, [x, 1.25, z], [0.36, 0.12, 0.36], { shadow: false });
  }
  // 차로 사이의 섬과 차단기: 들어오는 차로(-Z 쪽)는 내려 있고 나가는 차로는 올라가 있다
  list.box(P.concrete, [x - 0.2, 0, LANE_Z], [0.9, 0.08, 0.2], { shadow: false });
  const laneWidth = (ROAD.maxZ - ROAD.minZ) / 2 - 0.12;
  barrier(list, x - 0.2, LANE_Z - 0.02, -1, laneWidth, false);
  barrier(list, x - 0.45, LANE_Z + 0.02, 1, laneWidth, true);

  // 경비실
  const g = GATE.guardHouse;
  list.box(P.wall, [g.x, 0, g.z], [g.width, g.height, g.depth]);
  list.box(P.glass, [g.x, 0.5, g.z - g.depth / 2 - 0.01], [g.width * 0.7, 0.36, 0.03], { shadow: false });
  list.box(P.glass, [g.x + g.width / 2 + 0.01, 0.5, g.z], [0.03, 0.36, g.depth * 0.6], { shadow: false });
  list.box(P.trim, [g.x, g.height, g.z - 0.06], [g.width + 0.24, 0.1, g.depth + 0.3], { shadow: false });
  if (detail >= 1) worker(list, g.x - 0.1, g.z - g.depth / 2 - 0.35, Math.PI / 2);
}

/** 계중대: 들어오는 차로 위의 낮은 판, 번호판 카메라 기둥, 표시판 (무게 숫자는 그리지 않는다) */
export function addWeighbridge(list: PartList, detail: number): void {
  const { minX, maxX, z, width } = WEIGHBRIDGE;
  const length = maxX - minX;
  const centerX = (minX + maxX) / 2;
  list.box(P.steel, [centerX, 0, z], [length, 0.06, width], { shadow: false });
  // 판 양옆의 노란 턱
  for (const side of [-1, 1]) {
    list.box(P.hazard, [centerX, 0, z + side * (width / 2 + 0.04)], [length, 0.1, 0.06], { shadow: false });
  }
  // 오르내리는 경사
  for (const [x, tilt] of [
    [maxX + 0.12, -0.24],
    [minX - 0.12, 0.24],
  ] as const) {
    list.box(P.steelDark, [x, 0, z], [0.26, 0.03, width], { rz: tilt, shadow: false });
  }

  // 번호판 카메라: 차가 들어오는 쪽(+X)에 서서 계중대를 본다
  const poleZ = ROAD.minZ - 0.28;
  list.box(P.lampPole, [maxX + 0.5, 0, poleZ], [0.08, 1.35, 0.08]);
  list.box(P.lampPole, [maxX + 0.5, 1.3, poleZ + 0.2], [0.06, 0.06, 0.46], { shadow: false });
  list.box(P.steelDark, [maxX + 0.42, 1.14, poleZ + 0.38], [0.3, 0.16, 0.16], { shadow: false });
  list.box(P.glass, [maxX + 0.26, 1.17, poleZ + 0.38], [0.03, 0.1, 0.1], { shadow: false });

  // 표시판: 기둥 두 개 위의 어두운 판 (화면에는 진행 표시만 올린다)
  const boardX = minX - 0.5;
  for (const dx of [-0.32, 0.32]) list.box(P.lampPole, [boardX + dx, 0, poleZ], [0.06, 0.9, 0.06], { shadow: false });
  list.box(P.steelDark, [boardX, 0.9, poleZ], [0.9, 0.5, 0.08]);
  list.box(P.trim, [boardX, 1.4, poleZ], [0.94, 0.05, 0.1], { shadow: false });

  if (detail >= 1) worker(list, centerX + 0.3, ROAD.minZ - 0.3, Math.PI);
}
