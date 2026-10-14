import { TANK_IDS } from '@ecocycle/shared';
import type { Group } from 'three';
import { C } from '../theme';
import { Kit } from '../three/kit';
import { APRON, BALE, BALER, BAY, BAY_Z, CONVEYOR, GATE, HALL, OFFICE, PARKING, ROAD, SCALE, SITE, YARD } from './layout';
import { bale, bush, car, cone, drum, lamp, pallet, tree } from './props';

// 스튜디오 월드의 고정물. 전부 코드로 조립하고 재질별 메시 몇 개로 합친다.
// 본관 벽은 방향별로 따로 만들어, 카메라 쪽을 향한 벽은 숨긴다 (안이 들여다보이는 "인형의 집" 방식).

export interface Wall {
  group: Group;
  /** 벽이 바깥을 보는 방향 (x, z) */
  nx: number;
  nz: number;
}

export interface World {
  base: Group;
  walls: Wall[];
}

const mid = (a: number, b: number) => (a + b) / 2;

function ground(k: Kit): void {
  // 끝없이 이어지는 듯한 미색 바닥과 그 위의 부지 판
  k.cyl(C.floor, 170, 0.4, [4, -0.52, -1], { seg: 64 });
  k.box(C.pad, [SITE.maxX - SITE.minX + 1.6, 0.12, SITE.maxZ - SITE.minZ + 1.6], [mid(SITE.minX, SITE.maxX), -0.12, mid(SITE.minZ, SITE.maxZ)], { r: 0.06, seg: 3 });
  k.box(C.padEdge, [SITE.maxX - SITE.minX + 2.2, 0.1, SITE.maxZ - SITE.minZ + 2.2], [mid(SITE.minX, SITE.maxX), -0.2, mid(SITE.minZ, SITE.maxZ)], { r: 0.05 });

  // 도로: 부지를 가로지르고, 양 끝은 바닥색으로 옅어진다
  const roadW = ROAD.maxZ - ROAD.minZ;
  const roadZ = mid(ROAD.minZ, ROAD.maxZ);
  k.box(C.asphalt, [SITE.maxX - SITE.minX + 1.6, 0.03, roadW], [mid(SITE.minX, SITE.maxX), -0.012, roadZ], { r: 0 });
  const fade = ['#c9cfd8', '#d1d6de', '#d9dde4', '#e0e4ea', '#e5e9ee'];
  fade.forEach((hex, i) => {
    k.box(hex, [4.02, 0.03, roadW], [SITE.maxX + 0.8 + 2 + i * 4, -0.012 - (i + 1) * 0.002, roadZ], { r: 0 });
    k.box(hex, [4.02, 0.03, roadW], [SITE.minX - 0.8 - 2 - i * 4, -0.012 - (i + 1) * 0.002, roadZ], { r: 0 });
    // 출하 통로도 서쪽으로 이어진다
    k.box(i < 2 ? C.concrete : hex, [4.02, 0.03, 1.5], [SITE.minX - 0.8 - 2 - i * 4, -0.014 - (i + 1) * 0.002, YARD.laneZ], { r: 0 });
  });
  for (let x = SITE.minX - 6; x < SITE.maxX + 8; x += 1.6) {
    if (x > SCALE.minX - 0.8 && x < SCALE.maxX + 0.4) continue;
    k.box(C.line, [0.8, 0.012, 0.09], [x, 0.018, roadZ], { r: 0 });
  }
  k.box(C.line, [SITE.maxX - SITE.minX + 1.6, 0.012, 0.07], [mid(SITE.minX, SITE.maxX), 0.018, ROAD.minZ + 0.14], { r: 0 });
  k.box(C.line, [SITE.maxX - APRON.maxX + 0.8, 0.012, 0.07], [mid(APRON.maxX, SITE.maxX + 0.8), 0.018, ROAD.maxZ - 0.14], { r: 0 });

  // 하역 마당, 출하 마당
  k.box(C.concrete, [APRON.maxX - APRON.minX, 0.04, APRON.maxZ - APRON.minZ], [mid(APRON.minX, APRON.maxX), -0.012, mid(APRON.minZ, APRON.maxZ)], { r: 0.015 });
  k.box(C.concrete, [YARD.maxX - YARD.minX + 0.8, 0.04, YARD.maxZ - YARD.minZ], [mid(YARD.minX - 0.8, YARD.maxX), -0.012, mid(YARD.minZ, YARD.maxZ)], { r: 0.015 });

  // 잔디 섬 (부드러운 연두색 판)
  const lawns: Array<[number, number, number, number]> = [
    [-12.2, 4.9, -10.4, 8.1],
    [-10.2, 5.0, 4.6, 8.1],
    [12.4, 5.3, 19.7, 8.1],
    [13.4, -7.0, 19.7, -5.2],
    [-12.2, -10.95, 19.7, -10.72],
    [5.0, 5.3, 5.9, 8.1],
  ];
  for (const [x0, z0, x1, z1] of lawns) k.box(C.greenPale, [x1 - x0, 0.07, z1 - z0], [mid(x0, x1), -0.01, mid(z0, z1)], { r: 0.035, seg: 3 });
}

