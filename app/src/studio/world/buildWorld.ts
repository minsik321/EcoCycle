import { TANK_IDS } from '@ecocycle/shared';
import type { Group } from 'three';
import { C, CAR_PAINTS } from '../theme';
import { Kit } from '../three/kit';
import type { Footprint } from '../three/kit';
import { APRON, BALE, BALER, BAY, BAY_Z, CONVEYOR, GATE, HALL, OFFICE, PARKING, ROAD, SCALE, SITE, YARD } from './layout';
import { bale, bush, car, cone, lamp, pallet, tree } from './props';

// 스튜디오 월드의 고정물. 전부 코드로 조립하고 재질별 메시 몇 개로 합친다.
// 본관 벽은 방향별로 따로 만들어, 카메라 쪽을 향한 벽은 숨긴다 (안이 들여다보이는 "인형의 집" 방식).
// 모양은 참고 화면(docs/reference/)을 따른다: 흰 벽 + 지붕선·모서리·문틀의 파랑 선. 색은 첫 스튜디오 시안처럼 진하게:
// 벽 위 덮개·컨베이어 틀·압축기·문형 구조물·경비실 지붕은 채도 높은 파랑, 모터·결속 타래·유압 탱크는 노랑.
// 구역은 밝기 단계로 나눈다: 도로(회청색, 흰 차선) < 마당 콘크리트(옅은 회색) < 건물 바닥(거의 흰색, 칠한 통로선), 가장자리의 옅은 녹지와 적당한 나무.

export interface Wall {
  group: Group;
  /** 벽이 바깥을 보는 방향 (x, z) */
  nx: number;
  nz: number;
}

export interface World {
  base: Group;
  walls: Wall[];
  /** 서 있는 고정물의 바닥 투영 (low 단계에서 바닥 그림자를 미리 굽는 데 쓴다) */
  footprints: Footprint[];
}

const mid = (a: number, b: number) => (a + b) / 2;

/** 가는 파랑 선 (지붕선·모서리·문틀). 참고 화면의 유일한 강조색 */
const EDGE = 0.065;
function edgeX(k: Kit, x0: number, x1: number, y: number, z: number): void {
  k.box(C.blue, [x1 - x0, EDGE, EDGE], [mid(x0, x1), y, z], { r: 0.018, mat: 'gloss' });
}
function edgeZ(k: Kit, z0: number, z1: number, y: number, x: number): void {
  k.box(C.blue, [EDGE, EDGE, z1 - z0], [x, y, mid(z0, z1)], { r: 0.018, mat: 'gloss' });
}
function edgeY(k: Kit, x: number, z: number, y0: number, y1: number): void {
  k.box(C.blue, [EDGE, y1 - y0, EDGE], [x, y0, z], { r: 0.018, mat: 'gloss' });
}

