import { TANK_IDS } from '@ecocycle/shared';
import type { Group } from 'three';
import { C, CAR_PAINTS } from '../theme';
import { Kit } from '../three/kit';
import type { Footprint } from '../three/kit';
import { YARD_FLOW } from '../../config/yard';
import type { P2 } from '../sim/paths';
import {
  BALE,
  BALER,
  BALER_HOUSE,
  BALE_AREAS,
  BALE_AREA_PX,
  FOREST,
  GATE,
  OFFICE,
  PHOTO,
  PILES,
  RAIL,
  RAIL_FRAME,
  RAIL_LEN,
  RAIL_SLOPE,
  ROAD,
  SCALE,
  SITE_CENTER,
  SITE_ROT_Y,
  SITE_SCALE,
  TRAILER,
  YARD,
  YARD_FRAME,
  railPx,
  sitePx,
} from './layout';
import { car, lamp, pallet } from './props';

// 스튜디오 월드의 고정물. 전부 코드로 조립하고 재질별 메시 몇 개로 합친다. 배치는 모두 위성사진 좌표를 world/layout의 sitePx로 옮긴 값이다.
// 압축기 건물 본동의 벽은 방향별로 따로 만들어 카메라 쪽 벽을 숨기고(안이 들여다보이는 "인형의 집" 방식), 파란 지붕은 가까이 오면 걷는다.
// 모양은 참고 화면(docs/reference/)을 따른다: 흰 벽 + 지붕선·모서리·문틀의 파랑 선, 컨베이어 틀·압축기는 채도 높은 파랑, 모터·결속 타래는 노랑.
// 주변은 북서쪽 숲과 동쪽 도로만 둔다 (도로 옆 주차 차량·이웃 건물은 넣지 않는다). 부지 안 사무실 동쪽 곁에 직원 차 두 대만 둔다(사진에 있는 자리).

export interface Wall {
  group: Group;
  /** 벽이 바깥을 보는 방향 (x, z) */
  nx: number;
  nz: number;
}

export interface World {
  base: Group;
  /** 압축기 건물 본동의 벽 네 장 (카메라 쪽은 숨긴다) */
  walls: Wall[];
  /** 본동의 파란 지붕 (가까이 오면 숨긴다) */
  roof: Group;
  /** 본동 가운데 (벽·지붕을 숨길 때 카메라와 견준다) */
  houseCenter: P2;
  /** 서 있는 고정물의 바닥 투영 (low 단계에서 바닥 그림자를 미리 굽는 데 쓴다) */
  footprints: Footprint[];
}

const mid = (a: number, b: number) => (a + b) / 2;
const S = SITE_SCALE;

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

/** 바닥 위 두 점을 잇는 가는 상자 (칠한 선·띠) */
function seg(k: Kit, hex: string, a: P2, b: P2, width: number, y: number, h = 0.012): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-3) return;
  const heading = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  k.box(hex, [len, h, width], [mid(a[0], b[0]), y, mid(a[1], b[1])], { r: 0, rot: [0, heading, 0] });
}

/** 꺾은선을 폭 width의 띠 다각형으로 */
function strip(line: readonly P2[], width: number): P2[] {
  const left: P2[] = [];
  const right: P2[] = [];
  for (let i = 0; i < line.length; i += 1) {
    const a = line[Math.max(0, i - 1)]!;
    const b = line[Math.min(line.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    left.push([line[i]![0] + nx * (width / 2), line[i]![1] + nz * (width / 2)]);
    right.push([line[i]![0] - nx * (width / 2), line[i]![1] - nz * (width / 2)]);
  }
  return [...left, ...right.reverse()];
}

/** 점이 다각형 안에 있는가 */
export function inside(p: P2, poly: readonly P2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

/** 점과 다각형 테두리의 거리 */
export function edgeDistance(p: P2, poly: readonly P2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[j]!;
    const b = poly[i]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t));
  }
  return best;
}