function markings(k: Kit): void {
  const y = 0.03;
  // 섹터 앞 후진 유도선과 정지선
  for (let i = 0; i <= 4; i += 1) {
    const z = -3.4 + i * BAY.width;
    k.box(C.line, [3.0, 0.012, 0.07], [6.35, y, z], { r: 0 });
  }
  for (const id of TANK_IDS) {
    const z = mid(BAY_Z[id][0], BAY_Z[id][1]);
    k.box(C.yellow, [0.09, 0.012, 1.1], [7.95, y, z], { r: 0 });
    // 진입 화살표
    k.box(C.blueSoft, [0.9, 0.012, 0.1], [9.9, y, z], { r: 0 });
    k.box(C.blueSoft, [0.34, 0.012, 0.1], [9.56, y, z + 0.1], { r: 0, rot: [0, -0.7, 0] });
    k.box(C.blueSoft, [0.34, 0.012, 0.1], [9.56, y, z - 0.1], { r: 0, rot: [0, 0.7, 0] });
  }
  // 진입 차로(파랑 점선)와 진출 차로
  for (let z = ROAD.maxZ + 0.3; z < 3.4; z += 0.9) k.box(C.blueSoft, [0.08, 0.012, 0.45], [APRON.laneX - 0.75, y, z], { r: 0 });
  for (let z = ROAD.maxZ + 0.3; z < 3.4; z += 0.9) k.box(C.line, [0.08, 0.012, 0.45], [APRON.exitX + 0.75, y, z], { r: 0 });
  // 빗금 구역 (본관 모서리)
  for (let i = 0; i < 7; i += 1) k.box(C.yellow, [0.07, 0.012, 0.9], [5.0 + i * 0.3, y, -5.2], { r: 0, rot: [0, 0.6, 0] });

  // 출하 마당: 적치 칸, 지게차 통로, 지게차 자리
  for (const x of YARD.slotXs) {
    k.box(C.yellow, [0.86, 0.012, 0.05], [x, y, YARD.slotZ + 0.56], { r: 0 });
    k.box(C.yellow, [0.86, 0.012, 0.05], [x, y, YARD.slotZ - 0.56], { r: 0 });
    k.box(C.yellow, [0.05, 0.012, 1.12], [x - 0.43, y, YARD.slotZ], { r: 0 });
    k.box(C.yellow, [0.05, 0.012, 1.12], [x + 0.43, y, YARD.slotZ], { r: 0 });
  }
  for (let x = YARD.minX + 0.4; x < YARD.maxX - 0.6; x += 0.8) k.box(C.blueSoft, [0.4, 0.012, 0.07], [x, y, YARD.laneZ - 0.62], { r: 0 });
  k.box(C.bluePale, [1.9, 0.012, 1.2], [YARD.home[0], y - 0.004, YARD.home[1]], { r: 0 });
  k.box(C.blue, [1.9, 0.014, 0.06], [YARD.home[0], y, YARD.home[1] + 0.6], { r: 0 });
  k.box(C.blue, [1.9, 0.014, 0.06], [YARD.home[0], y, YARD.home[1] - 0.6], { r: 0 });

  // 계중대: 강판 상판과 노란 턱
  const sx = mid(SCALE.minX, SCALE.maxX);
  const sw = SCALE.maxX - SCALE.minX;
  k.box(C.steelLight, [sw, 0.07, 1.5], [sx, -0.02, SCALE.z], { r: 0.025, mat: 'metal' });
  for (let i = 0; i < 7; i += 1) k.box(C.steel, [0.04, 0.012, 1.36], [SCALE.minX + 0.3 + i * ((sw - 0.6) / 6), 0.05, SCALE.z], { r: 0, mat: 'metal' });
  k.box(C.yellow, [sw + 0.1, 0.1, 0.09], [sx, 0, SCALE.z - 0.82], { r: 0.03 });
  k.box(C.yellow, [sw + 0.1, 0.1, 0.09], [sx, 0, SCALE.z + 0.82], { r: 0.03 });
}

function inbound(k: Kit): void {
  // 번호판 인식 문형 구조물 (들어오는 차로 위)
  const gx = SCALE.maxX + 0.75;
  k.cyl(C.steelLight, 0.07, 2.5, [gx, 0, SCALE.z - 1.05], { mat: 'metal' });
  k.cyl(C.steelLight, 0.07, 2.5, [gx, 0, SCALE.z + 1.05], { mat: 'metal' });
  k.box(C.blue, [0.16, 0.16, 2.4], [gx, 2.42, SCALE.z], { r: 0.05, mat: 'gloss' });
  for (const dz of [-0.5, 0.5]) {
    k.box(C.dark, [0.3, 0.16, 0.18], [gx - 0.16, 2.2, SCALE.z + dz], { r: 0.04, mat: 'gloss' });
    k.cyl('#7fd3ff', 0.045, 0.03, [gx - 0.32, 2.28, SCALE.z + dz], { axis: 'x', mat: 'glow', glow: 3 });
  }
  // 안내 표시판
  k.cyl(C.steelLight, 0.05, 1.7, [SCALE.minX - 0.5, 0, SCALE.z - 1.2], { mat: 'metal' });
  k.box(C.blue, [0.12, 0.62, 1.0], [SCALE.minX - 0.5, 1.5, SCALE.z - 1.2], { r: 0.06, mat: 'gloss' });
  k.box(C.white, [0.02, 0.1, 0.66], [SCALE.minX - 0.435, 1.9, SCALE.z - 1.2], { r: 0.01 });
  k.box(C.blueSoft, [0.02, 0.07, 0.5], [SCALE.minX - 0.435, 1.72, SCALE.z - 1.2], { r: 0.01 });
  // 신호등 기둥
  k.cyl(C.dark, 0.045, 1.5, [SCALE.minX - 0.2, 0, SCALE.z + 1.05]);
  k.box(C.dark, [0.16, 0.42, 0.16], [SCALE.minX - 0.2, 1.45, SCALE.z + 1.05], { r: 0.05 });

  // 정문: 기둥, 경비실
  for (const z of [ROAD.minZ - 0.25, ROAD.maxZ + 0.25]) {
    k.box(C.wall, [0.5, 1.5, 0.5], [GATE.x, 0, z], { r: 0.08, seg: 3 });
    k.box(C.blue, [0.58, 0.12, 0.58], [GATE.x, 1.5, z], { r: 0.05, mat: 'gloss' });
    k.ball('#fff3c4', 0.11, [GATE.x, 1.74, z], { mat: 'glow', glow: 2.2 });
  }
  k.box(C.wall, [0.3, 0.9, 0.3], [GATE.x, 0, mid(ROAD.minZ, ROAD.maxZ)], { r: 0.06 });
  k.at([GATE.houseX, 0, GATE.houseZ], 0, () => {
    k.box(C.concreteDark, [1.7, 0.1, 1.6], [0, 0, 0], { r: 0.04 });
    k.box(C.wall, [1.4, 1.5, 1.3], [0, 0.1, 0], { r: 0.1, seg: 3 });
    k.box(C.blue, [1.75, 0.14, 1.65], [0, 1.6, 0], { r: 0.06, mat: 'gloss', seg: 3 });
    k.box(C.glass, [1.0, 0.6, 0.04], [0, 0.75, -0.655], { r: 0.02, mat: 'glass' });
    k.box(C.glass, [0.04, 0.6, 0.9], [0.705, 0.75, 0], { r: 0.02, mat: 'glass' });
    k.box(C.trim, [1.1, 0.06, 0.1], [0, 0.69, -0.68], { r: 0.02 });
    k.box(C.blueDeep, [0.42, 0.95, 0.05], [-0.35, 0.1, 0.655], { r: 0.03 });
  });
}