function ground(k: Kit): void {
  // 끝없이 이어지는 듯한 미색 바닥과 그 위의 부지 판
  k.cyl(C.floor, 170, 0.4, [4, -0.52, -1], { seg: 64 });
  k.box(C.pad, [SITE.maxX - SITE.minX + 1.6, 0.12, SITE.maxZ - SITE.minZ + 1.6], [mid(SITE.minX, SITE.maxX), -0.12, mid(SITE.minZ, SITE.maxZ)], { r: 0.08, seg: 3 });
  k.box(C.padEdge, [SITE.maxX - SITE.minX + 2.2, 0.1, SITE.maxZ - SITE.minZ + 2.2], [mid(SITE.minX, SITE.maxX), -0.2, mid(SITE.minZ, SITE.maxZ)], { r: 0.06 });

  // 도로: 부지를 가로지르고, 양 끝은 바닥색으로 옅어진다
  const roadW = ROAD.maxZ - ROAD.minZ;
  const roadZ = mid(ROAD.minZ, ROAD.maxZ);
  k.box(C.asphalt, [SITE.maxX - SITE.minX + 1.6, 0.03, roadW], [mid(SITE.minX, SITE.maxX), -0.012, roadZ], { r: 0 });
  // 도로색에서 바닥색으로 옅어지는 다섯 칸
  const fade = ['#a7b1be', '#b4bdc8', '#c2c8d2', '#cfd4dc', '#dce0e6'];
  fade.forEach((hex, i) => {
    k.box(hex, [4.02, 0.03, roadW], [SITE.maxX + 0.8 + 2 + i * 4, -0.012 - (i + 1) * 0.002, roadZ], { r: 0 });
    k.box(hex, [4.02, 0.03, roadW], [SITE.minX - 0.8 - 2 - i * 4, -0.012 - (i + 1) * 0.002, roadZ], { r: 0 });
    // 출하 통로도 서쪽으로 이어진다
    k.box(i < 2 ? C.concrete : hex, [4.02, 0.03, 1.5], [SITE.minX - 0.8 - 2 - i * 4, -0.014 - (i + 1) * 0.002, YARD.laneZ], { r: 0 });
  });
  // 차선: 가운데 흰 점선, 양쪽 가장자리의 흰 실선 (진입로가 끊는 곳은 비운다)
  for (let x = SITE.minX - 6; x < SITE.maxX + 8; x += 1.6) {
    if (x > SCALE.minX - 0.8 && x < SCALE.maxX + 0.4) continue;
    k.box(C.line, [0.8, 0.012, 0.08], [x, 0.018, roadZ], { r: 0 });
  }
  const roadX0 = SITE.minX - 0.8;
  const roadX1 = SITE.maxX + 0.8;
  k.box(C.line, [roadX1 - roadX0, 0.012, 0.07], [mid(roadX0, roadX1), 0.018, ROAD.minZ + 0.16], { r: 0 });
  for (const [a, b] of [[roadX0, YARD.minX + 0.2], [-0.2, APRON.laneX - 1.4], [APRON.exitX + 1.4, SCALE.minX - 0.9], [SCALE.maxX + 0.5, roadX1]] as const) {
    if (b > a) k.box(C.line, [b - a, 0.012, 0.07], [mid(a, b), 0.018, ROAD.maxZ - 0.16], { r: 0 });
  }

  // 가장자리 녹지 띠 (부드러운 연두색 판)
  const lawns: Array<[number, number, number, number]> = [
    [-12.3, 6.7, 4.8, 8.3],
    [-12.3, -3.6, -10.6, 6.7],
    [11.9, 5.3, 19.9, 8.3],
    [13.3, -7.0, 17.2, -5.15],
    [19.0, -5.0, 19.9, 5.3],
    [-12.3, -10.95, 19.9, -10.7],
  ];
  for (const [x0, z0, x1, z1] of lawns) {
    k.box(C.lawnEdge, [x1 - x0, 0.05, z1 - z0], [mid(x0, x1), -0.03, mid(z0, z1)], { r: 0.02 });
    k.box(C.lawn, [x1 - x0 - 0.08, 0.06, z1 - z0 - 0.08], [mid(x0, x1), -0.02, mid(z0, z1)], { r: 0.03, seg: 3 });
  }

  // 하역 마당, 출하 마당
  k.box(C.concrete, [APRON.maxX - APRON.minX, 0.04, APRON.maxZ - APRON.minZ], [mid(APRON.minX, APRON.maxX), -0.012, mid(APRON.minZ, APRON.maxZ)], { r: 0.015 });
  k.box(C.concrete, [YARD.maxX - YARD.minX + 0.8, 0.04, YARD.maxZ - YARD.minZ], [mid(YARD.minX - 0.8, YARD.maxX), -0.012, mid(YARD.minZ, YARD.maxZ)], { r: 0.015 });
  // 콘크리트 줄눈 (옅게: 넓은 마당이 한 장의 판처럼 보이지 않게)
  for (let x = APRON.minX + 2.1; x < APRON.maxX; x += 2.1) k.box(C.concreteDark, [0.03, 0.012, APRON.maxZ - APRON.minZ], [x, 0.012, mid(APRON.minZ, APRON.maxZ)], { r: 0 });
  for (let z = APRON.minZ + 2.4; z < APRON.maxZ; z += 2.4) k.box(C.concreteDark, [APRON.maxX - APRON.minX, 0.012, 0.03], [mid(APRON.minX, APRON.maxX), 0.012, z], { r: 0 });
  for (let x = YARD.minX + 2.0; x < YARD.maxX; x += 2.4) k.box(C.concreteDark, [0.03, 0.012, YARD.maxZ - YARD.minZ], [x, 0.012, mid(YARD.minZ, YARD.maxZ)], { r: 0 });
}

function markings(k: Kit): void {
  const y = 0.03;
  // 섹터 앞 후진 유도선(흰색)과 정지선(안전 노랑). 참고 화면의 도크 앞 노란 선처럼 가늘게
  for (let i = 0; i <= 4; i += 1) {
    const z = -3.4 + i * BAY.width;
    k.box(C.line, [3.0, 0.012, 0.06], [6.35, y, z], { r: 0 });
  }
  for (const id of TANK_IDS) {
    const z = mid(BAY_Z[id][0], BAY_Z[id][1]);
    k.box(C.yellow, [0.06, 0.012, 1.2], [7.95, y, z], { r: 0 });
  }
  // 진입 차로 (흰 점선 하나)
  for (let z = ROAD.maxZ + 0.3; z < 3.4; z += 0.9) k.box(C.line, [0.07, 0.012, 0.42], [APRON.laneX - 0.75, y, z], { r: 0 });

  // 출하 마당: 적치 칸(가는 노랑 테두리), 지게차 자리(가는 파랑 테두리)
  for (const x of YARD.slotXs) {
    k.box(C.yellow, [0.86, 0.012, 0.035], [x, y, YARD.slotZ + 0.56], { r: 0 });
    k.box(C.yellow, [0.86, 0.012, 0.035], [x, y, YARD.slotZ - 0.56], { r: 0 });
    k.box(C.yellow, [0.035, 0.012, 1.12], [x - 0.43, y, YARD.slotZ], { r: 0 });
    k.box(C.yellow, [0.035, 0.012, 1.12], [x + 0.43, y, YARD.slotZ], { r: 0 });
  }
  for (const dz of [-0.6, 0.6]) k.box(C.blue, [1.9, 0.014, 0.04], [YARD.home[0], y, YARD.home[1] + dz], { r: 0 });
  for (const dx of [-0.95, 0.95]) k.box(C.blue, [0.04, 0.014, 1.2], [YARD.home[0] + dx, y, YARD.home[1]], { r: 0 });

  // 계중대: 강판 상판과 노란 턱
  const sx = mid(SCALE.minX, SCALE.maxX);
  const sw = SCALE.maxX - SCALE.minX;
  k.box(C.steelLight, [sw, 0.07, 1.5], [sx, -0.02, SCALE.z], { r: 0.025, mat: 'metal' });
  for (let i = 0; i < 7; i += 1) k.box(C.steel, [0.035, 0.012, 1.36], [SCALE.minX + 0.3 + i * ((sw - 0.6) / 6), 0.05, SCALE.z], { r: 0, mat: 'metal' });
  k.box(C.yellow, [sw + 0.1, 0.07, 0.06], [sx, 0, SCALE.z - 0.8], { r: 0.02 });
  k.box(C.yellow, [sw + 0.1, 0.07, 0.06], [sx, 0, SCALE.z + 0.8], { r: 0.02 });
}