/** 같은 씨앗이면 같은 값을 내는 난수 */
function random(seed0: number): () => number {
  let seed = seed0;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// ── 바닥: 부지 판, 숲 바닥, 도로, 적치 구역 ───────────────────────────

const HOUSE_POLYS: P2[][] = [BALER_HOUSE.main, BALER_HOUSE.annex].map((h) => [railPx(h.u0, h.w0), railPx(h.u0, h.w1), railPx(h.u1, h.w1), railPx(h.u1, h.w0)]);

function ground(k: Kit): void {
  // 끝없이 이어지는 듯한 미색 바닥과 그 위의 부지 판(사진 테두리, 마당 콘크리트)
  k.cyl(C.floor, 190, 0.4, [SITE_CENTER[0], -0.52, SITE_CENTER[1]], { seg: 64 });
  const w = PHOTO.width * S;
  const d = PHOTO.height * S;
  k.box(C.padEdge, [w + 0.6, 0.1, d + 0.6], [SITE_CENTER[0], -0.2, SITE_CENTER[1]], { r: 0.06, rot: [0, SITE_ROT_Y, 0] });
  k.box(C.pad, [w, 0.12, d], [SITE_CENTER[0], -0.12, SITE_CENTER[1]], { r: 0.08, seg: 3, rot: [0, SITE_ROT_Y, 0] });

  // 숲 바닥: 짙은 녹지 (가장자리는 한 단 옅게)
  k.flat(C.lawnEdge, FOREST, -0.03, 0.05);
  k.flat(C.forestFloor, FOREST.map((p) => p), -0.02, 0.06);

  // 도로: 두 차로 아스팔트, 양쪽 흰 실선, 가운데 흰 점선
  k.flat(C.asphalt, strip(ROAD.line, ROAD.width), -0.015, 0.03);
  const edges = [strip(ROAD.line, ROAD.width - 0.3)];
  for (const poly of edges) {
    const half = poly.length / 2;
    for (let i = 0; i + 1 < half; i += 1) seg(k, C.line, poly[i]!, poly[i + 1]!, 0.07, 0.018);
    for (let i = half; i + 1 < poly.length; i += 1) seg(k, C.line, poly[i]!, poly[i + 1]!, 0.07, 0.018);
  }
  for (let i = 0; i + 1 < ROAD.line.length; i += 1) {
    const a = ROAD.line[i]!;
    const b = ROAD.line[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0.4; t + 0.8 < len; t += 1.6) {
      const u0 = t / len;
      const u1 = (t + 0.8) / len;
      seg(k, C.line, [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0], [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1], 0.08, 0.018);
    }
  }

  // 베일 적치 구역 두 곳: 한 단 어두운 바닥 + 노랑 테두리(사진의 노랑 표시)
  for (const poly of [BALE_AREAS.nw, BALE_AREAS.se]) {
    k.flat(C.concreteDark, poly, -0.01, 0.04);
    for (let i = 0; i < poly.length; i += 1) seg(k, C.yellow, poly[i]!, poly[(i + 1) % poly.length]!, 0.12, 0.031);
  }
}

// ── 숲 ────────────────────────────────────────────────────────────────

/** 숲 나무: 줄기 + 둥근 수관 둘 (넓은 숲이라 조각 수를 줄였다) */
function forestTree(k: Kit, x: number, z: number, s: number, v: number): void {
  const tones = [C.green, C.greenDeep, C.greenLight, C.forest];
  const a = tones[v % tones.length]!;
  const b = tones[(v + 1) % tones.length]!;
  k.at(
    [x, 0, z],
    v * 1.7,
    () => {
      k.cyl(C.trunk, [0.08, 0.11], 0.7, [0, 0, 0], { seg: 6 });
      k.ball(a, 0.78, [0, 1.25, 0], { scale: [1, 0.9, 1], seg: 10 });
      k.ball(b, 0.52, [0.36, 1.72, 0.14], { seg: 9 });
    },
    s,
  );
}

function forest(k: Kit): void {
  const rnd = random(4021);
  const avoid = [BALE_AREAS.nw, ...HOUSE_POLYS];
  const step = 1.75;
  let n = 0;
  // 숲 다각형을 감싸는 상자에서 흔든 격자로 심는다. 적치 구역·건물과는 띄운다
  const xs = FOREST.map((p) => p[0]);
  const zs = FOREST.map((p) => p[1]);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += step) {
      const p: P2 = [x + (rnd() - 0.5) * step * 0.8, z + (rnd() - 0.5) * step * 0.8];
      if (!inside(p, FOREST) || edgeDistance(p, FOREST) < 0.6) continue;
      if (avoid.some((poly) => inside(p, poly) || edgeDistance(p, poly) < 1.4)) continue;
      forestTree(k, p[0], p[1], 0.95 + rnd() * 0.55, n);
      n += 1;
    }
  }
}

// ── 사무실·트레일러 ───────────────────────────────────────────────────

/** 지붕 위 실외기: 둥근 흰 상자 + 회색 팬 두 개 */
function rooftopFan(k: Kit, x: number, y: number, z: number): void {
  k.box(C.wall, [1.1, 0.32, 0.6], [x, y, z], { r: 0.09, seg: 3 });
  for (const dx of [-0.26, 0.26]) {
    k.cyl(C.steelLight, 0.2, 0.03, [x + dx, y + 0.32, z], { seg: 24 });
    k.cyl(C.steel, 0.05, 0.035, [x + dx, y + 0.33, z], { seg: 12 });
  }
}