function fence(k: Kit): void {
  const post = (x: number, z: number) => k.cyl(C.steelLight, 0.035, 0.85, [x, 0, z], { seg: 8, mat: 'metal' });
  const railX = (x0: number, x1: number, z: number) => {
    for (const y of [0.42, 0.76]) k.box(C.steelLight, [x1 - x0, 0.035, 0.035], [mid(x0, x1), y, z], { r: 0, mat: 'metal' });
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 1.6))) post(x, z);
  };
  const railZ = (z0: number, z1: number, x: number) => {
    for (const y of [0.42, 0.76]) k.box(C.steelLight, [0.035, 0.035, z1 - z0], [x, y, mid(z0, z1)], { r: 0, mat: 'metal' });
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / Math.max(1, Math.round((z1 - z0) / 1.6))) post(x, z);
  };
  const [x0, x1, z0, z1] = [SITE.minX + 0.1, SITE.maxX - 0.1, SITE.minZ + 0.1, SITE.maxZ - 0.1];
  railX(x0, x1, z1);
  railX(x0, x1, z0);
  railZ(ROAD.maxZ + 0.6, z1, x1);
  railZ(YARD.laneZ + 1.0, z1, x0);
}

function hallInterior(k: Kit): void {
  const w = HALL.maxX - HALL.minX;
  const d = HALL.maxZ - HALL.minZ;
  k.box('#f1f2f5', [w, 0.08, d], [mid(HALL.minX, HALL.maxX), -0.02, 0], { r: 0.02 });
  // 바닥 통로와 안전선
  k.box(C.bluePale, [9.6, 0.012, 0.7], [-4.2, 0.062, -3.2], { r: 0 });
  k.box(C.blueSoft, [9.6, 0.012, 0.05], [-4.2, 0.066, -2.85], { r: 0 });
  k.cyl(C.yellow, 1.12, 0.012, [0, 0.062, 0], { seg: 48 });
  k.cyl('#f1f2f5', 1.02, 0.012, [0, 0.066, 0], { seg: 48 });

  // 섹터 칸: 로봇 쪽 낮은 벽, 칸막이, 바닥
  k.box(C.concreteDark, [BAY.maxX - BAY.minX, 0.03, BAY.width * 4], [mid(BAY.minX, BAY.maxX), 0.05, 0], { r: 0 });
  k.box(C.wallShade, [0.2, BAY.backH, BAY.width * 4 + 0.2], [BAY.minX - 0.1, 0.06, 0], { r: 0.05, seg: 3 });
  k.box(C.yellow, [0.22, 0.07, BAY.width * 4 + 0.22], [BAY.minX - 0.1, BAY.backH + 0.03, 0], { r: 0.03 });
  for (let i = 0; i <= 4; i += 1) {
    const z = -3.4 + i * BAY.width;
    k.box(C.wall, [BAY.maxX - BAY.minX, BAY.dividerH, 0.2], [mid(BAY.minX, BAY.maxX), 0.06, z], { r: 0.06, seg: 3 });
    k.box(C.blue, [0.26, BAY.dividerH + 0.04, 0.26], [BAY.maxX + 0.02, 0.06, z], { r: 0.07, mat: 'gloss', seg: 3 });
    k.box(C.yellow, [0.3, 0.5, 0.3], [BAY.maxX + 0.02, 0.06, z], { r: 0.07, seg: 3 });
  }

  // 컨베이어 틀: 다리, 옆 레일, 끝 모터
  const cx = mid(CONVEYOR.startX, CONVEYOR.endX);
  const len = CONVEYOR.startX - CONVEYOR.endX;
  const top = CONVEYOR.topY;
  for (const dz of [-1, 1]) {
    k.box(C.blue, [len + 0.3, 0.2, 0.07], [cx, top - 0.14, CONVEYOR.z + dz * (CONVEYOR.width / 2 + 0.035)], { r: 0.03, mat: 'gloss' });
    k.box(C.steelLight, [len - 0.5, 0.05, 0.04], [cx, top + 0.16, CONVEYOR.z + dz * (CONVEYOR.width / 2 + 0.035)], { r: 0.015, mat: 'metal' });
    for (let x = CONVEYOR.startX - 0.3; x > CONVEYOR.endX + 0.2; x -= 0.83) k.cyl(C.steelLight, 0.022, 0.24, [x, top + 0.02, CONVEYOR.z + dz * (CONVEYOR.width / 2 + 0.035)], { seg: 8, mat: 'metal' });
  }
  for (let x = CONVEYOR.startX - 0.25; x > CONVEYOR.endX + 0.5; x -= 1.18) {
    for (const dz of [-1, 1]) k.box(C.steel, [0.09, top - 0.2, 0.09], [x, 0.05, CONVEYOR.z + dz * (CONVEYOR.width / 2 - 0.02)], { r: 0.025, mat: 'metal' });
    k.box(C.steel, [0.07, 0.07, CONVEYOR.width], [x, 0.42, CONVEYOR.z], { r: 0.02, mat: 'metal' });
    k.box(C.concreteDark, [0.3, 0.05, CONVEYOR.width + 0.3], [x, 0.05, CONVEYOR.z], { r: 0.02 });
  }
  k.cyl(C.steel, 0.1, CONVEYOR.width + 0.1, [CONVEYOR.startX + 0.05, top - 0.1, CONVEYOR.z], { axis: 'z', mat: 'metal' });
  k.cyl(C.steel, 0.1, CONVEYOR.width + 0.1, [CONVEYOR.endX - 0.05, top - 0.1, CONVEYOR.z], { axis: 'z', mat: 'metal' });
  k.box(C.yellow, [0.42, 0.34, 0.3], [CONVEYOR.endX + 0.5, top - 0.5, CONVEYOR.z + CONVEYOR.width / 2 + 0.2], { r: 0.07, mat: 'gloss', seg: 3 });
  k.cyl(C.dark, 0.11, 0.16, [CONVEYOR.endX + 0.5, top - 0.33, CONVEYOR.z + CONVEYOR.width / 2 + 0.42], { axis: 'z' });

  baler(k);

  // 조작반, 소품
  k.at([-5.4, 0.06, -3.55], 0, () => {
    k.box(C.wall, [0.8, 1.0, 0.36], [0, 0, 0], { r: 0.06, seg: 3 });
    k.box(C.blue, [0.84, 0.08, 0.4], [0, 1.0, 0], { r: 0.03, mat: 'gloss' });
    k.box(C.dark, [0.5, 0.3, 0.03], [0, 0.55, 0.19], { r: 0.02 });
    k.box('#8fe6b0', [0.42, 0.04, 0.02], [0, 0.72, 0.205], { r: 0, mat: 'glow', glow: 1.6 });
    k.box('#7fd3ff', [0.3, 0.04, 0.02], [-0.06, 0.63, 0.205], { r: 0, mat: 'glow', glow: 1.6 });
  });
  drum(k, -9.3, -3.3, C.blue);
  drum(k, -8.75, -3.4, C.steelLight);
  drum(k, -9.15, -2.75, C.yellow);
  pallet(k, -2.6, 2.9, 0.2);
  pallet(k, -2.6, 2.9, 0.2, 0.13);
  pallet(k, -3.9, 3.0, -0.1);
  k.box(C.kraftLight, [0.6, 0.45, 0.5], [-3.9, 0.2, 3.0], { r: 0.05 });
  k.box(C.kraft, [0.5, 0.4, 0.5], [-4.7, 0.06, 3.2], { r: 0.05 });
  // 로봇 제어반
  k.box(C.wall, [0.5, 1.25, 0.7], [-1.3, 0.06, 1.75], { r: 0.07, seg: 3 });
  k.box(C.yellow, [0.52, 0.08, 0.72], [-1.3, 1.31, 1.75], { r: 0.03 });
  k.box('#8fe6b0', [0.02, 0.05, 0.3], [-1.045, 1.0, 1.75], { r: 0, mat: 'glow', glow: 1.6 });
  // 안전 울타리 (로봇 서쪽)
  for (let i = 0; i < 5; i += 1) {
    const z = 0.5 + i * 0.55;
    k.cyl(C.yellow, 0.03, 0.9, [-2.1, 0.06, z], { seg: 8 });
  }
  k.box(C.yellow, [0.04, 0.04, 2.3], [-2.1, 0.92, 1.6], { r: 0.015 });
  k.box(C.yellow, [0.04, 0.04, 2.3], [-2.1, 0.55, 1.6], { r: 0.015 });
}