function inbound(k: Kit): void {
  // 번호판 인식 문형 구조물 (들어오는 차로 위): 흰 틀 + 가는 파랑 선
  const gx = SCALE.maxX + 0.75;
  k.box(C.wall, [0.14, 2.5, 0.14], [gx, 0, SCALE.z - 1.05], { r: 0.05 });
  k.box(C.wall, [0.14, 2.5, 0.14], [gx, 0, SCALE.z + 1.05], { r: 0.05 });
  k.box(C.blue, [0.2, 0.2, 2.44], [gx, 2.4, SCALE.z], { r: 0.07, seg: 3, mat: 'gloss' });
  edgeZ(k, SCALE.z - 1.22, SCALE.z + 1.22, 2.6, gx - 0.1);
  for (const dz of [-0.5, 0.5]) {
    k.box(C.wall, [0.3, 0.16, 0.18], [gx - 0.16, 2.2, SCALE.z + dz], { r: 0.05 });
    k.cyl('#9fd3ff', 0.04, 0.03, [gx - 0.32, 2.28, SCALE.z + dz], { axis: 'x', mat: 'glow', glow: 2 });
  }

  // 정문: 흰 기둥(위에 가는 파랑 띠), 경비실
  for (const z of [ROAD.minZ - 0.25, ROAD.maxZ + 0.25]) {
    k.box(C.wall, [0.46, 1.5, 0.46], [GATE.x, 0, z], { r: 0.1, seg: 3 });
    k.box(C.blue, [0.47, EDGE, 0.47], [GATE.x, 1.32, z], { r: 0.02, mat: 'gloss' });
  }
  k.box(C.wall, [0.3, 0.9, 0.3], [GATE.x, 0, mid(ROAD.minZ, ROAD.maxZ)], { r: 0.08 });
  k.at([GATE.houseX, 0, GATE.houseZ], 0, () => {
    k.box(C.concreteDark, [1.7, 0.08, 1.6], [0, 0, 0], { r: 0.04 });
    k.box(C.wall, [1.4, 1.5, 1.3], [0, 0.08, 0], { r: 0.12, seg: 3 });
    k.box(C.blue, [1.7, 0.14, 1.6], [0, 1.58, 0], { r: 0.07, seg: 3, mat: 'gloss' });
    edgeX(k, -0.85, 0.85, 1.6, -0.8);
    edgeZ(k, -0.8, 0.8, 1.6, 0.85);
    k.box(C.glass, [1.0, 0.6, 0.04], [0, 0.75, -0.655], { r: 0.02, mat: 'glass' });
    k.box(C.glass, [0.04, 0.6, 0.9], [0.705, 0.75, 0], { r: 0.02, mat: 'glass' });
  });
}