function office(k: Kit): void {
  const { w, d, height } = OFFICE;
  // 사진 축에 맞춘 로컬: +x 동, +z 남 (계근대·마당 쪽이 +z)
  k.at([OFFICE.center[0], 0, OFFICE.center[1]], SITE_ROT_Y, () => {
    k.box(C.concreteDark, [w + 0.5, 0.08, d + 0.5], [0, 0, 0], { r: 0.03 });
    k.box(C.wall, [w, height, d], [0, 0.08, 0], { r: 0.14, seg: 4 });
    k.box(C.roofOffice, [w + 0.24, 0.16, d + 0.24], [0, height + 0.04, 0], { r: 0.07, seg: 3 });
    edgeX(k, -w / 2 - 0.12, w / 2 + 0.12, height + 0.17, d / 2 + 0.12);
    edgeZ(k, -d / 2 - 0.12, d / 2 + 0.12, height + 0.17, -w / 2 - 0.12);
    edgeY(k, -w / 2 - 0.01, d / 2 + 0.01, 0.08, height + 0.1);
    // 창 (남쪽 면: 계근대 쪽, 서쪽 면: 마당 쪽)
    for (let i = 0; i < 5; i += 1) {
      const x = -w / 2 + 0.6 + i * ((w - 1.2) / 4);
      k.box(C.glass, [0.56, 0.52, 0.05], [x, 1.42, d / 2 + 0.01], { r: 0.03, mat: 'glass' });
      if (i !== 2) k.box(C.glass, [0.56, 0.52, 0.05], [x, 0.4, d / 2 + 0.01], { r: 0.03, mat: 'glass' });
    }
    for (let i = 0; i < 6; i += 1) k.box(C.glass, [0.05, 0.52, 0.6], [-w / 2 - 0.01, 1.42, -d / 2 + 0.8 + i * ((d - 1.6) / 5)], { r: 0.03, mat: 'glass' });
    // 현관 (남쪽 가운데)
    k.box(C.glass, [0.6, 0.95, 0.06], [0, 0.08, d / 2 + 0.02], { r: 0.03, mat: 'glass' });
    k.box(C.blue, [1.1, 0.08, 0.6], [0, 1.08, d / 2 + 0.3], { r: 0.035, mat: 'gloss' });
    edgeX(k, -0.55, 0.55, 1.13, d / 2 + 0.6);
    // 옥상 실외기
    for (let i = 0; i < 3; i += 1) rooftopFan(k, -w / 2 + 1.2 + i * 1.6, height + 0.2, -d / 4);
  });
}

/** 사무실 옆에 세워 둔 트레일러 (소품: 흰 적재함 + 회색 운전석) */
function trailer(k: Kit): void {
  const len = Math.min(TRAILER.length, 4.4);
  k.at([TRAILER.center[0], 0, TRAILER.center[1]], TRAILER.heading, () => {
    k.box(C.white, [len - 0.9, 1.15, 1.2], [-0.45, 0.45, 0], { r: 0.08, seg: 3 });
    edgeX(k, -len / 2, len / 2 - 0.9, 1.6, 0.6);
    k.box(C.steel, [0.85, 0.85, 1.12], [len / 2 - 0.45, 0.28, 0], { r: 0.14, seg: 3, mat: 'gloss' });
    k.box(C.glass, [0.05, 0.36, 0.9], [len / 2 - 0.02, 0.72, 0], { r: 0.02, mat: 'glass' });
    for (const x of [-len / 2 + 0.5, -len / 2 + 1.1, len / 2 - 0.5]) {
      for (const z of [-0.55, 0.55]) k.cyl(C.rubber, 0.23, 0.18, [x, 0.23, z], { axis: 'z', seg: 14 });
    }
  });
}

// ── 계근대·입구 ───────────────────────────────────────────────────────