function baler(k: Kit): void {
  const { x, minZ, maxZ, halfX, height } = BALER;
  const t = 0.13;
  const y0 = 0.06;
  // 받침과 압축실 (위가 열린 상자: 바닥 + 벽 네 장)
  k.box(C.concreteDark, [halfX * 2 + 0.5, 0.08, maxZ - minZ + 3.2], [x, 0.04, mid(minZ, maxZ) + 0.5], { r: 0.03 });
  k.box(C.dark, [halfX * 2, 0.1, maxZ - minZ], [x, y0 + 0.04, mid(minZ, maxZ)], { r: 0.02 });
  k.box(C.wall, [t, height, maxZ - minZ], [x - halfX + t / 2, y0, mid(minZ, maxZ)], { r: 0.05, mat: 'gloss', seg: 3 });
  k.box(C.wall, [t, height, maxZ - minZ], [x + halfX - t / 2, y0, mid(minZ, maxZ)], { r: 0.05, mat: 'gloss', seg: 3 });
  k.box(C.wall, [halfX * 2, height, t], [x, y0, maxZ - t / 2], { r: 0.05, mat: 'gloss', seg: 3 });
  // 배출구 쪽 벽은 위쪽만 (아래로 베일이 나간다)
  k.box(C.wall, [halfX * 2, height - 0.72, t], [x, y0 + 0.72, minZ + t / 2], { r: 0.04, mat: 'gloss' });
  // 파란 보강 띠
  for (const dz of [0.25, 0.75]) {
    const z = minZ + (maxZ - minZ) * dz;
    k.box(C.blue, [halfX * 2 + 0.1, height + 0.06, 0.12], [x, y0, z], { r: 0.04, mat: 'gloss' });
  }
  // 투입구 깔때기
  const rim = height + y0;
  const flare = 0.34;
  k.box(C.steelLight, [0.05, 0.5, maxZ - minZ - 0.1], [x - halfX - 0.08, rim - 0.04, mid(minZ, maxZ)], { r: 0.02, rot: [0, 0, flare], mat: 'metal' });
  k.box(C.steelLight, [0.05, 0.5, maxZ - minZ - 0.1], [x + halfX + 0.08, rim - 0.04, mid(minZ, maxZ)], { r: 0.02, rot: [0, 0, -flare], mat: 'metal' });
  k.box(C.steelLight, [halfX * 2 + 0.1, 0.5, 0.05], [x, rim - 0.04, minZ - 0.08], { r: 0.02, rot: [flare, 0, 0], mat: 'metal' });
  k.box(C.steelLight, [halfX * 2 + 0.1, 0.5, 0.05], [x, rim - 0.04, maxZ + 0.08], { r: 0.02, rot: [-flare, 0, 0], mat: 'metal' });

  // 유압 장치 (+Z 쪽): 실린더 집, 탱크, 배관
  const hz = maxZ + 1.35;
  k.box(C.blue, [1.3, 0.85, 1.3], [x, y0, hz], { r: 0.1, mat: 'gloss', seg: 3 });
  k.box(C.blueDeep, [1.36, 0.1, 1.36], [x, y0 + 0.85, hz], { r: 0.04, mat: 'gloss' });
  k.cyl(C.wall, 0.3, 0.9, [x - 0.2, y0 + 1.25, hz + 0.1], { axis: 'x', mat: 'gloss' });
  k.cyl(C.steelLight, 0.05, 0.5, [x + 0.42, y0 + 0.95, hz - 0.3], { mat: 'metal', seg: 10 });
  k.cyl(C.steelLight, 0.05, 0.9, [x + 0.42, y0 + 1.42, hz - 0.72], { axis: 'z', mat: 'metal', seg: 10 });
  k.cyl(C.yellow, 0.2, 0.75, [x, y0 + 0.5, maxZ + 0.42], { axis: 'z', mat: 'gloss' });
  k.cyl(C.dark, 0.1, 0.1, [x + 0.5, y0 + 1.02, hz + 0.4], { seg: 12 });

  // 결속부: 문형 틀과 끈 타래
  const sz = mid(BALER.strapZ, minZ);
  for (const dx of [-1, 1]) k.box(C.blue, [0.14, 1.45, 0.5], [x + dx * (halfX + 0.02), y0, sz], { r: 0.05, mat: 'gloss', seg: 3 });
  k.box(C.blue, [halfX * 2 + 0.18, 0.16, 0.5], [x, y0 + 1.4, sz], { r: 0.05, mat: 'gloss', seg: 3 });
  for (const dx of [-0.42, 0, 0.42]) {
    k.cyl(C.yellow, 0.15, 0.1, [x + dx, y0 + 1.72, sz], { axis: 'x', mat: 'gloss' });
    k.cyl(C.dark, 0.05, 0.14, [x + dx, y0 + 1.72, sz], { axis: 'x' });
  }
  k.box(C.steel, [1.5, 0.05, 0.05], [x, y0 + 1.72, sz], { r: 0.02, mat: 'metal' });

  // 배출 롤러대: 결속부에서 남쪽 벽을 지나 출하 마당까지
  const z0 = BALER.strapZ + 0.1;
  const z1 = BALER.chuteEndZ;
  for (const dx of [-1, 1]) {
    k.box(C.blue, [0.08, 0.16, z0 - z1], [x + dx * (BALE.w / 2 + 0.14), BALER.chuteY - 0.15, mid(z0, z1)], { r: 0.03, mat: 'gloss' });
    for (let z = z0 - 0.2; z > z1; z -= 0.95) k.box(C.steel, [0.08, BALER.chuteY - 0.15, 0.08], [x + dx * (BALE.w / 2 + 0.14), 0, z], { r: 0.02, mat: 'metal' });
  }
  for (let z = z0 - 0.08; z > z1 + 0.05; z -= 0.2) k.cyl(C.steelLight, 0.07, BALE.w + 0.2, [x, BALER.chuteY - 0.075, z], { axis: 'x', mat: 'metal', seg: 12 });
  k.box(C.yellow, [BALE.w + 0.36, 0.3, 0.07], [x, BALER.chuteY - 0.2, z1 - 0.02], { r: 0.03 });
}

