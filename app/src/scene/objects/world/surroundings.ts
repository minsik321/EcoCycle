import { APRON, BUILDING, GATE, OFFICE, PARKING, ROAD, SITE } from '../../../config/sceneLayout';
import { PALETTE as P } from '../../palette';
import type { PartList } from './parts';
import { bush, car, fenceRun, lamp, tree, worker } from './props';

/** 사무동: 2층 건물. 카메라 쪽 두 면에 창을 낸다 */
function addOffice(list: PartList, detail: number): void {
  const { minX, maxX, minZ, maxZ, height } = OFFICE;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  list.box(P.officeWall, [cx, 0, cz], [width, height, depth]);
  list.box(P.officeRoof, [cx, height, cz], [width + 0.14, 0.1, depth + 0.14], { shadow: false });
  list.box(P.trim, [cx, height * 0.5 - 0.06, minZ - 0.01], [width, 0.07, 0.03], { shadow: false });
  for (const y of [0.35, 1.15]) {
    for (let x = minX + 0.45; x < maxX - 0.2; x += 0.62) {
      // 1층 가운데는 출입문 자리
      if (y < 1 && Math.abs(x - cx) < 0.4) continue;
      list.box(P.glass, [x, y, minZ - 0.01], [0.4, 0.42, 0.03], { shadow: false });
    }
    for (let z = minZ + 0.4; z < maxZ - 0.2; z += 0.6) list.box(P.glass, [maxX + 0.01, y, z], [0.03, 0.42, 0.38], { shadow: false });
  }
  // 출입문과 차양
  list.box(P.trimDark, [cx, 0, minZ - 0.01], [0.46, 0.7, 0.03], { shadow: false });
  list.box(P.trim, [cx, 0.74, minZ - 0.2], [0.9, 0.06, 0.4], { shadow: false });
  if (detail >= 1) {
    list.box(P.cabinet, [maxX - 0.6, height + 0.1, cz], [0.5, 0.26, 0.4], { shadow: false });
    worker(list, cx + 0.7, minZ - 0.5, 0.4);
  }
}

/** 주차된 차. 화질 단계가 낮으면 수를 줄인다 */
function addParking(list: PartList, detail: number): void {
  const slot = (PARKING.maxZ - PARKING.minZ) / PARKING.slots;
  // 칸마다 세울 차의 색 번호 (-1은 빈 칸)
  const layout = detail === 0 ? [0, -1, -1, 2, -1, -1] : detail === 1 ? [0, 1, -1, 2, -1, 4] : [0, 1, -1, 2, 3, 4];
  layout.forEach((colorIndex, i) => {
    if (colorIndex < 0) return;
    const z = PARKING.minZ + slot * (i + 0.5);
    car(list, PARKING.maxX - 0.75, z, 0, P.car[colorIndex] ?? P.car[0], detail >= 1);
  });
}

/** 울타리: 부지 둘레. 정문 자리는 비운다 */
function addFence(list: PartList, detail: number): void {
  const spacing = detail === 0 ? 2.6 : 1.3;
  fenceRun(list, SITE.minX, SITE.minZ, SITE.maxX, SITE.minZ, spacing);
  fenceRun(list, SITE.minX, SITE.maxZ, SITE.maxX, SITE.maxZ, spacing);
  fenceRun(list, SITE.minX, SITE.minZ, SITE.minX, SITE.maxZ, spacing);
  fenceRun(list, SITE.maxX, SITE.minZ, SITE.maxX, ROAD.minZ - 0.33, spacing);
  fenceRun(list, SITE.maxX, ROAD.maxZ + 0.33, SITE.maxX, SITE.maxZ, spacing);
}

/** 가짜 난수: 같은 번호는 항상 같은 값 (다시 그릴 때 나무가 튀지 않는다) */
const noise = (n: number): number => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

function addGreenery(list: PartList, detail: number): void {
  // 화질 단계가 낮을수록 듬성듬성 심는다
  const step = detail === 0 ? 4 : detail === 1 ? 2 : 1;
  let index = 0;
  const plant = (x: number, z: number) => {
    index += 1;
    if (index % step !== 0) return;
    const jitter = noise(index);
    tree(list, x + (jitter - 0.5) * 0.3, z + (noise(index + 40) - 0.5) * 0.3, 0.85 + jitter * 0.5, jitter > 0.62 ? 1 : 0);
  };

  // 본관 뒤(+Z)와 옆(-X)의 나무 줄
  for (let x = SITE.minX + 0.7; x < OFFICE.minX - 0.6; x += 1.05) plant(x, BUILDING.maxZ + 1.5 + (index % 2) * 0.5);
  for (let z = SITE.minZ + 3.2; z < BUILDING.maxZ + 1; z += 1.1) plant(SITE.minX + 0.55, z);
  // 정문 옆 잔디와 주차장 끝
  for (let z = ROAD.maxZ + 0.7; z < APRON.minZ - 0.2; z += 1.0) plant(GATE.x - 0.6 - (index % 2) * 1.6, z + 0.2);
  // 부지 밖 (바깥 도로 건너편과 먼 쪽)
  for (let z = -10.5; z < 8.5; z += 1.9) plant(ROAD.publicMaxX + 0.7 + noise(index + 7) * 0.5, z);
  for (let x = SITE.minX - 1.5; x < SITE.maxX; x += 2.3) plant(x, SITE.maxZ + 1.1 + noise(index + 3) * 1.2);
  for (let z = SITE.minZ; z < SITE.maxZ; z += 2.4) plant(SITE.minX - 1.2 - noise(index + 9), z);

  if (detail >= 1) {
    for (let z = PARKING.minZ + 0.3; z < PARKING.maxZ; z += 0.8) bush(list, PARKING.maxX + 0.38, z);
    for (let x = OFFICE.minX + 0.3; x < OFFICE.maxX; x += 0.9) {
      if (Math.abs(x - (OFFICE.minX + OFFICE.maxX) / 2) > 0.7) bush(list, x, OFFICE.minZ - 0.22, 0.8);
    }
  }
}

function addLamps(list: PartList, detail: number): void {
  const z = ROAD.minZ - 0.3;
  for (let x = ROAD.minX + 1.2; x < ROAD.maxX - 4; x += detail === 0 ? 6 : 3.4) lamp(list, x, z, -Math.PI / 2);
  lamp(list, APRON.maxX - 0.1, APRON.minZ - 0.25, Math.PI);
  if (detail >= 1) lamp(list, APRON.maxX - 0.1, APRON.maxZ + 0.25, Math.PI);
}

/** 본관 밖의 주변: 사무동, 주차 차량, 울타리, 나무, 가로등 */
export function addSurroundings(list: PartList, detail: number): void {
  addOffice(list, detail);
  addParking(list, detail);
  addFence(list, detail);
  addGreenery(list, detail);
  addLamps(list, detail);
}