function weighbridge(k: Kit): void {
  const { length, width } = SCALE;
  // 로컬 +x는 계근대의 긴 방향(사진 서쪽). 트럭은 +x를 보고 선다
  k.at([SCALE.center[0], 0, SCALE.center[1]], SCALE.heading, () => {
    k.box(C.steelLight, [length, 0.07, width], [0, -0.02, 0], { r: 0.025, mat: 'metal' });
    for (let i = 0; i < 9; i += 1) k.box(C.steel, [0.035, 0.012, width - 0.16], [-length / 2 + 0.35 + i * ((length - 0.7) / 8), 0.05, 0], { r: 0, mat: 'metal' });
    k.box(C.yellow, [length + 0.1, 0.07, 0.06], [0, 0, -width / 2 - 0.03], { r: 0.02 });
    k.box(C.yellow, [length + 0.1, 0.07, 0.06], [0, 0, width / 2 + 0.03], { r: 0.02 });
    // 번호판 인식 문형 구조물 (동쪽 끝, 들어오는 쪽): 흰 틀 + 파랑 보 + 카메라
    const gx = -length / 2 - 0.45;
    k.box(C.wall, [0.14, 2.5, 0.14], [gx, 0, -width / 2 - 0.25], { r: 0.05 });
    k.box(C.wall, [0.14, 2.5, 0.14], [gx, 0, width / 2 + 0.25], { r: 0.05 });
    k.box(C.blue, [0.2, 0.2, width + 0.7], [gx, 2.4, 0], { r: 0.07, seg: 3, mat: 'gloss' });
    edgeZ(k, -width / 2 - 0.35, width / 2 + 0.35, 2.6, gx + 0.1);
    for (const dz of [-0.45, 0.45]) {
      k.box(C.wall, [0.3, 0.16, 0.18], [gx + 0.16, 2.2, dz], { r: 0.05 });
      k.cyl('#9fd3ff', 0.04, 0.03, [gx + 0.32, 2.28, dz], { axis: 'x', mat: 'glow', glow: 2 });
    }
    // 계근 표시판 (북쪽 곁)
    k.box(C.wall, [0.1, 1.6, 0.1], [0.4, 0, -width / 2 - 0.55], { r: 0.03 });
    k.box(C.dark, [0.9, 0.5, 0.08], [0.4, 1.3, -width / 2 - 0.55], { r: 0.04 });
    k.box('#7ee0a3', [0.7, 0.16, 0.02], [0.4, 1.47, -width / 2 - 0.5], { r: 0, mat: 'glow', glow: 1.4 });
  });
}

function gate(k: Kit): void {
  // 입구 기둥 둘: 흰 기둥 + 가는 파랑 띠 (차단기 팔은 Dynamic의 GateArms)
  for (const p of [GATE.north, GATE.south]) {
    k.box(C.wall, [0.46, 1.5, 0.46], [p[0], 0, p[1]], { r: 0.1, seg: 3 });
    k.box(C.blue, [0.47, EDGE, 0.47], [p[0], 1.32, p[1]], { r: 0.02, mat: 'gloss' });
  }
  // 입구 가운데 섬: 두 차로를 나눈다
  const c: P2 = [mid(GATE.north[0], GATE.south[0]), mid(GATE.north[1], GATE.south[1])];
  k.box(C.wall, [0.3, 0.9, 0.3], [c[0], 0, c[1]], { r: 0.08 });
}

// ── 압축기 건물·레일·압축기 (레일 좌표계) ─────────────────────────────

/** 레일 좌표계 로컬(x = u, z = −w)에서 사진 px의 u·w → 로컬 x·z */
const lu = (u: number) => u * S;
const lw = (w: number) => -w * S;

function houseFloor(k: Kit): void {
  const { main, annex } = BALER_HOUSE;
  k.box(C.hallFloor, [lu(main.u1 - main.u0), 0.08, (main.w1 - main.w0) * S], [lu(mid(main.u0, main.u1)), -0.02, lw(mid(main.w0, main.w1))], { r: 0.02 });
  // 옆동: 닫힌 건물 (흰 벽 + 짙은 파랑 지붕)
  const aw = lu(annex.u1 - annex.u0);
  const ad = (annex.w1 - annex.w0) * S;
  const ac: [number, number, number] = [lu(mid(annex.u0, annex.u1)), 0, lw(mid(annex.w0, annex.w1))];
  k.box(C.wall, [aw, annex.wallH, ad], ac, { r: 0.1, seg: 3 });
  k.box(C.roofBlueDeep, [aw + 0.3, 0.2, ad + 0.3], [ac[0], annex.wallH, ac[2]], { r: 0.08, seg: 3, mat: 'gloss' });
  edgeX(k, ac[0] - aw / 2, ac[0] + aw / 2, annex.wallH + 0.2, ac[2] + ad / 2 + 0.15);
  for (let i = 0; i < 4; i += 1) k.box(C.glass, [0.05, 0.5, 0.9], [lu(annex.u0) - 0.01, 1.6, ac[2] - ad / 2 + 1.2 + i * ((ad - 2.4) / 3)], { r: 0.02, mat: 'glass' });

  // 칠한 통로·압축기 둘레 노랑 테두리
  const y = 0.062;
  const x0 = BALER.x;
  for (const dz of [-1, 1]) k.box(C.yellow, [2.4, 0.012, 0.05], [x0, y, mid(BALER.minZ, BALER.maxZ) + dz * 1.75], { r: 0 });
  for (const dx of [-1, 1]) k.box(C.yellow, [0.05, 0.012, 3.5], [x0 + dx * 1.2, y, mid(BALER.minZ, BALER.maxZ)], { r: 0 });
  k.box(C.bluePale, [lu(main.u1 - main.u0) - 1.2, 0.012, 0.72], [lu(mid(main.u0, main.u1)), y, lw(main.w0) - 0.7], { r: 0 });
  // 조작반
  k.at([x0 + 1.9, 0.06, -0.2], Math.PI / 2, () => {
    k.box(C.wall, [0.8, 1.0, 0.36], [0, 0, 0], { r: 0.09, seg: 3 });
    edgeX(k, -0.4, 0.4, 1.0, 0.18);
    k.box(C.dark, [0.5, 0.3, 0.03], [0, 0.55, 0.19], { r: 0.02 });
    k.box('#9fd3ff', [0.42, 0.04, 0.02], [0, 0.72, 0.205], { r: 0, mat: 'glow', glow: 1.4 });
  });
  pallet(k, lu(main.u1) - 1.2, lw(main.w0) - 1.4, 0.2);
  pallet(k, lu(main.u1) - 1.2, lw(main.w0) - 1.4, 0.2, 0.13);
}