function yardProps(k: Kit): void {
  // 미리 쌓아 둔 베일 더미 (연출용 소품)
  const sx = -10.6;
  for (let r = 0; r < 2; r += 1) for (let c = 0; c < 3; c += 1) bale(k, sx + c * 0.84, 0.02, -4.75 - r * 1.02, Math.PI / 2 + c * 0.02);
  for (let c = 0; c < 2; c += 1) bale(k, sx + 0.42 + c * 0.84, 0.02 + BALE.h, -4.75, Math.PI / 2 + 0.03);
  bale(k, sx + 0.3, 0.02 + BALE.h, -5.77, Math.PI / 2 - 0.05);
  bale(k, sx + 0.84, 0.02 + BALE.h * 2, -4.75, Math.PI / 2 + 0.02);
  pallet(k, 2.9, -4.7, 0);
  pallet(k, 2.9, -4.7, 0, 0.13);
  pallet(k, 2.9, -4.7, 0.05, 0.26);
  pallet(k, 3.75, -4.75, 0.1);
  cone(k, -8.25, -5.75);
  cone(k, -6.35, -5.75);
  cone(k, 3.2, -6.0);
  // 지게차 충전기
  k.box(C.wall, [0.34, 0.95, 0.26], [3.4, 0.02, -5.7], { r: 0.05, seg: 3 });
  k.box(C.blue, [0.36, 0.1, 0.28], [3.4, 0.97, -5.7], { r: 0.03, mat: 'gloss' });
  k.box('#8fe6b0', [0.14, 0.06, 0.02], [3.4, 0.72, -5.83], { r: 0, mat: 'glow', glow: 1.8 });
  // 하역 마당 소품
  for (const z of [-3.4, -1.7, 0, 1.7, 3.4]) cone(k, 5.25, z, 0.9);
  drum(k, 5.2, 4.3, C.blue);
  drum(k, 5.75, 4.35, C.steelLight);
  pallet(k, 6.6, 4.3, 0.2);
}