function fence(k: Kit): void {
  const post = (x: number, z: number) => k.cyl(C.steelLight, 0.03, 0.8, [x, 0, z], { seg: 8, mat: 'metal' });
  const railX = (x0: number, x1: number, z: number) => {
    for (const y of [0.4, 0.74]) k.box(C.steelLight, [x1 - x0, 0.03, 0.03], [mid(x0, x1), y, z], { r: 0, mat: 'metal' });
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 1.6))) post(x, z);
  };
  const railZ = (z0: number, z1: number, x: number) => {
    for (const y of [0.4, 0.74]) k.box(C.steelLight, [0.03, 0.03, z1 - z0], [x, y, mid(z0, z1)], { r: 0, mat: 'metal' });
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
  k.box(C.hallFloor, [w, 0.08, d], [mid(HALL.minX, HALL.maxX), -0.02, 0], { r: 0.02 });
  // 칠한 통로: 남쪽 벽을 따라 옅은 파랑 통로(흰 점선)와 노랑 가장자리선, 로봇 서쪽의 세로 통로
  const y = 0.062;
  k.box(C.bluePale, [9.4, 0.012, 0.72], [-4.6, y, -3.3], { r: 0 });
  k.box(C.yellow, [9.4, 0.012, 0.05], [-4.6, y + 0.002, -2.92], { r: 0 });
  for (let x = -9.0; x < -0.2; x += 0.9) k.box(C.white, [0.45, 0.012, 0.06], [x, y + 0.003, -3.3], { r: 0 });
  k.box(C.bluePale, [0.72, 0.012, 6.2], [-1.9, y, 0.5], { r: 0 });
  k.box(C.yellow, [0.05, 0.012, 6.2], [-1.52, y + 0.002, 0.5], { r: 0 });
  // 로봇 둘레 안전선 (노랑 고리), 작업 구역의 노랑 빗금
  k.cyl(C.yellow, 1.14, 0.012, [0, y, 0], { seg: 48 });
  k.cyl(C.hallFloor, 1.06, 0.012, [0, y + 0.004, 0], { seg: 48 });
  for (let i = 0; i < 6; i += 1) k.box(C.yellow, [0.06, 0.012, 0.8], [-6.2 + i * 0.28, y, 2.9], { r: 0, rot: [0, 0.6, 0] });
  // 압축기 둘레 노랑 테두리
  for (const dz of [-1, 1]) k.box(C.yellow, [2.4, 0.012, 0.05], [BALER.x, y, BALER.z + dz * 1.75], { r: 0 });
  for (const dx of [-1, 1]) k.box(C.yellow, [0.05, 0.012, 3.5], [BALER.x + dx * 1.2, y, BALER.z], { r: 0 });

  // 섹터 칸: 로봇 쪽 낮은 벽, 칸막이, 바닥
  // 섹터 칸 바닥 (등급 색은 Dynamic의 Piles가 칸마다 얹는다)
  k.box(C.concreteDark, [BAY.maxX - BAY.minX, 0.03, BAY.width * 4], [mid(BAY.minX, BAY.maxX), 0.05, 0], { r: 0 });
  k.box(C.wallShade, [0.2, BAY.backH, BAY.width * 4 + 0.2], [BAY.minX - 0.1, 0.06, 0], { r: 0.07, seg: 3 });
  // 칸막이: 둥근 흰 벽, 앞 끝에만 가는 파랑 선
  for (let i = 0; i <= 4; i += 1) {
    const z = -3.4 + i * BAY.width;
    k.box(C.wall, [BAY.maxX - BAY.minX, BAY.dividerH, 0.2], [mid(BAY.minX, BAY.maxX), 0.06, z], { r: 0.08, seg: 3 });
    edgeY(k, BAY.maxX + 0.005, z, 0.06, BAY.dividerH + 0.06);
  }

  // 컨베이어 틀: 다리, 옆 레일(흰색 + 가는 파랑 선), 끝 모터
  const cx = mid(CONVEYOR.startX, CONVEYOR.endX);
  const len = CONVEYOR.startX - CONVEYOR.endX;
  const top = CONVEYOR.topY;
  for (const dz of [-1, 1]) {
    k.box(C.blue, [len + 0.3, 0.2, 0.07], [cx, top - 0.14, CONVEYOR.z + dz * (CONVEYOR.width / 2 + 0.035)], { r: 0.03, mat: 'gloss' });
    edgeX(k, CONVEYOR.endX - 0.15, CONVEYOR.startX + 0.15, top + 0.04, CONVEYOR.z + dz * (CONVEYOR.width / 2 + 0.05));
    for (let x = CONVEYOR.startX - 0.3; x > CONVEYOR.endX + 0.2; x -= 0.83) k.cyl(C.steelLight, 0.022, 0.24, [x, top + 0.02, CONVEYOR.z + dz * (CONVEYOR.width / 2 + 0.035)], { seg: 8, mat: 'metal' });
  }
  for (let x = CONVEYOR.startX - 0.25; x > CONVEYOR.endX + 0.5; x -= 1.18) {
    for (const dz of [-1, 1]) k.box(C.steelLight, [0.09, top - 0.2, 0.09], [x, 0.05, CONVEYOR.z + dz * (CONVEYOR.width / 2 - 0.02)], { r: 0.03, mat: 'metal' });
    k.box(C.steelLight, [0.07, 0.07, CONVEYOR.width], [x, 0.42, CONVEYOR.z], { r: 0.02, mat: 'metal' });
    k.box(C.concreteDark, [0.3, 0.05, CONVEYOR.width + 0.3], [x, 0.05, CONVEYOR.z], { r: 0.02 });
  }
  k.cyl(C.steel, 0.1, CONVEYOR.width + 0.1, [CONVEYOR.startX + 0.05, top - 0.1, CONVEYOR.z], { axis: 'z', mat: 'metal' });
  k.cyl(C.steel, 0.1, CONVEYOR.width + 0.1, [CONVEYOR.endX - 0.05, top - 0.1, CONVEYOR.z], { axis: 'z', mat: 'metal' });
  k.box(C.yellow, [0.42, 0.34, 0.3], [CONVEYOR.endX + 0.5, top - 0.5, CONVEYOR.z + CONVEYOR.width / 2 + 0.2], { r: 0.1, mat: 'gloss', seg: 3 });
  k.cyl(C.steel, 0.11, 0.16, [CONVEYOR.endX + 0.5, top - 0.33, CONVEYOR.z + CONVEYOR.width / 2 + 0.42], { axis: 'z', mat: 'metal' });

  baler(k);

  // 조작반, 소품 (크라프트 팔레트·상자만)
  k.at([-5.4, 0.06, -3.55], 0, () => {
    k.box(C.wall, [0.8, 1.0, 0.36], [0, 0, 0], { r: 0.09, seg: 3 });
    edgeX(k, -0.4, 0.4, 1.0, 0.18);
    k.box(C.dark, [0.5, 0.3, 0.03], [0, 0.55, 0.19], { r: 0.02 });
    k.box('#9fd3ff', [0.42, 0.04, 0.02], [0, 0.72, 0.205], { r: 0, mat: 'glow', glow: 1.4 });
  });
  pallet(k, -2.6, 2.9, 0.2);
  pallet(k, -2.6, 2.9, 0.2, 0.13);
  pallet(k, -3.9, 3.0, -0.1);
  k.box(C.kraftLight, [0.6, 0.45, 0.5], [-3.9, 0.2, 3.0], { r: 0.06 });
  k.box(C.kraft, [0.5, 0.4, 0.5], [-4.7, 0.06, 3.2], { r: 0.06 });
  // 로봇 제어반
  k.box(C.wall, [0.5, 1.25, 0.7], [-1.3, 0.06, 1.75], { r: 0.1, seg: 3 });
  edgeZ(k, 1.4, 2.1, 1.31, -1.05);
  // 안전 울타리 (로봇 서쪽, 안전 노랑)
  for (let i = 0; i < 5; i += 1) {
    const z = 0.5 + i * 0.55;
    k.cyl(C.yellow, 0.026, 0.9, [-2.1, 0.06, z], { seg: 8 });
  }
  k.box(C.yellow, [0.035, 0.035, 2.3], [-2.1, 0.92, 1.6], { r: 0.015 });
  k.box(C.yellow, [0.035, 0.035, 2.3], [-2.1, 0.55, 1.6], { r: 0.015 });
}