function rail(k: Kit): void {
  // 경사 레일 틀: 놓는 자리에서 건물 안 투입구 위까지 오른다. 옆 레일(파랑 + 가는 선), 다리, 끝 롤러, 모터
  const um = mid(RAIL.startU, RAIL.endU);
  const ym = mid(RAIL.startY, RAIL.endY);
  const half = RAIL.width / 2;
  for (const dz of [-1, 1]) {
    k.box(C.blue, [RAIL_LEN + 0.3, 0.2, 0.07], [um, ym - 0.24, dz * (half + 0.035)], { r: 0.03, mat: 'gloss', rot: [0, 0, RAIL_SLOPE] });
    k.box(C.blue, [RAIL_LEN + 0.3, EDGE, EDGE], [um, ym + 0.02, dz * (half + 0.05)], { r: 0.018, mat: 'gloss', rot: [0, 0, RAIL_SLOPE] });
  }
  const n = Math.max(2, Math.round((RAIL.endU - RAIL.startU) / 1.1));
  for (let i = 0; i <= n; i += 1) {
    const u = RAIL.startU + 0.25 + ((RAIL.endU - RAIL.startU - 0.5) * i) / n;
    const top = RAIL.startY + ((u - RAIL.startU) / (RAIL.endU - RAIL.startU)) * (RAIL.endY - RAIL.startY);
    for (const dz of [-1, 1]) k.box(C.steelLight, [0.09, top - 0.26, 0.09], [u, 0.05, dz * (half - 0.02)], { r: 0.03, mat: 'metal' });
    k.box(C.steelLight, [0.07, 0.07, RAIL.width], [u, top * 0.45, 0], { r: 0.02, mat: 'metal' });
    k.box(C.concreteDark, [0.3, 0.05, RAIL.width + 0.3], [u, 0.05, 0], { r: 0.02 });
  }
  k.cyl(C.steel, 0.1, RAIL.width + 0.1, [RAIL.startU - 0.05, RAIL.startY - 0.1, 0], { axis: 'z', mat: 'metal' });
  k.cyl(C.steel, 0.1, RAIL.width + 0.1, [RAIL.endU + 0.05, RAIL.endY - 0.1, 0], { axis: 'z', mat: 'metal' });
  k.box(C.yellow, [0.42, 0.34, 0.3], [RAIL.endU - 0.6, RAIL.endY - 0.62, half + 0.2], { r: 0.1, mat: 'gloss', seg: 3 });
  k.cyl(C.steel, 0.11, 0.16, [RAIL.endU - 0.6, RAIL.endY - 0.45, half + 0.42], { axis: 'z', mat: 'metal' });
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

  // 유압 장치 (+z 쪽): 파랑 실린더 집, 탱크, 배관
  const hz = maxZ + 1.35;
  k.box(C.blue, [1.3, 0.85, 1.3], [x, y0, hz], { r: 0.14, mat: 'gloss', seg: 3 });
  edgeX(k, x - 0.62, x + 0.62, y0 + 0.82, hz - 0.65);
  k.cyl(C.wall, 0.3, 0.9, [x - 0.2, y0 + 1.25, hz + 0.1], { axis: 'x', mat: 'gloss' });
  k.cyl(C.steelLight, 0.05, 0.5, [x + 0.42, y0 + 0.95, hz - 0.3], { mat: 'metal', seg: 10 });
  k.cyl(C.steelLight, 0.05, 0.9, [x + 0.42, y0 + 1.42, hz - 0.72], { axis: 'z', mat: 'metal', seg: 10 });
  k.cyl(C.yellow, 0.2, 0.75, [x, y0 + 0.5, maxZ + 0.42], { axis: 'z', mat: 'gloss' });

  // 결속부: 파랑 문형 틀과 끈 타래
  const sz = mid(BALER.strapZ, minZ);
  for (const dx of [-1, 1]) k.box(C.blue, [0.14, 1.45, 0.5], [x + dx * (halfX + 0.02), y0, sz], { r: 0.06, mat: 'gloss', seg: 3 });
  k.box(C.blue, [halfX * 2 + 0.18, 0.16, 0.5], [x, y0 + 1.4, sz], { r: 0.06, mat: 'gloss', seg: 3 });
  edgeX(k, x - halfX - 0.09, x + halfX + 0.09, y0 + 1.56, sz - 0.25);
  for (const dx of [-0.42, 0, 0.42]) {
    k.cyl(C.yellow, 0.15, 0.1, [x + dx, y0 + 1.72, sz], { axis: 'x', mat: 'gloss' });
    k.cyl(C.steel, 0.05, 0.14, [x + dx, y0 + 1.72, sz], { axis: 'x' });
  }
  k.box(C.steel, [1.5, 0.05, 0.05], [x, y0 + 1.72, sz], { r: 0.02, mat: 'metal' });

  // 배출 롤러대: 결속부에서 남동 벽(배출구)을 지나 밖까지
  const z0 = BALER.strapZ + 0.1;
  const z1 = BALER.chuteEndZ;
  for (const dx of [-1, 1]) {
    k.box(C.blue, [0.08, 0.16, z0 - z1], [x + dx * (BALE.w / 2 + 0.14), BALER.chuteY - 0.15, mid(z0, z1)], { r: 0.03, mat: 'gloss' });
    for (let z = z0 - 0.2; z > z1; z -= 0.95) k.box(C.steelLight, [0.08, BALER.chuteY - 0.15, 0.08], [x + dx * (BALE.w / 2 + 0.14), 0, z], { r: 0.02, mat: 'metal' });
  }
  for (let z = z0 - 0.08; z > z1 + 0.05; z -= 0.2) k.cyl(C.steelLight, 0.07, BALE.w + 0.2, [x, BALER.chuteY - 0.075, z], { axis: 'x', mat: 'metal', seg: 12 });
  k.box(C.yellow, [BALE.w + 0.36, 0.3, 0.07], [x, BALER.chuteY - 0.2, z1 - 0.02], { r: 0.03 });
}