function office(k: Kit): void {
  const { minX, maxX, minZ, maxZ, height } = OFFICE;
  const cx = mid(minX, maxX);
  const cz = mid(minZ, maxZ);
  const w = maxX - minX;
  const d = maxZ - minZ;
  k.box(C.concreteDark, [w + 0.5, 0.08, d + 0.5], [cx, 0, cz], { r: 0.03 });
  k.box(C.wall, [w, height, d], [cx, 0.08, cz], { r: 0.12, seg: 4 });
  k.box(C.blue, [w + 0.06, 0.2, d + 0.06], [cx, 1.08, cz], { r: 0.06, mat: 'gloss' });
  k.box(C.trim, [w + 0.24, 0.14, d + 0.24], [cx, height + 0.06, cz], { r: 0.05, seg: 3 });
  // 창 (남쪽 면)
  for (let i = 0; i < 6; i += 1) {
    const x = minX + 0.55 + i * ((w - 1.1) / 5);
    k.box(C.glass, [0.56, 0.52, 0.05], [x, 1.42, minZ - 0.01], { r: 0.03, mat: 'glass' });
    if (i !== 2) k.box(C.glass, [0.56, 0.52, 0.05], [x, 0.4, minZ - 0.01], { r: 0.03, mat: 'glass' });
  }
  for (let i = 0; i < 2; i += 1) k.box(C.glass, [0.05, 0.52, 0.6], [maxX + 0.01, 1.42, minZ + 0.6 + i * 1.0], { r: 0.03, mat: 'glass' });
  // 현관
  const dx = minX + 0.55 + 2 * ((w - 1.1) / 5);
  k.box(C.blueDeep, [0.6, 0.95, 0.06], [dx, 0.08, minZ - 0.02], { r: 0.03, mat: 'gloss' });
  k.box(C.blue, [1.1, 0.08, 0.6], [dx, 1.08, minZ - 0.3], { r: 0.035, mat: 'gloss' });
  k.box(C.concreteDark, [1.1, 0.06, 0.5], [dx, 0.02, minZ - 0.28], { r: 0.02 });
  // 옥상: 태양광, 실외기
  for (let i = 0; i < 3; i += 1) k.box('#4a6fd8', [1.0, 0.05, 1.3], [minX + 0.9 + i * 1.2, height + 0.3, cz + 0.1], { r: 0.015, rot: [-0.3, 0, 0], mat: 'gloss' });
  k.box(C.steelLight, [0.7, 0.45, 0.5], [maxX - 0.8, height + 0.2, cz + 0.4], { r: 0.06, mat: 'metal' });
  k.cyl(C.dark, 0.17, 0.03, [maxX - 0.8, height + 0.65, cz + 0.4]);
  // 사무동 앞 보도
  k.box(C.wallShade, [w + 8.5, 0.03, 0.62], [cx + 2.6, 0, 5.05], { r: 0.012 });
  k.box(C.wallShade, [0.62, 0.03, 10.2], [13.75, 0, 0.2], { r: 0.012 });
}

function parking(k: Kit): void {
  const { minX, maxX, minZ, maxZ } = PARKING;
  k.box(C.asphalt, [maxX - minX, 0.04, maxZ - minZ], [mid(minX, maxX), -0.012, mid(minZ, maxZ)], { r: 0.015 });
  const stall = (maxZ - minZ - 0.4) / 6;
  for (let i = 0; i <= 6; i += 1) {
    const z = minZ + 0.2 + i * stall;
    k.box(C.line, [1.9, 0.012, 0.06], [minX + 1.15, 0.03, z], { r: 0 });
    k.box(C.line, [1.9, 0.012, 0.06], [maxX - 1.15, 0.03, z], { r: 0 });
  }
}

/** 주차 칸의 중심 (칸 번호 → Z) */
export function parkingZ(slot: number): number {
  const stall = (PARKING.maxZ - PARKING.minZ - 0.4) / 6;
  return PARKING.minZ + 0.2 + (slot + 0.5) * stall;
}