function baler(k: Kit): void {
  const { x, minZ, maxZ, halfX, height } = BALER;
  const t = 0.13;
  const y0 = 0.06;
  // 받침과 압축실 (위가 열린 상자: 바닥 + 벽 네 장)
  k.box(C.concreteDark, [halfX * 2 + 0.5, 0.08, maxZ - minZ + 3.2], [x, 0.04, mid(minZ, maxZ) + 0.5], { r: 0.03 });
  k.box(C.dark, [halfX * 2, 0.1, maxZ - minZ], [x, y0 + 0.04, mid(minZ, maxZ)], { r: 0.02 });
  k.box(C.wall, [t, height, maxZ - minZ], [x - halfX + t / 2, y0, mid(minZ, maxZ)], { r: 0.06, mat: 'gloss', seg: 3 });
  k.box(C.wall, [t, height, maxZ - minZ], [x + halfX - t / 2, y0, mid(minZ, maxZ)], { r: 0.06, mat: 'gloss', seg: 3 });
  k.box(C.wall, [halfX * 2, height, t], [x, y0, maxZ - t / 2], { r: 0.06, mat: 'gloss', seg: 3 });
  // 배출구 쪽 벽은 위쪽만 (아래로 베일이 나간다)
  k.box(C.wall, [halfX * 2, height - 0.72, t], [x, y0 + 0.72, minZ + t / 2], { r: 0.05, mat: 'gloss' });
  // 흰 보강 띠 + 위 가장자리의 가는 파랑 선
  for (const dz of [0.25, 0.75]) {
    const z = minZ + (maxZ - minZ) * dz;
    k.box(C.blue, [halfX * 2 + 0.1, height + 0.06, 0.12], [x, y0, z], { r: 0.05, mat: 'gloss' });
  }
  edgeZ(k, minZ, maxZ, y0 + height, x - halfX);
  edgeZ(k, minZ, maxZ, y0 + height, x + halfX);
  // 투입구 깔때기
  const rim = height + y0;
  const flare = 0.34;
  k.box(C.steelLight, [0.05, 0.5, maxZ - minZ - 0.1], [x - halfX - 0.08, rim - 0.04, mid(minZ, maxZ)], { r: 0.02, rot: [0, 0, flare], mat: 'metal' });
  k.box(C.steelLight, [0.05, 0.5, maxZ - minZ - 0.1], [x + halfX + 0.08, rim - 0.04, mid(minZ, maxZ)], { r: 0.02, rot: [0, 0, -flare], mat: 'metal' });
  k.box(C.steelLight, [halfX * 2 + 0.1, 0.5, 0.05], [x, rim - 0.04, minZ - 0.08], { r: 0.02, rot: [flare, 0, 0], mat: 'metal' });
  k.box(C.steelLight, [halfX * 2 + 0.1, 0.5, 0.05], [x, rim - 0.04, maxZ + 0.08], { r: 0.02, rot: [-flare, 0, 0], mat: 'metal' });

  // 유압 장치 (+Z 쪽): 흰 실린더 집, 탱크, 배관
  const hz = maxZ + 1.35;
  k.box(C.blue, [1.3, 0.85, 1.3], [x, y0, hz], { r: 0.14, mat: 'gloss', seg: 3 });
  edgeX(k, x - 0.62, x + 0.62, y0 + 0.82, hz - 0.65);
  edgeZ(k, hz - 0.62, hz + 0.62, y0 + 0.82, x + 0.65);
  k.cyl(C.wall, 0.3, 0.9, [x - 0.2, y0 + 1.25, hz + 0.1], { axis: 'x', mat: 'gloss' });
  k.cyl(C.steelLight, 0.05, 0.5, [x + 0.42, y0 + 0.95, hz - 0.3], { mat: 'metal', seg: 10 });
  k.cyl(C.steelLight, 0.05, 0.9, [x + 0.42, y0 + 1.42, hz - 0.72], { axis: 'z', mat: 'metal', seg: 10 });
  k.cyl(C.yellow, 0.2, 0.75, [x, y0 + 0.5, maxZ + 0.42], { axis: 'z', mat: 'gloss' });

  // 결속부: 흰 문형 틀과 끈 타래
  const sz = mid(BALER.strapZ, minZ);
  for (const dx of [-1, 1]) k.box(C.blue, [0.14, 1.45, 0.5], [x + dx * (halfX + 0.02), y0, sz], { r: 0.06, mat: 'gloss', seg: 3 });
  k.box(C.blue, [halfX * 2 + 0.18, 0.16, 0.5], [x, y0 + 1.4, sz], { r: 0.06, mat: 'gloss', seg: 3 });
  edgeX(k, x - halfX - 0.09, x + halfX + 0.09, y0 + 1.56, sz - 0.25);
  for (const dx of [-0.42, 0, 0.42]) {
    k.cyl(C.yellow, 0.15, 0.1, [x + dx, y0 + 1.72, sz], { axis: 'x', mat: 'gloss' });
    k.cyl(C.steel, 0.05, 0.14, [x + dx, y0 + 1.72, sz], { axis: 'x' });
  }
  k.box(C.steel, [1.5, 0.05, 0.05], [x, y0 + 1.72, sz], { r: 0.02, mat: 'metal' });

  // 배출 롤러대: 결속부에서 남쪽 벽을 지나 출하 마당까지
  const z0 = BALER.strapZ + 0.1;
  const z1 = BALER.chuteEndZ;
  for (const dx of [-1, 1]) {
    k.box(C.blue, [0.08, 0.16, z0 - z1], [x + dx * (BALE.w / 2 + 0.14), BALER.chuteY - 0.15, mid(z0, z1)], { r: 0.03, mat: 'gloss' });
    for (let z = z0 - 0.2; z > z1; z -= 0.95) k.box(C.steelLight, [0.08, BALER.chuteY - 0.15, 0.08], [x + dx * (BALE.w / 2 + 0.14), 0, z], { r: 0.02, mat: 'metal' });
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
  pallet(k, 2.9, -4.7, 0);
  pallet(k, 2.9, -4.7, 0, 0.13);
  pallet(k, 3.75, -4.75, 0.1);
  cone(k, -8.25, -5.75);
  cone(k, 3.2, -6.0);
  // 지게차 충전기
  k.box(C.wall, [0.34, 0.95, 0.26], [3.4, 0.02, -5.7], { r: 0.08, seg: 3 });
  edgeX(k, 3.23, 3.57, 0.94, -5.83);
  k.box('#8fe6b0', [0.14, 0.06, 0.02], [3.4, 0.72, -5.83], { r: 0, mat: 'glow', glow: 1.5 });
}

/** 지붕 위 실외기: 둥근 흰 상자 + 회색 팬 두 개 */
function rooftopFan(k: Kit, x: number, y: number, z: number): void {
  k.box(C.wall, [1.1, 0.32, 0.6], [x, y, z], { r: 0.09, seg: 3 });
  for (const dx of [-0.26, 0.26]) {
    k.cyl(C.steelLight, 0.2, 0.03, [x + dx, y + 0.32, z], { seg: 24 });
    k.cyl(C.steel, 0.05, 0.035, [x + dx, y + 0.33, z], { seg: 12 });
  }
}

function office(k: Kit): void {
  const { minX, maxX, minZ, maxZ, height } = OFFICE;
  const cx = mid(minX, maxX);
  const cz = mid(minZ, maxZ);
  const w = maxX - minX;
  const d = maxZ - minZ;
  k.box(C.concreteDark, [w + 0.5, 0.08, d + 0.5], [cx, 0, cz], { r: 0.03 });
  k.box(C.wall, [w, height, d], [cx, 0.08, cz], { r: 0.14, seg: 4 });
  k.box(C.roof, [w + 0.24, 0.16, d + 0.24], [cx, height + 0.04, cz], { r: 0.07, seg: 3 });
  // 지붕선과 모서리의 가는 파랑 선
  edgeX(k, minX - 0.12, maxX + 0.12, height + 0.17, minZ - 0.12);
  edgeZ(k, minZ - 0.12, maxZ + 0.12, height + 0.17, maxX + 0.12);
  edgeY(k, maxX + 0.01, minZ - 0.01, 0.08, height + 0.1);
  // 창 (남쪽 면)
  for (let i = 0; i < 6; i += 1) {
    const x = minX + 0.55 + i * ((w - 1.1) / 5);
    k.box(C.glass, [0.56, 0.52, 0.05], [x, 1.42, minZ - 0.01], { r: 0.03, mat: 'glass' });
    if (i !== 2) k.box(C.glass, [0.56, 0.52, 0.05], [x, 0.4, minZ - 0.01], { r: 0.03, mat: 'glass' });
  }
  for (let i = 0; i < 2; i += 1) k.box(C.glass, [0.05, 0.52, 0.6], [maxX + 0.01, 1.42, minZ + 0.6 + i * 1.0], { r: 0.03, mat: 'glass' });
  // 현관
  const dx = minX + 0.55 + 2 * ((w - 1.1) / 5);
  k.box(C.glass, [0.6, 0.95, 0.06], [dx, 0.08, minZ - 0.02], { r: 0.03, mat: 'glass' });
  k.box(C.blue, [1.1, 0.08, 0.6], [dx, 1.08, minZ - 0.3], { r: 0.035, mat: 'gloss' });
  edgeX(k, dx - 0.55, dx + 0.55, 1.13, minZ - 0.6);
  // 옥상 실외기 (흰 상자 + 회색 팬)
  for (let i = 0; i < 3; i += 1) rooftopFan(k, minX + 1.0 + i * 1.5, height + 0.2, cz);
  // 사무동 앞 보도
  k.box(C.hallFloor, [w + 8.5, 0.03, 0.62], [cx + 2.6, 0, 5.05], { r: 0.012 });
  k.box(C.hallFloor, [0.62, 0.03, 10.2], [13.75, 0, 0.2], { r: 0.012 });
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

// 주차 차량: 흰색과 차분한 색 몇 가지 (theme의 CAR_PAINTS). 칸을 다 채우지 않는다

/** 주차된 차의 자리와 색 (모델 파일을 쓰든 코드 모형을 쓰든 같은 자리) */
export const PARKED: ParkedCar[] = (
  [
    [0, 0, 1],
    [0, 1, 0],
    [0, 3, 2],
    [0, 4, 4],
    [1, 1, 3],
    [1, 2, 0],
    [1, 4, 5],
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
    k.cyl(C.blue, 0.712, EDGE, [x, 0.12 + h * 0.62, 5.75], { seg: 28, mat: 'gloss' });
    k.cyl(C.wall, [0.12, 0.7], 0.42, [x, 0.12 + h, 5.75], { seg: 28 });
    k.cyl(C.steelLight, 0.03, h, [x + 0.74, 0.12, 5.75], { seg: 8, mat: 'metal' });
  }
  k.box(C.wall, [1.3, 1.5, 1.1], [-4.6, 0.5, 5.6], { r: 0.12, seg: 3 });
  for (const dx of [-0.5, 0.5]) for (const dz of [-0.4, 0.4]) k.cyl(C.steelLight, 0.045, 0.5, [-4.6 + dx, 0, 5.6 + dz], { seg: 8, mat: 'metal' });
  k.cyl(C.steelLight, [0.1, 0.5], 0.5, [-4.6, 0.05, 5.6], { mat: 'metal', seg: 4 });
  k.cyl(C.steelLight, 0.16, 1.7, [-4.6, 1.75, 4.85], { axis: 'z', mat: 'metal' });

  // 가로등 (몇 개만)
  for (const [x, z, rot] of [
    [4.95, -7.05, 0],
    [12.9, -7.05, 0],
    [-5.6, -7.1, 0],
  ] as const) lamp(k, x, z, rot);

  // 녹지 띠의 나무와 덤불 (숲도 맨땅도 아니게: 띠마다 몇 그루, 크기는 첫 스튜디오 시안처럼 풍성하게)
  const trees: Array<[number, number, number]> = [
    [-11.4, 7.5, 1.1],
    [-8.2, 7.6, 1],
    [-4.6, 7.4, 1.1],
    [-1.2, 7.6, 0.9],
    [2.4, 7.4, 1.1],
    [-11.5, -1.8, 1],
    [-11.4, 2.6, 0.9],
    [12.8, 6.6, 1],
    [15.6, 7.2, 0.9],
    [18.6, 6.5, 1.1],
    [14.2, -6.1, 0.9],
    [16.5, -6.2, 1],
    [19.45, -2.5, 0.8],
    [19.45, 2.8, 0.9],
  ];
  trees.forEach(([x, z, s], i) => tree(k, x, z, s, i));
  const bushes: Array<[number, number]> = [
    [-9.9, 7.0],
    [-6.4, 7.2],
    [0.6, 7.1],
    [4.0, 7.3],
    [-11.2, 0.4],
    [14.0, 5.9],
    [17.3, 6.0],
    [15.3, -5.6],
  ];
  bushes.forEach(([x, z], i) => bush(k, x, z, i));
}

/** 본관 벽 네 장. 벽마다 따로 조립해 카메라 쪽 벽을 숨길 수 있게 한다 */
function hallWalls(footprints: Footprint[]): Wall[] {
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

  // 북쪽 (+Z): 아래 벽 + 유리 띠 + 위 보, 지붕선에 가는 파랑 선
  const north = new Kit();
  north.footprints = footprints;
  north.box(C.wall, [w + wallT, wallH - 1.2, wallT], [mid(minX, maxX), 0, maxZ], { r: 0.05, seg: 3 });
  north.box(C.wall, [w + wallT, 0.38, wallT], [mid(minX, maxX), wallH - 0.36, maxZ], { r: 0.05, seg: 3 });
  north.box(C.blue, [w + wallT + 0.04, 0.1, wallT + 0.04], [mid(minX, maxX), wallH, maxZ], { r: 0.04, mat: 'gloss' });
  edgeX(north, minX - 0.12, maxX + 0.12, wallH + 0.1, maxZ - 0.12);
  north.box(C.wallShade, [w + wallT + 0.02, 0.3, wallT + 0.06], [mid(minX, maxX), 0, maxZ], { r: 0.04 });
  band(north, 'x', maxZ, minX + 0.2, maxX - 0.2);
  for (let x = minX; x <= maxX + 0.01; x += w / 6) north.box(C.wall, [0.26, wallH, 0.3], [x, 0, maxZ - 0.04], { r: 0.07, seg: 3 });

  // 서쪽 (-X)
  const west = new Kit();
  west.footprints = footprints;
  west.box(C.wall, [wallT, wallH - 1.2, d + wallT], [minX, 0, 0], { r: 0.05, seg: 3 });
  west.box(C.wall, [wallT, 0.38, d + wallT], [minX, wallH - 0.36, 0], { r: 0.05, seg: 3 });
  west.box(C.blue, [wallT + 0.04, 0.1, d + wallT + 0.04], [minX, wallH, 0], { r: 0.04, mat: 'gloss' });
  edgeZ(west, minZ - 0.12, maxZ + 0.12, wallH + 0.1, minX + 0.12);
  edgeY(west, minX - 0.12, maxZ + 0.12, 0, wallH + 0.1);
  west.box(C.wallShade, [wallT + 0.06, 0.3, d + wallT + 0.02], [minX, 0, 0], { r: 0.04 });
  band(west, 'z', minX, minZ + 0.2, maxZ - 0.2);
  for (let z = minZ; z <= maxZ + 0.01; z += d / 4) west.box(C.wall, [0.3, wallH, 0.26], [minX + 0.04, 0, z], { r: 0.07, seg: 3 });

  // 남쪽 (-Z): 베일 배출구가 뚫려 있다
  const south = new Kit();
  south.footprints = footprints;
  const gapL = BALER.x - 0.75;
  const gapR = BALER.x + 0.75;
  south.box(C.wall, [gapL - minX, wallH, wallT], [mid(minX, gapL), 0, minZ], { r: 0.05, seg: 3 });
  south.box(C.wall, [maxX - gapR, wallH, wallT], [mid(gapR, maxX), 0, minZ], { r: 0.05, seg: 3 });
  south.box(C.wall, [gapR - gapL + 0.1, wallH - 1.7, wallT], [BALER.x, 1.7, minZ], { r: 0.05 });
  south.box(C.blue, [w + wallT + 0.04, 0.1, wallT + 0.04], [mid(minX, maxX), wallH, minZ], { r: 0.04, mat: 'gloss' });
  edgeX(south, minX - 0.12, maxX + 0.12, wallH + 0.1, minZ - 0.12);
  // 베일 배출구의 파랑 문틀
  edgeY(south, gapL, minZ - 0.13, 0, 1.7);
  edgeY(south, gapR, minZ - 0.13, 0, 1.7);
  edgeX(south, gapL, gapR, 1.68, minZ - 0.13);

  // 동쪽 (+X): 섹터 입구 네 개, 입구마다 파랑 문틀 (참고 화면의 도크 문처럼)
  const east = new Kit();
  east.footprints = footprints;
  east.box(C.wall, [wallT, wallH - 2.45, d + wallT], [maxX, 2.45, 0], { r: 0.05, seg: 3 });
  east.box(C.blue, [wallT + 0.04, 0.1, d + wallT + 0.04], [maxX, wallH, 0], { r: 0.04, mat: 'gloss' });
  edgeZ(east, minZ - 0.12, maxZ + 0.12, wallH + 0.1, maxX + 0.12);
  edgeY(east, maxX + 0.12, minZ - 0.12, 0, wallH + 0.1);
  for (let i = 0; i <= 4; i += 1) east.box(C.wall, [wallT + 0.06, 2.5, 0.34], [maxX, 0, -3.4 + i * BAY.width], { r: 0.08, seg: 3 });
  east.box(C.wall, [wallT, 2.5, 0.5], [maxX, 0, minZ + 0.2], { r: 0.05 });
  east.box(C.wall, [wallT, 2.5, 0.5], [maxX, 0, maxZ - 0.2], { r: 0.05 });
  for (let i = 0; i < 4; i += 1) {
    const z0 = -3.4 + i * BAY.width + 0.2;
    const z1 = z0 + BAY.width - 0.4;
    edgeY(east, maxX + 0.15, z0, 0, 2.42);
    edgeY(east, maxX + 0.15, z1, 0, 2.42);
    edgeZ(east, z0, z1, 2.4, maxX + 0.15);
  }

  return [
    { group: north.build('wall-n'), nx: 0, nz: 1 },
    { group: west.build('wall-w'), nx: -1, nz: 0 },
    { group: south.build('wall-s'), nx: 0, nz: -1 },
    { group: east.build('wall-e'), nx: 1, nz: 0 },
  ];
}

export function buildWorld(): World {
  const footprints: Footprint[] = [];
  const k = new Kit();
  k.footprints = footprints;
  ground(k);
  markings(k);
  inbound(k);
  fence(k);
  hallInterior(k);
  yardProps(k);
  office(k);
  parking(k);
  utilities(k);
  // 주차 차량 (모델 파일이든 코드 모형이든 같은 자리)
  for (const c of PARKED) {
    const along = Math.abs(Math.cos(c.rotY)) > 0.5;
    const [hx, hz] = along ? [0.8, 0.4] : [0.4, 0.8];
    footprints.push({ x0: c.x - hx, x1: c.x + hx, z0: c.z - hz, z1: c.z + hz, y0: 0, y1: 0.7 });
  }
  return { base: k.build('world'), walls: hallWalls(footprints), footprints };
}