/** 본동 벽 네 장 (레일 좌표계 로컬). 벽마다 따로 조립해 카메라 쪽 벽을 숨길 수 있게 한다 */
function houseWalls(footprints: Footprint[]): Wall[] {
  const { main } = BALER_HOUSE;
  const h = main.wallH;
  const T = 0.22;
  const u0 = lu(main.u0);
  const u1 = lu(main.u1);
  // 로컬 z = −w: w0(북서)는 +z, w1(남동, 배출구)은 −z
  const zNW = lw(main.w0);
  const zSE = lw(main.w1);
  const make = (build: (k: Kit) => void, name: string): Group => {
    const k = new Kit();
    k.footprints = footprints;
    k.at([0, 0, 0], RAIL_FRAME.heading, () => build(k));
    return k.build(name);
  };
  const band = (k: Kit, along: 'x' | 'z', fixed: number, from: number, to: number) => {
    const len = to - from;
    const c = mid(from, to);
    if (along === 'x') k.box(C.glass, [len, 0.7, 0.06], [c, h - 1.05, fixed], { r: 0.02, mat: 'glass' });
    else k.box(C.glass, [0.06, 0.7, len], [fixed, h - 1.05, c], { r: 0.02, mat: 'glass' });
  };
  // 북동 벽(u0): 레일이 들어가는 구멍
  const railZ0 = -RAIL.width / 2 - 0.25;
  const railZ1 = RAIL.width / 2 + 0.25;
  const ne = make((k) => {
    k.box(C.wall, [T, h, zNW - railZ1], [u0, 0, mid(railZ1, zNW)], { r: 0.05, seg: 3 });
    k.box(C.wall, [T, h, railZ0 - zSE], [u0, 0, mid(zSE, railZ0)], { r: 0.05, seg: 3 });
    k.box(C.wall, [T, 0.9, railZ1 - railZ0], [u0, 0, 0], { r: 0.05 });
    k.box(C.wall, [T, h - 2.75, railZ1 - railZ0], [u0, 2.75, 0], { r: 0.05 });
    k.box(C.blue, [T + 0.04, 0.1, zNW - zSE + T], [u0, h, mid(zSE, zNW)], { r: 0.04, mat: 'gloss' });
    edgeY(k, u0 - 0.13, railZ0, 0.9, 2.75);
    edgeY(k, u0 - 0.13, railZ1, 0.9, 2.75);
    band(k, 'z', u0, railZ1 + 0.3, zNW - 0.3);
  }, 'wall-ne');
  // 남동 벽(w1): 베일 배출구
  const gapL = BALER.x - 0.75;
  const gapR = BALER.x + 0.75;
  const se = make((k) => {
    k.box(C.wall, [gapL - u0, h, T], [mid(u0, gapL), 0, zSE], { r: 0.05, seg: 3 });
    k.box(C.wall, [u1 - gapR, h, T], [mid(gapR, u1), 0, zSE], { r: 0.05, seg: 3 });
    k.box(C.wall, [gapR - gapL + 0.1, h - 1.7, T], [BALER.x, 1.7, zSE], { r: 0.05 });
    k.box(C.blue, [u1 - u0 + T, 0.1, T + 0.04], [mid(u0, u1), h, zSE], { r: 0.04, mat: 'gloss' });
    edgeY(k, gapL, zSE - 0.13, 0, 1.7);
    edgeY(k, gapR, zSE - 0.13, 0, 1.7);
    edgeX(k, gapL, gapR, 1.68, zSE - 0.13);
    band(k, 'x', zSE, gapR + 0.4, u1 - 0.4);
  }, 'wall-se');
  const sw = make((k) => {
    k.box(C.wall, [T, h, zNW - zSE + T], [u1, 0, mid(zSE, zNW)], { r: 0.05, seg: 3 });
    k.box(C.blue, [T + 0.04, 0.1, zNW - zSE + T], [u1, h, mid(zSE, zNW)], { r: 0.04, mat: 'gloss' });
    band(k, 'z', u1, zSE + 0.4, zNW - 0.4);
  }, 'wall-sw');
  const nw = make((k) => {
    k.box(C.wall, [u1 - u0 + T, h, T], [mid(u0, u1), 0, zNW], { r: 0.05, seg: 3 });
    k.box(C.blue, [u1 - u0 + T, 0.1, T + 0.04], [mid(u0, u1), h, zNW], { r: 0.04, mat: 'gloss' });
  }, 'wall-nw');
  const { u, w } = RAIL_FRAME;
  return [
    { group: ne, nx: -u[0], nz: -u[1] },
    { group: se, nx: w[0], nz: w[1] },
    { group: sw, nx: u[0], nz: u[1] },
    { group: nw, nx: -w[0], nz: -w[1] },
  ];
}