export interface ParkedCar {
  x: number;
  z: number;
  rotY: number;
  paint: string;
}

const CAR_PAINTS = [C.carNavy, C.white, C.carTeal, C.carRed, C.steelLight, C.blue];

/** 주차된 차의 자리와 색 (모델 파일을 쓰든 코드 모형을 쓰든 같은 자리) */
export const PARKED: ParkedCar[] = (
  [
    [0, 0, 0],
    [0, 1, 1],
    [0, 3, 2],
    [0, 4, 3],
    [1, 0, 4],
    [1, 2, 5],
    [1, 3, 1],
    [1, 5, 0],
  ] as const
).map(([side, slot, paint]) => ({
  x: side === 0 ? PARKING.minX + 1.15 : PARKING.maxX - 1.15,
  z: parkingZ(slot),
  rotY: side === 0 ? Math.PI : 0,
  paint: CAR_PAINTS[paint] ?? C.white,
}));

/** 코드로 만든 주차 차량 (모델 파일을 못 받았을 때 쓰는 모형) */
export function buildParkedCars(): Group {
  const k = new Kit();
  for (const c of PARKED) car(k, c.x, c.z, c.rotY, c.paint);
  return k.build('parked-cars');
}

function utilities(k: Kit): void {
  // 본관 뒤 사일로와 집진기 (배관이 벽으로 들어간다)
  for (const [x, h] of [[-8.6, 3.4], [-7.0, 2.9]] as const) {
    k.cyl(C.concreteDark, 0.78, 0.12, [x, 0, 5.75], { seg: 28 });
    k.cyl(C.wall, 0.7, h, [x, 0.12, 5.75], { seg: 28 });
    k.cyl(C.blue, 0.715, 0.2, [x, 0.12 + h * 0.62, 5.75], { seg: 28, mat: 'gloss' });
    k.cyl(C.trim, [0.12, 0.7], 0.42, [x, 0.12 + h, 5.75], { seg: 28 });
    k.cyl(C.steelLight, 0.03, h, [x + 0.74, 0.12, 5.75], { seg: 8, mat: 'metal' });
  }
  k.box(C.steelLight, [1.3, 1.5, 1.1], [-4.6, 0.5, 5.6], { r: 0.1, mat: 'metal', seg: 3 });
  for (const dx of [-0.5, 0.5]) for (const dz of [-0.4, 0.4]) k.cyl(C.steel, 0.045, 0.5, [-4.6 + dx, 0, 5.6 + dz], { seg: 8, mat: 'metal' });
  k.cyl(C.steelLight, [0.1, 0.5], 0.5, [-4.6, 0.05, 5.6], { mat: 'metal', seg: 4 });
  k.cyl(C.steelLight, 0.16, 1.7, [-4.6, 1.75, 4.85], { axis: 'z', mat: 'metal' });
  k.cyl(C.blue, 0.18, 0.1, [-4.6, 1.75, 4.25], { axis: 'z', mat: 'gloss' });

  // 가로등
  for (const [x, z, rot] of [
    [4.95, -7.05, 0],
    [12.9, -7.05, 0],
    [-5.6, -7.1, 0],
    [-11.6, -7.1, 0],
    [13.3, 4.4, Math.PI],
    [19.2, -5.6, Math.PI],
    [5.4, 4.55, Math.PI],
  ] as const) lamp(k, x, z, rot);

  // 나무와 덤불
  const trees: Array<[number, number, number]> = [
    [-11.4, 6.6, 1.15],
    [-9.9, 7.4, 0.9],
    [-5.9, 7.2, 1.0],
    [-2.6, 6.4, 1.2],
    [-0.4, 7.3, 0.95],
    [2.2, 6.5, 1.1],
    [4.0, 7.4, 0.85],
    [13.2, 6.6, 1.1],
    [15.3, 7.3, 0.95],
    [17.4, 6.5, 1.2],
    [19.0, 7.4, 0.9],
    [14.6, -6.1, 0.9],
    [16.3, -5.9, 1.05],
    [5.45, 6.6, 0.9],
  ];
  trees.forEach(([x, z, s], i) => tree(k, x, z, s, i));
  const bushes: Array<[number, number]> = [
    [-10.9, 5.5],
    [-3.6, 7.5],
    [0.9, 5.7],
    [3.3, 5.6],
    [14.3, 5.9],
    [16.4, 7.6],
    [18.3, 5.8],
    [15.5, -6.6],
    [17.4, -6.3],
    [-1.6, 5.4],
  ];
  bushes.forEach(([x, z], i) => bush(k, x, z, i));
  // 부지 밖 나무 (화면 가장자리를 채운다)
  const outside: Array<[number, number, number]> = [
    [-15.5, 3.5, 1.3],
    [-16.8, -2.2, 1.1],
    [-14.6, 9.6, 1.2],
    [-6.0, 10.8, 1.3],
    [1.5, 11.4, 1.1],
    [9.5, 10.6, 1.25],
    [16.5, 11.2, 1.1],
    [23.0, 5.5, 1.3],
    [24.2, -1.5, 1.1],
    [22.6, -13.0, 1.2],
    [12.0, -13.6, 1.0],
    [2.0, -13.2, 1.25],
    [-8.5, -13.8, 1.1],
    [-15.2, -13.0, 1.2],
    [23.8, 10.5, 1.0],
  ];
  outside.forEach(([x, z, s], i) => tree(k, x, z, s, i + 3));
}