/** 본동의 파란 지붕 (멀리서는 사진처럼 덮여 보이고, 가까이 오면 걷는다) */
function houseRoof(): Group {
  const { main } = BALER_HOUSE;
  const k = new Kit('gloss');
  k.at([0, 0, 0], RAIL_FRAME.heading, () => {
    const w = lu(main.u1 - main.u0) + 0.4;
    const d = (main.w1 - main.w0) * S + 0.4;
    const c: [number, number, number] = [lu(mid(main.u0, main.u1)), main.wallH + 0.05, lw(mid(main.w0, main.w1))];
    k.box(C.roofBlue, [w, 0.16, d], c, { r: 0.07, seg: 3 });
    // 골판 줄무늬 (지붕 결)
    for (let i = 1; i < 12; i += 1) k.box(C.roofBlueDeep, [0.05, 0.02, d - 0.3], [c[0] - w / 2 + (w * i) / 12, main.wallH + 0.21, c[2]], { r: 0 });
  });
  return k.build('house-roof');
}

// ── 베일 적치: 북서 고정 재고(예시), 남동 칸 표시 ────────────────────

/** 북서 구역의 고정 재고("예시"). 서버 값이 아니다: 쌓인 모양만 보여 준다 */
function nwStock(k: Kit): void {
  const poly = BALE_AREAS.nw;
  // 사진의 줄 방향(ㄱ자의 긴 쪽)에 맞춘 격자
  const [ax, az] = ((): P2 => {
    const a = sitePx(262, 22);
    const b = sitePx(176, 266);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  })();
  const rot = Math.atan2(-az, ax);
  const o = sitePx(BALE_AREA_PX.nw[0]![0], BALE_AREA_PX.nw[0]![1]);
  const rnd = random(77);
  const tones = [C.kraft, C.kraftLight, C.kraft, C.kraftDark];
  for (let i = -4; i < 40; i += 1) {
    for (let j = -14; j < 14; j += 1) {
      const along = i * (BALE.d + 0.06);
      const across = j * (BALE.w + 0.05);
      const p: P2 = [o[0] + ax * along - az * across, o[1] + az * along + ax * across];
      if (!inside(p, poly)) continue;
      const edge = edgeDistance(p, poly);
      if (edge < 0.62) continue;
      // 가장자리는 낮게, 안쪽은 세 단 (계단처럼)
      const levels = edge < 1.3 ? 1 + (rnd() < 0.5 ? 1 : 0) : rnd() < 0.15 ? 2 : 3;
      for (let l = 0; l < levels; l += 1) {
        k.at([p[0], 0.03 + l * BALE.h, p[1]], rot, () => {
          k.box(tones[(i * 3 + j + l) % tones.length]!, [BALE.d, BALE.h - 0.01, BALE.w], [0, 0, 0], { r: 0 });
          for (const dx of [-0.28, 0.28]) k.box(C.dark, [0.026, BALE.h + 0.004, BALE.w + 0.012], [dx, -0.005, 0], { r: 0 });
        });
      }
    }
  }
}