/** 본관 벽 네 장. 벽마다 따로 조립해 카메라 쪽 벽을 숨길 수 있게 한다 */
function hallWalls(): Wall[] {
  const { minX, maxX, minZ, maxZ, wallH, wallT } = HALL;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const band = (k: Kit, along: 'x' | 'z', fixed: number, from: number, to: number) => {
    // 위쪽 유리 띠와 창살
    const len = to - from;
    const c = mid(from, to);
    if (along === 'x') k.box(C.glass, [len, 0.8, 0.06], [c, wallH - 1.15, fixed], { r: 0.02, mat: 'glass' });
    else k.box(C.glass, [0.06, 0.8, len], [fixed, wallH - 1.15, c], { r: 0.02, mat: 'glass' });
    const n = Math.round(len / 1.3);
    for (let i = 0; i <= n; i += 1) {
      const p = from + (len * i) / n;
      if (along === 'x') k.box(C.wall, [0.12, 0.84, wallT], [p, wallH - 1.17, fixed], { r: 0.03 });
      else k.box(C.wall, [wallT, 0.84, 0.12], [fixed, wallH - 1.17, p], { r: 0.03 });
    }
  };

  // 북쪽 (+Z): 아래 벽 + 유리 띠 + 위 보
  const north = new Kit();
  north.box(C.wall, [w + wallT, wallH - 1.2, wallT], [mid(minX, maxX), 0, maxZ], { r: 0.05, seg: 3 });
  north.box(C.wall, [w + wallT, 0.38, wallT], [mid(minX, maxX), wallH - 0.36, maxZ], { r: 0.05, seg: 3 });
  north.box(C.blue, [w + wallT + 0.04, 0.14, wallT + 0.04], [mid(minX, maxX), wallH, maxZ], { r: 0.05, mat: 'gloss' });
  north.box(C.wallShade, [w + wallT + 0.02, 0.3, wallT + 0.06], [mid(minX, maxX), 0, maxZ], { r: 0.04 });
  band(north, 'x', maxZ, minX + 0.2, maxX - 0.2);
  for (let x = minX; x <= maxX + 0.01; x += w / 6) north.box(C.trim, [0.26, wallH, 0.3], [x, 0, maxZ - 0.04], { r: 0.06, seg: 3 });

  // 서쪽 (-X)
  const west = new Kit();
  west.box(C.wall, [wallT, wallH - 1.2, d + wallT], [minX, 0, 0], { r: 0.05, seg: 3 });
  west.box(C.wall, [wallT, 0.38, d + wallT], [minX, wallH - 0.36, 0], { r: 0.05, seg: 3 });
  west.box(C.blue, [wallT + 0.04, 0.14, d + wallT + 0.04], [minX, wallH, 0], { r: 0.05, mat: 'gloss' });
  west.box(C.wallShade, [wallT + 0.06, 0.3, d + wallT + 0.02], [minX, 0, 0], { r: 0.04 });
  band(west, 'z', minX, minZ + 0.2, maxZ - 0.2);
  for (let z = minZ; z <= maxZ + 0.01; z += d / 4) west.box(C.trim, [0.3, wallH, 0.26], [minX + 0.04, 0, z], { r: 0.06, seg: 3 });

  // 남쪽 (-Z): 베일 배출구가 뚫려 있다
  const south = new Kit();
  const gapL = BALER.x - 0.75;
  const gapR = BALER.x + 0.75;
  south.box(C.wall, [gapL - minX, wallH, wallT], [mid(minX, gapL), 0, minZ], { r: 0.05, seg: 3 });
  south.box(C.wall, [maxX - gapR, wallH, wallT], [mid(gapR, maxX), 0, minZ], { r: 0.05, seg: 3 });
  south.box(C.wall, [gapR - gapL + 0.1, wallH - 1.7, wallT], [BALER.x, 1.7, minZ], { r: 0.05 });
  south.box(C.blue, [w + wallT + 0.04, 0.14, wallT + 0.04], [mid(minX, maxX), wallH, minZ], { r: 0.05, mat: 'gloss' });
  south.box(C.yellow, [gapR - gapL + 0.3, 0.12, wallT + 0.06], [BALER.x, 1.66, minZ], { r: 0.04 });

  // 동쪽 (+X): 섹터 문 네 개
  const east = new Kit();
  east.box(C.wall, [wallT, wallH - 2.45, d + wallT], [maxX, 2.45, 0], { r: 0.05, seg: 3 });
  east.box(C.blue, [wallT + 0.04, 0.14, d + wallT + 0.04], [maxX, wallH, 0], { r: 0.05, mat: 'gloss' });
  for (let i = 0; i <= 4; i += 1) east.box(C.wall, [wallT + 0.06, 2.5, 0.34], [maxX, 0, -3.4 + i * BAY.width], { r: 0.06, seg: 3 });
  east.box(C.wall, [wallT, 2.5, 0.5], [maxX, 0, minZ + 0.2], { r: 0.05 });
  east.box(C.wall, [wallT, 2.5, 0.5], [maxX, 0, maxZ - 0.2], { r: 0.05 });

  return [
    { group: north.build('wall-n'), nx: 0, nz: 1 },
    { group: west.build('wall-w'), nx: -1, nz: 0 },
    { group: south.build('wall-s'), nx: 0, nz: -1 },
    { group: east.build('wall-e'), nx: 1, nz: 0 },
  ];
}

export function buildWorld(): World {
  const k = new Kit();
  ground(k);
  markings(k);
  inbound(k);
  fence(k);
  hallInterior(k);
  yardProps(k);
  office(k);
  parking(k);
  utilities(k);
  return { base: k.build('world'), walls: hallWalls() };
}