function seMarks(k: Kit): void {
  const y = 0.034;
  // 남동 마당(마당 좌표계): 적치 칸(가는 노랑 테두리), 지게차 길(노랑 점선), 대기 자리(가는 파랑 테두리), 가로지르는 길(파랑 점선)
  k.at([YARD_FRAME.x, 0, YARD_FRAME.z], YARD_FRAME.rotY, () => {
    for (const x of YARD.slotXs) {
      k.box(C.yellow, [0.86, 0.012, 0.035], [x, y, YARD.slotZ + 0.56], { r: 0 });
      k.box(C.yellow, [0.86, 0.012, 0.035], [x, y, YARD.slotZ - 0.56], { r: 0 });
      k.box(C.yellow, [0.035, 0.012, 1.12], [x - 0.43, y, YARD.slotZ], { r: 0 });
      k.box(C.yellow, [0.035, 0.012, 1.12], [x + 0.43, y, YARD.slotZ], { r: 0 });
    }
    for (let x = YARD.laneStart + 0.6; x < YARD.laneEnd - 0.4; x += 0.9) k.box(C.yellow, [0.45, 0.012, 0.06], [x + 0.22, y, YARD.laneZ - 0.62], { r: 0 });
    YARD.homes.slice(0, YARD_FLOW.forkliftCount).forEach(([hx, hz]) => {
      for (const dx of [-0.6, 0.6]) k.box(C.blue, [0.04, 0.014, 1.9], [hx + dx, y, hz + 0.3], { r: 0 });
      for (const dz of [-0.65, 1.25]) k.box(C.blue, [1.24, 0.014, 0.04], [hx, y, hz + dz], { r: 0 });
    });
    const route: P2[] = [[YARD.laneEnd, YARD.laneZ], ...YARD.crossing];
    for (let i = 0; i + 1 < route.length; i += 1) {
      const a = route[i]!;
      const b = route[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0.3; t + 0.45 < len; t += 1.0) {
        const u0 = t / len;
        const u1 = (t + 0.45) / len;
        seg(k, C.blueSoft, [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0], [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1], 0.07, y);
      }
    }
  });
}

/** 섹터 더미 둘레의 낮은 턱 (칸막이 없는 노천 더미: 바닥 경계만 표시) */
function pileKerbs(k: Kit): void {
  for (const id of TANK_IDS) {
    const poly = PILES[id];
    for (let i = 0; i < poly.length; i += 1) seg(k, C.concreteDark, poly[i]!, poly[(i + 1) % poly.length]!, 0.14, 0.0, 0.06);
  }
}

function utilities(k: Kit): void {
  // 가로등 몇 개 (트럭·지게차 길을 피한 자리)
  for (const [x, y, rot] of [
    [405, 214, Math.PI / 2],
    [470, 346, Math.PI],
    [236, 300, 0],
  ] as const) {
    const [wx, wz] = sitePx(x, y);
    lamp(k, wx, wz, rot + SITE_ROT_Y);
  }
}

export interface ParkedCar {
  x: number;
  z: number;
  rotY: number;
  paint: string;
}

/** 사무실 동쪽 곁에 세운 직원 차 (사진 px 자리, 남북으로 선다). 모델 파일이든 코드 모형이든 같은 자리 */
export const PARKED: ParkedCar[] = (
  [
    [507, 150, 0],
    [507, 182, 4],
  ] as const
).map(([x, y, paint]) => {
  const [wx, wz] = sitePx(x, y);
  return { x: wx, z: wz, rotY: SITE_ROT_Y - Math.PI / 2, paint: CAR_PAINTS[paint] ?? C.white };
});

/** 코드로 만든 주차 차량 (모델 파일을 못 받았을 때 쓰는 모형) */
export function buildParkedCars(): Group {
  const k = new Kit();
  for (const c of PARKED) car(k, c.x, c.z, c.rotY, c.paint);
  return k.build('parked-cars');
}

export function buildWorld(): World {
  const footprints: Footprint[] = [];
  const k = new Kit();
  k.footprints = footprints;
  ground(k);
  forest(k);
  office(k);
  trailer(k);
  weighbridge(k);
  gate(k);
  pileKerbs(k);
  nwStock(k);
  seMarks(k);
  utilities(k);
  k.at([0, 0, 0], RAIL_FRAME.heading, () => {
    houseFloor(k);
    rail(k);
    baler(k);
  });
  for (const c of PARKED) footprints.push({ x0: c.x - 0.6, x1: c.x + 0.6, z0: c.z - 0.6, z1: c.z + 0.6, y0: 0, y1: 0.7 });
  const { main } = BALER_HOUSE;
  const houseCenter = railPx(mid(main.u0, main.u1), mid(main.w0, main.w1));
  return { base: k.build('world'), walls: houseWalls(footprints), roof: houseRoof(), houseCenter, footprints };
}
