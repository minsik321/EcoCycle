import { TANK_IDS } from '@ecocycle/shared';
import type { Group } from 'three';
import { C } from '../theme';
import { Kit } from '../three/kit';
import type { Footprint, Vec3 } from '../three/kit';
import type { P2 } from '../sim/paths';
import type { StaticBaleCell } from './layout';
import {
  edgeDistance,
  staticBaleCells,
  yardPoint,
  BALE,
  BALE_AREAS,
  BALE_GAP,
  BALER,
  BALER_TUNNEL,
  BALER_HOUSE,
  FENCE_PX,
  FORESTS,
  LAMP_PX,
  POLE_PX,
  worldToYard,
  NET_PX,
  NORTH_ROW_PX,
  OFFICE,
  PILES,
  PLATEAU,
  RAIL,
  RAIL_FRAME,
  RAIL_LEN,
  RAIL_SLOPE,
  RAMP_PX,
  ROAD,
  SCALE,
  SHED,
  SITE_CENTER,
  SITE_ROT_Y,
  SITE_SCALE,
  WALL_PX,
  WATER_TANK,
  YARD,
  YARD_FRAME,
  inside,
  railPx,
  railToPhoto,
  roadY,
  sitePx,
  siteHeading,
  worldToPx,
} from './layout';
import { bale, cone, lamp, pallet } from './props';

export { inside } from './layout';

// 스튜디오 월드의 고정물. 전부 코드로 조립하고 재질별 메시 몇 개로 합친다(반복물도 합친 메시 하나: 베일 블록·그물망·울타리·전봇대·나무·파지 조각).
// 배치는 모두 위성사진 좌표를 world/layout의 sitePx로 옮긴 값이고, 모양은 현장 사진 6장(2026-11-25)을 따른다:
//  - 마당·계근대 단은 도로보다 높다. 동쪽은 블록 옹벽 + 쇠 난간, 입구 경사로 한 곳, 도로는 남쪽으로 오르막 (approach·weighbridge·entrance)
//  - 사무실: 짙은 회색 골판 2층, 서쪽 1층 차양·큰 창, 동쪽 실외기, 남서 모서리 흰 창고, 소화기 (approach·weighbridge·from-gate-inside)
//  - 압축기 건물: 회색 벽 + 파란 지붕의 긴 공장, 지붕 위 파란 물탱크 (entrance)
//  - 북·남 높은 녹색 그물망, 남동 회색 철판 울타리 (from-upper-road), 도로변 전봇대·전선, 숲 쪽 높은 철 기둥
//  - 베일: 같은 방향·같은 간격의 블록 줄 4~5단 (북서 재고, 남동 긴 변의 벽, 북쪽 숲 경계 줄)
//  - 부지 둘레 낮은 숲 언덕과 먼 산 능선. 주차 차량·세워 둔 화물차·이웃 건물은 넣지 않는다(장면의 차량은 모두 서버 값)
// 압축기 건물 본동의 벽은 방향별로 따로 만들어 카메라 쪽 벽을 숨기고(안이 들여다보이는 "인형의 집" 방식), 파란 지붕은 가까이 오면 걷는다.

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
/** 마당 윗면 높이 (바닥 판들은 이 위에 얇게 깐다) */
const TOP = 0;
/** 부지 밖 낮은 땅의 높이 */
const LOW = -2.2;

/** 가는 파랑 선 (지붕선·모서리·문틀) */
const EDGE = 0.065;
function edgeX(k: Kit, x0: number, x1: number, y: number, z: number, hex: string = C.blue): void {
  k.box(hex, [x1 - x0, EDGE, EDGE], [mid(x0, x1), y, z], { r: 0.018, mat: 'gloss' });
}

/** 바닥 위 두 점을 잇는 가는 상자 (칠한 선·띠·벽) */
function seg(k: Kit, hex: string, a: P2, b: P2, width: number, y: number, h = 0.012, mat?: 'clay' | 'metal' | 'net' | 'gloss'): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-3) return;
  const heading = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  k.box(hex, [len, h, width], [mid(a[0], b[0]), y, mid(a[1], b[1])], { r: 0, rot: [0, heading, 0], mat });
}

/** 꺾은선을 폭 width의 띠로: 왼쪽·오른쪽 가장자리 점 */
function edges(line: readonly P2[], width: number): { left: P2[]; right: P2[] } {
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
  return { left, right };
}

/** 두 가장자리 사이를 삼각형으로 잇는다 (높이는 yOf). 위를 보도록 감는다 */
function band(k: Kit, hex: string, a: readonly P2[], b: readonly P2[], yA: (p: P2) => number, yB: (p: P2) => number = yA, lift = 0): void {
  const v: Vec3[] = [];
  for (let i = 0; i + 1 < a.length; i += 1) {
    const a0: Vec3 = [a[i]![0], yA(a[i]!) + lift, a[i]![1]];
    const a1: Vec3 = [a[i + 1]![0], yA(a[i + 1]!) + lift, a[i + 1]![1]];
    const b0: Vec3 = [b[i]![0], yB(b[i]!) + lift, b[i]![1]];
    const b1: Vec3 = [b[i + 1]![0], yB(b[i + 1]!) + lift, b[i + 1]![1]];
    // 위에서 볼 때 반시계가 되도록 두 방향 모두 넣지 않고, 법선이 위를 보게 고른다
    const up = (p: Vec3, q: Vec3, r: Vec3) => (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]) > 0;
    const t1: [Vec3, Vec3, Vec3] = up(a0, b0, a1) ? [a0, b0, a1] : [a0, a1, b0];
    const t2: [Vec3, Vec3, Vec3] = up(a1, b0, b1) ? [a1, b0, b1] : [a1, b1, b0];
    v.push(...t1, ...t2);
  }
  k.tris(hex, v);
}

/** 위에서 아래로 내린 세로 면 (옹벽·도로 둑): 윗선 top(y)에서 아랫선(bottom y)까지 */
function face(k: Kit, hex: string, line: readonly P2[], topOf: (p: P2) => number, botOf: (p: P2) => number): void {
  const v: Vec3[] = [];
  for (let i = 0; i + 1 < line.length; i += 1) {
    const p = line[i]!;
    const q = line[i + 1]!;
    const pt: Vec3 = [p[0], topOf(p), p[1]];
    const qt: Vec3 = [q[0], topOf(q), q[1]];
    const pb: Vec3 = [p[0], botOf(p), p[1]];
    const qb: Vec3 = [q[0], botOf(q), q[1]];
    // 양쪽에서 보이게 두 면을 넣는다 (얇은 면이라 그림자 굽기에는 넣지 않는다)
    v.push(pt, pb, qt, qt, pb, qb, pt, qt, pb, qt, qb, pb);
  }
  k.tris(hex, v);
}

/** 같은 씨앗이면 같은 값을 내는 난수 */
function random(seed0: number): () => number {
  let seed = seed0;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

export { edgeDistance };

const pyOf = (p: P2): number => worldToPx(p[0], p[1])[1];
const roadAt = (p: P2): number => roadY(pyOf(p)) - 0.02;
const HOUSE_POLYS: P2[][] = [BALER_HOUSE.main, BALER_HOUSE.annex].map((h) => [railPx(h.u0, h.w0), railPx(h.u0, h.w1), railPx(h.u1, h.w1), railPx(h.u1, h.w0)]);

// ── 땅: 마당 판, 낮은 땅, 도로, 경사로, 옹벽 ──────────────────────────

function ground(k: Kit): void {
  // 부지 밖 낮은 땅 (도로 동쪽 들판과 그 너머)
  k.cyl(C.grass, 220, 0.4, [SITE_CENTER[0], LOW - 0.4, SITE_CENTER[1]], { seg: 72 });
  // 마당·계근대 단: 높이 0의 판(옆면은 옹벽 아래까지 내려간다)
  k.flat(C.pad, PLATEAU, LOW - 0.1, TOP - (LOW - 0.1));

  // 도로: 비탈(북쪽이 낮고 남쪽으로 오름) 두 차로, 흰 가장자리 선·가운데 점선, 동쪽 둑
  const line = ROAD.line;
  const { left, right } = edges(line, ROAD.width);
  band(k, C.asphalt, left, right, roadAt);
  for (const e of [edges(line, ROAD.width - 0.3).left, edges(line, ROAD.width - 0.3).right]) {
    const { left: l, right: r } = edges(e, 0.08);
    band(k, C.line, l, r, roadAt, roadAt, 0.012);
  }
  for (let i = 0; i + 1 < line.length; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = 0.4; t + 0.8 < len; t += 1.6) {
      const u0 = t / len;
      const u1 = (t + 0.8) / len;
      const p: P2 = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0];
      const q: P2 = [a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1];
      const { left: l, right: r } = edges([p, q], 0.09);
      band(k, C.line, l, r, roadAt, roadAt, 0.012);
    }
  }
  // 도로 양쪽 둑: 서쪽은 마당 판 옆(옹벽·울타리 아래 흙), 동쪽은 들판으로 내려간다
  const outer = edges(line, ROAD.width + 7);
  face(k, C.earth, right, roadAt, () => LOW - 0.1);
  band(k, C.grass, left, outer.left, roadAt, (p) => roadAt(p) - 0.9);
  band(k, C.earth, right, outer.right, roadAt, (p) => Math.min(roadAt(p), TOP) - 0.2);
  face(k, C.earth, outer.left, (p) => roadAt(p) - 0.9, () => LOW - 0.1);

  // 입구 경사로: 마당 가장자리(높이 0)에서 도로(남쪽 낮은 높이)까지
  const ramp = RAMP_PX.map(([x, y]) => sitePx(x, y));
  const rampY = (p: P2): number => {
    const [px, py] = worldToPx(p[0], p[1]);
    return px < 495 ? TOP : roadY(py) - 0.02;
  };
  band(k, C.concrete, [ramp[0]!, ramp[3]!], [ramp[1]!, ramp[2]!], rampY, rampY, 0.005);
  // 경사로의 미끄럼 방지 줄(사진의 벽돌 무늬 진입로)
  for (let i = 1; i < 8; i += 1) {
    const t = i / 8;
    const a: P2 = [ramp[0]![0] + (ramp[1]![0] - ramp[0]![0]) * t, ramp[0]![1] + (ramp[1]![1] - ramp[0]![1]) * t];
    const b: P2 = [ramp[3]![0] + (ramp[2]![0] - ramp[3]![0]) * t, ramp[3]![1] + (ramp[2]![1] - ramp[3]![1]) * t];
    const { left: l, right: r } = edges([a, b], 0.06);
    band(k, C.concreteDark, l, r, (p) => rampY(p) + 0.02);
  }

  // 숲 바닥: 짙은 녹지 (가장자리는 한 단 옅게)
  for (const f of FORESTS) {
    k.flat(C.lawnEdge, f, TOP + 0.01, 0.04);
    k.flat(C.forestFloor, f, TOP + 0.02, 0.05);
  }

  // 베일 적치 구역 두 곳: 한 단 어두운 바닥 + 노랑 테두리(사진의 노랑 표시)
  for (const poly of [BALE_AREAS.nw, BALE_AREAS.se]) {
    k.flat(C.concreteDark, poly, TOP + 0.03, 0.03);
    for (let i = 0; i < poly.length; i += 1) seg(k, C.yellow, poly[i]!, poly[(i + 1) % poly.length]!, 0.12, TOP + 0.061);
  }
}

/** 동쪽 블록 옹벽 + 위 쇠 난간 (도로 쪽 면, 블록 줄눈, 위 덮개) */
function retainingWall(k: Kit): void {
  for (const list of WALL_PX) {
    const line = list.map(([x, y]) => sitePx(x, y));
    const base = (p: P2) => roadY(pyOf(p)) - 0.1;
    face(k, C.blockWall, line, () => TOP + 0.02, base);
    // 블록 줄: 가로 줄눈과 세로 줄눈 (도로보다 위인 곳만)
    for (let i = 0; i + 1 < line.length; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = (b[1] - a[1]) / len;
      const nz = -(b[0] - a[0]) / len;
      const lo = Math.max(base(a), base(b));
      for (let y = TOP - 0.3; y > lo + 0.1; y -= 0.3) {
        const off = 0.03;
        seg(k, C.blockJoint, [a[0] + nx * off, a[1] + nz * off], [b[0] + nx * off, b[1] + nz * off], 0.03, y, 0.035);
        seg(k, C.blockJoint, [a[0] - nx * off, a[1] - nz * off], [b[0] - nx * off, b[1] - nz * off], 0.03, y, 0.035);
      }
      for (let s = 0.5; s < len; s += 0.62) {
        const p: P2 = [a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len];
        const bot = base(p);
        const h = TOP - bot;
        if (h > 0.15) k.box(C.blockJoint, [0.03, h, 0.09], [p[0], bot, p[1]], { r: 0, rot: [0, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), 0] });
      }
      // 위 덮개 (밝은 회색 판)
      seg(k, C.coping, a, b, 0.34, TOP - 0.02, 0.12);
    }
    // 쇠 난간: 기둥과 두 줄 가로대
    for (let i = 0; i + 1 < line.length; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s <= len; s += 1.4) {
        const p: P2 = [a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len];
        k.box(C.railing, [0.05, 1.0, 0.05], [p[0], TOP + 0.1, p[1]], { r: 0.015, mat: 'metal' });
      }
      seg(k, C.railing, a, b, 0.045, TOP + 1.06, 0.045, 'metal');
      seg(k, C.railing, a, b, 0.035, TOP + 0.62, 0.035, 'metal');
    }
  }
}

/** 남동 회색 철판 울타리(골판) + 그 안쪽과 북쪽의 높은 녹색 그물망 */
function boundaries(k: Kit): void {
  const fence = FENCE_PX.map(([x, y]) => sitePx(x, y));
  for (let i = 0; i + 1 < fence.length; i += 1) {
    const a = fence[i]!;
    const b = fence[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rot = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    k.box(C.fenceGrey, [len, 2.3, 0.06], [mid(a[0], b[0]), TOP, mid(a[1], b[1])], { r: 0, rot: [0, rot, 0], mat: 'metal' });
    for (let s = 0.25; s < len; s += 0.36) {
      const p: P2 = [a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len];
      k.box(C.steel, [0.06, 2.3, 0.1], [p[0], TOP, p[1]], { r: 0, rot: [0, rot, 0], mat: 'metal' });
    }
  }
  for (const list of NET_PX) {
    const line = list.map(([x, y]) => sitePx(x, y));
    for (let i = 0; i + 1 < line.length; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const rot = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
      k.box(C.net, [len, 4.2, 0.02], [mid(a[0], b[0]), TOP + 0.3, mid(a[1], b[1])], { r: 0, rot: [0, rot, 0], mat: 'net' });
      seg(k, C.dark, a, b, 0.04, TOP + 4.5, 0.04, 'metal');
      for (let s = 0; s <= len; s += 2.6) {
        const p: P2 = [a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len];
        k.cyl(C.steel, 0.06, 4.6, [p[0], TOP, p[1]], { seg: 8, mat: 'metal' });
      }
    }
  }
}

/** 도로변 전봇대·전선, 숲 쪽 높은 철 기둥 */
function poles(k: Kit): void {
  // 도로 동쪽 가장자리 밖 (차로 위에 두지 않는다, `POLE_PX`)
  const spots: P2[] = POLE_PX.map(([x, y]) => sitePx(x, y));
  const tops: Vec3[] = [];
  for (const p of spots) {
    const base = roadY(pyOf(p)) - 0.05;
    k.cyl(C.pole, [0.09, 0.13], 7.4, [p[0], base, p[1]], { seg: 10 });
    k.box(C.dark, [1.2, 0.08, 0.08], [p[0], base + 6.9, p[1]], { r: 0.01, rot: [0, siteHeading(1, 0.2), 0] });
    k.box(C.steelLight, [0.22, 0.34, 0.22], [p[0] + 0.15, base + 5.6, p[1]], { r: 0.04, mat: 'metal' });
    tops.push([p[0], base + 6.95, p[1]]);
  }
  // 전선 셋: 전봇대 꼭대기를 잇는 가는 원통 (가운데가 살짝 처진 두 마디)
  for (let i = 0; i + 1 < tops.length; i += 1) {
    const a = tops[i]!;
    const b = tops[i + 1]!;
    for (const off of [-0.5, 0, 0.5]) {
      const m: Vec3 = [mid(a[0], b[0]), mid(a[1], b[1]) - 0.35, mid(a[2], b[2])];
      for (const [p, q] of [
        [a, m],
        [m, b],
      ] as const) {
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const dz = q[2] - p[2];
        const len = Math.hypot(dx, dy, dz);
        const heading = Math.atan2(-dz, dx);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz));
        k.box(C.wire, [len, 0.018, 0.018], [mid(p[0], q[0]) + off * Math.sin(heading) * 0.6, mid(p[1], q[1]) - 0.009, mid(p[2], q[2]) + off * Math.cos(heading) * 0.6], { r: 0, rot: [0, heading, pitch] });
      }
    }
  }
  // 숲 쪽 높은 철 기둥 (사진 entrance·weighbridge의 높은 기둥): 쇠 기둥 + 버팀줄
  const [mx, mz] = sitePx(126, 276);
  k.cyl(C.steel, [0.07, 0.12], 11, [mx, TOP, mz], { seg: 10, mat: 'metal' });
  k.box(C.steel, [1.4, 0.07, 0.07], [mx, TOP + 10.2, mz], { r: 0.01, mat: 'metal' });
  for (const a of [0.4, 2.5, 4.6]) {
    const ex = mx + Math.cos(a) * 3.2;
    const ez = mz - Math.sin(a) * 3.2;
    const len = Math.hypot(3.2, 10.5);
    k.box(C.wire, [len, 0.02, 0.02], [mid(mx, ex), TOP + 5.25, mid(mz, ez)], { r: 0, rot: [0, a, -Math.atan2(10.5, 3.2)] });
  }
}

// ── 숲·언덕·능선 ──────────────────────────────────────────────────────

/** 숲 나무: 줄기 + 둥근 수관 둘 */
/** low 단계(가볍게): 나무·언덕·능선의 둥근 면을 거칠게, 숲을 성기게, 베일 띠·파지 조각을 줄인다. buildWorld가 정한다 */
let LITE = false;

function forestTree(k: Kit, x: number, y: number, z: number, s: number, v: number): void {
  const tones = [C.green, C.greenDeep, C.greenLight, C.forest];
  const a = tones[v % tones.length]!;
  const b = tones[(v + 1) % tones.length]!;
  k.at(
    [x, y, z],
    v * 1.7,
    () => {
      k.cyl(C.trunk, [0.08, 0.11], 0.7, [0, 0, 0], { seg: LITE ? 4 : 5 });
      k.ball(a, 0.78, [0, 1.25, 0], { scale: [1, 0.9, 1], seg: LITE ? 5 : 7 });
      if (!LITE) k.ball(b, 0.52, [0.36, 1.72, 0.14], { seg: 6 });
    },
    s,
  );
}

function forest(k: Kit): void {
  const rnd = random(4021);
  const avoid = [BALE_AREAS.nw, ...HOUSE_POLYS];
  const step = LITE ? 2.3 : 1.8;
  let n = 0;
  for (const zone of FORESTS) {
    const xs = zone.map((p) => p[0]);
    const zs = zone.map((p) => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += step) {
        const p: P2 = [x + (rnd() - 0.5) * step * 0.8, z + (rnd() - 0.5) * step * 0.8];
        if (!inside(p, zone) || edgeDistance(p, zone) < 0.6) continue;
        if (avoid.some((poly) => inside(p, poly) || edgeDistance(p, poly) < 1.4)) continue;
        forestTree(k, p[0], TOP, p[1], (0.95 + rnd() * 0.65) * (LITE ? 1.15 : 1), n);
        n += 1;
      }
    }
  }
}

/** 부지 둘레 낮은 숲 언덕(나무 덮인 둔덕)과 멀리 산 능선 */
function hills(k: Kit): void {
  const rnd = random(907);
  const [cx, cz] = SITE_CENTER;
  // 낮은 숲 언덕: 부지 둘레에 둥글게. 도로 동쪽(들판)은 더 멀리
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2 + rnd() * 0.12;
    const east = Math.cos(a - siteHeading(1, 0)) > 0.3;
    const r = (east ? 46 : 36) + rnd() * 8;
    const x = cx + Math.cos(a) * r;
    const z = cz - Math.sin(a) * r;
    const size = 9 + rnd() * 6;
    k.ball(i % 2 ? C.hill : C.hillDark, size, [x, LOW - size * 0.62, z], { scale: [1.5, 0.75, 1.2], seg: LITE ? 9 : 14 });
    // 언덕 위 나무 몇 그루
    for (let j = 0; j < (LITE ? 2 : 5); j += 1) {
      const tx = x + (rnd() - 0.5) * size * 1.6;
      const tz = z + (rnd() - 0.5) * size * 1.2;
      const d = Math.hypot(tx - x, tz - z) / size;
      const top = LOW - size * 0.62 + size * 0.75 * Math.sqrt(Math.max(0, 1 - d * d * 0.5)) - 0.4;
      forestTree(k, tx, top, tz, 1.4 + rnd() * 0.8, i + j);
    }
  }
  // 먼 산 능선: 낮고 길게 겹친 둔덕 두 줄 (뒤쪽은 옅게). 꼭대기가 땅보다 peak m 위라 사람 눈높이에서도 숲 위로 보인다
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    for (const [r, tone, peak] of [
      [120, C.ridge, 9],
      [170, C.ridgeFar, 16],
    ] as const) {
      const top = LOW + peak * (0.7 + rnd() * 0.5);
      k.ball(tone, 34, [cx + Math.cos(a) * r, top - 34 * 0.55, cz - Math.sin(a) * r], { scale: [1.6, 0.55, 1], seg: LITE ? 8 : 12, rot: [0, -a, 0] });
    }
  }
}

// ── 사무실·창고·트레일러 ──────────────────────────────────────────────

/** 실외기: 흰 상자 + 팬 */
function acUnit(k: Kit, x: number, y: number, z: number): void {
  k.box(C.wall, [0.55, 1.0, 0.75], [x, y, z], { r: 0.04 });
  k.cyl(C.steel, 0.24, 0.03, [x + 0.28, y + 0.55, z], { seg: 16, axis: 'x' });
  for (let i = 0; i < 5; i += 1) k.box(C.steelLight, [0.02, 0.02, 0.6], [x + 0.285, y + 0.2 + i * 0.16, z], { r: 0 });
}

function office(k: Kit): void {
  const { w, d, height } = OFFICE;
  const floor2 = height / 2;
  // 사진 축에 맞춘 로컬: +x 동, +z 남 (계근대 쪽이 +z, 마당 쪽이 −x)
  k.at([OFFICE.center[0], TOP, OFFICE.center[1]], SITE_ROT_Y, () => {
    k.box(C.concrete, [w + 0.4, 0.12, d + 0.4], [0, 0, 0], { r: 0.03 });
    // 짙은 회색 골판 몸체 + 세로 골
    k.box(C.officeWall, [w, height, d], [0, 0.12, 0], { r: 0.04 });
    for (let x = -w / 2 + 0.15; x < w / 2; x += 0.3) {
      k.box(C.officeRib, [0.06, height - 0.1, 0.03], [x, 0.17, d / 2 + 0.015], { r: 0 });
      k.box(C.officeRib, [0.06, height - 0.1, 0.03], [x, 0.17, -d / 2 - 0.015], { r: 0 });
    }
    for (let z = -d / 2 + 0.15; z < d / 2; z += 0.3) {
      k.box(C.officeRib, [0.03, height - 0.1, 0.06], [-w / 2 - 0.015, 0.17, z], { r: 0 });
      k.box(C.officeRib, [0.03, height - 0.1, 0.06], [w / 2 + 0.015, 0.17, z], { r: 0 });
    }
    // 지붕 덮개(짙은 회색)와 처마선
    k.box(C.roofOffice, [w + 0.2, 0.14, d + 0.2], [0, height + 0.12, 0], { r: 0.03 });
    // 마당 쪽(서쪽) 1층: 큰 유리창 줄 + 현관, 그 위 차양(1층 높이)
    k.box(C.dark, [0.05, 1.35, d * 0.7], [-w / 2 - 0.04, 0.55, -d * 0.05], { r: 0.01 });
    k.box(C.glass, [0.04, 1.25, d * 0.68], [-w / 2 - 0.07, 0.6, -d * 0.05], { r: 0.01, mat: 'glass' });
    for (let i = 0; i < 6; i += 1) k.box(C.dark, [0.06, 1.3, 0.05], [-w / 2 - 0.08, 0.57, -d * 0.39 + i * (d * 0.68) / 5], { r: 0 });
    k.box(C.canopy, [1.1, 0.12, d * 0.86], [-w / 2 - 0.55, 2.05, -d * 0.03], { r: 0.02 });
    k.box(C.dark, [1.12, 0.04, d * 0.87], [-w / 2 - 0.55, 2.17, -d * 0.03], { r: 0 });
    // 2층 창 (서쪽 긴 띠창, 남쪽 두 개)
    k.box(C.dark, [0.05, 0.75, d * 0.42], [-w / 2 - 0.04, floor2 + 0.7, d * 0.16], { r: 0.01 });
    k.box(C.glass, [0.04, 0.68, d * 0.4], [-w / 2 - 0.07, floor2 + 0.73, d * 0.16], { r: 0.01, mat: 'glass' });
    for (const x of [-w * 0.22, w * 0.18]) {
      k.box(C.dark, [0.9, 0.7, 0.05], [x, floor2 + 0.75, d / 2 + 0.04], { r: 0.01 });
      k.box(C.glass, [0.82, 0.62, 0.04], [x, floor2 + 0.79, d / 2 + 0.07], { r: 0.01, mat: 'glass' });
    }
    // 북쪽 2층 창
    for (const x of [-w * 0.2, w * 0.2]) k.box(C.glass, [0.8, 0.6, 0.04], [x, floor2 + 0.8, -d / 2 - 0.07], { r: 0.01, mat: 'glass' });
    // 빗물 홈통 (흰 관)
    for (const [x, z] of [
      [w / 2 + 0.04, -d * 0.3],
      [w / 2 + 0.04, d * 0.3],
      [-w / 2 - 0.04, d * 0.46],
    ] as const) {
      k.cyl(C.steelLight, 0.05, height, [x, 0.12, z], { seg: 8, mat: 'metal' });
    }
    // 동쪽 벽 실외기 셋 (도로 쪽)
    for (const z of [-d * 0.32, -d * 0.2, -d * 0.08]) acUnit(k, w / 2 + 0.05, 0.12, z);
    // 서쪽 차양 아래 소화기 (붉은 원통 셋)
    for (const z of [d * 0.2, d * 0.26, d * 0.32]) {
      k.cyl(C.extinguisher, 0.09, 0.5, [-w / 2 - 0.35, 0.12, z], { seg: 10, mat: 'gloss' });
      k.cyl(C.dark, 0.03, 0.1, [-w / 2 - 0.35, 0.62, z], { seg: 6 });
    }
  });
  // 남서 모서리 흰 창고
  k.at([SHED.center[0], TOP, SHED.center[1]], SITE_ROT_Y, () => {
    k.box(C.wall, [SHED.w, 1.55, SHED.d], [0, 0, 0], { r: 0.04 });
    k.box(C.steelLight, [SHED.w + 0.1, 0.08, SHED.d + 0.1], [0, 1.55, 0], { r: 0.02 });
    k.box(C.trim, [0.02, 1.2, SHED.d * 0.7], [-SHED.w / 2 - 0.01, 0.1, 0], { r: 0 });
  });
}

// ── 계근대·번호판 카메라 ──────────────────────────────────────────────

function weighbridge(k: Kit): void {
  const { length, width } = SCALE;
  // 로컬 +x는 계근대의 긴 방향(사진 서쪽). 동쪽 끝(−x)은 옹벽 쪽
  k.at([SCALE.center[0], TOP, SCALE.center[1]], SCALE.heading, () => {
    k.box(C.dark, [length, 0.06, width], [0, -0.01, 0], { r: 0.02, mat: 'metal' });
    for (let i = 0; i < 7; i += 1) k.box(C.steel, [0.03, 0.012, width - 0.2], [-length / 2 + 0.4 + i * ((length - 0.8) / 6), 0.05, 0], { r: 0, mat: 'metal' });
    // 노란 테두리
    k.box(C.yellow, [length + 0.12, 0.07, 0.08], [0, -0.005, -width / 2 - 0.04], { r: 0.02 });
    k.box(C.yellow, [length + 0.12, 0.07, 0.08], [0, -0.005, width / 2 + 0.04], { r: 0.02 });
    k.box(C.yellow, [0.08, 0.07, width + 0.16], [-length / 2 - 0.04, -0.005, 0], { r: 0.02 });
    k.box(C.yellow, [0.08, 0.07, width + 0.16], [length / 2 + 0.04, -0.005, 0], { r: 0.02 });
    // 서쪽 끝 고무 범퍼 (마당 쪽 오르내리는 곳)
    for (const dz of [-0.45, 0.45]) k.box(C.rubber, [0.25, 0.1, 0.7], [length / 2 + 0.2, -0.02, dz], { r: 0.03 });
    // 동쪽 끝 쇠 기둥(옹벽 앞, 도로로 못 나감)
    k.cyl(C.steel, 0.07, 1.1, [-length / 2 - 0.35, 0, width / 2 + 0.1], { seg: 10, mat: 'metal' });
  });
  const [cx, cz] = sitePx(498, 252);
  cone(k, cx, cz, 1.6);
}

// ── 압축기 건물·레일·압축기 (레일 좌표계) ─────────────────────────────

/** 레일 좌표계 로컬(x = u, z = −w)에서 사진 px의 u·w → 로컬 x·z */
const lu = (u: number) => u * S;
const lw = (w: number) => -w * S;

function houseFloor(k: Kit): void {
  const { main, annex } = BALER_HOUSE;
  k.box(C.hallFloor, [lu(main.u1 - main.u0), 0.08, (main.w1 - main.w0) * S], [lu(mid(main.u0, main.u1)), TOP, lw(mid(main.w0, main.w1))], { r: 0.02 });
  // 옆동: 닫힌 건물 (회색 벽 + 짙은 파랑 지붕)
  const aw = lu(annex.u1 - annex.u0);
  const ad = (annex.w1 - annex.w0) * S;
  const ac: Vec3 = [lu(mid(annex.u0, annex.u1)), TOP, lw(mid(annex.w0, annex.w1))];
  k.box(C.factoryWall, [aw, annex.wallH, ad], ac, { r: 0.06 });
  k.box(C.roofBlueDeep, [aw + 0.3, 0.2, ad + 0.3], [ac[0], TOP + annex.wallH, ac[2]], { r: 0.06, mat: 'gloss' });
  for (let i = 1; i < 14; i += 1) k.box(C.roofBlue, [0.05, 0.03, ad + 0.2], [ac[0] - aw / 2 + (aw * i) / 14, TOP + annex.wallH + 0.2, ac[2]], { r: 0 });
  // 옆동 벽 골판 줄과 창
  for (let x = ac[0] - aw / 2 + 0.3; x < ac[0] + aw / 2; x += 0.45) k.box(C.steel, [0.04, annex.wallH - 0.2, 0.03], [x, TOP + 0.1, ac[2] + ad / 2 + 0.015], { r: 0 });
  for (let i = 0; i < 4; i += 1) k.box(C.glass, [0.05, 0.5, 0.9], [lu(annex.u0) - 0.01, TOP + 1.6, ac[2] - ad / 2 + 1.2 + i * ((ad - 2.4) / 3)], { r: 0.02, mat: 'glass' });

  // 칠한 통로·압축기 둘레 노랑 테두리
  const y = TOP + 0.082;
  k.box(C.bluePale, [lu(main.u1 - main.u0) - 1.2, 0.012, 0.72], [lu(mid(main.u0, main.u1)), y, lw(main.w0) - 0.7], { r: 0 });
  for (const dx of [-1, 1]) k.box(C.yellow, [0.05, 0.012, BALER.backZ - BALER.outletZ], [BALER.x + dx * 1.15, y, mid(BALER.backZ, BALER.outletZ)], { r: 0 });
  // 조작반
  k.at([BALER.x + 1.6, TOP + 0.06, 0.6], Math.PI / 2, () => {
    k.box(C.wall, [0.8, 1.0, 0.36], [0, 0, 0], { r: 0.09, seg: 3 });
    edgeX(k, -0.4, 0.4, 1.0, 0.18);
    k.box(C.dark, [0.5, 0.3, 0.03], [0, 0.55, 0.19], { r: 0.02 });
    k.box('#9fd3ff', [0.42, 0.04, 0.02], [0, 0.72, 0.205], { r: 0, mat: 'glow', glow: 1.4 });
  });
  pallet(k, lu(main.u1) - 1.2, lw(main.w0) - 1.4, 0.2, TOP + 0.08);
  pallet(k, lu(main.u1) - 1.2, lw(main.w0) - 1.4, 0.2, TOP + 0.21);
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

/**
 * 길쭉한 가로형 압축기 (레일 좌표계 로컬): 뒤(+z)에 긴 유압 실린더, 레일 끝 아래 투입구·압축실, 앞(−z)으로 긴 압출 통로와 결속부가 이어져
 * 남동 벽 배출구에 닿는다. 롤러 없이 새 베일이 앞 베일을 밀어낸다(램·밀리는 베일은 Dynamic·Actors).
 */
function baler(k: Kit): void {
  const { x, minZ, maxZ, halfX, height, backZ, outletZ, strapZ } = BALER;
  const t = 0.12;
  const y0 = TOP + 0.06;
  // 받침대 (몸체 전체 길이)
  k.box(C.concreteDark, [halfX * 2 + 0.6, 0.08, backZ - outletZ + 0.2], [x, TOP, mid(backZ, outletZ)], { r: 0.03 });
  // 유압 실린더 집 (뒤쪽 긴 상자) + 실린더
  k.box(C.blue, [halfX * 2, height * 0.85, backZ - maxZ - 0.1], [x, y0, mid(backZ, maxZ + 0.1)], { r: 0.1, mat: 'gloss', seg: 3 });
  edgeX(k, x - halfX, x + halfX, y0 + height * 0.85, backZ - 0.05);
  k.cyl(C.wall, 0.22, backZ - maxZ - 0.4, [x, y0 + height * 0.85 + 0.25, mid(backZ, maxZ)], { axis: 'z', mat: 'gloss' });
  k.cyl(C.steelLight, 0.06, backZ - maxZ, [x + 0.35, y0 + height * 0.85 + 0.1, mid(backZ, maxZ)], { axis: 'z', mat: 'metal', seg: 10 });
  // 압축실: 위가 열린 상자 (바닥 + 양옆 벽)
  k.box(C.dark, [halfX * 2, 0.1, maxZ - minZ], [x, y0, mid(minZ, maxZ)], { r: 0.02 });
  for (const dx of [-1, 1]) k.box(C.blue, [t, height, maxZ - minZ], [x + dx * (halfX - t / 2), y0, mid(minZ, maxZ)], { r: 0.05, mat: 'gloss' });
  // 투입구 깔때기
  const rim = height + y0;
  const flare = 0.34;
  k.box(C.steelLight, [0.05, 0.5, maxZ - minZ - 0.1], [x - halfX - 0.08, rim - 0.04, mid(minZ, maxZ)], { r: 0.02, rot: [0, 0, flare], mat: 'metal' });
  k.box(C.steelLight, [0.05, 0.5, maxZ - minZ - 0.1], [x + halfX + 0.08, rim - 0.04, mid(minZ, maxZ)], { r: 0.02, rot: [0, 0, -flare], mat: 'metal' });
  k.box(C.steelLight, [halfX * 2 + 0.1, 0.5, 0.05], [x, rim - 0.04, maxZ + 0.08], { r: 0.02, rot: [-flare, 0, 0], mat: 'metal' });
  // 압출 통로: 압축실 앞에서 배출구까지 낮고 긴 터널 (위 덮개 + 양옆 벽, 앞쪽에 띠 틀)
  const tz0 = minZ;
  const tz1 = outletZ + 0.25;
  // 통로 높이는 베일(BALER_TUNNEL): 안쪽 바닥이 받침대 윗면, 지붕이 베일 위 (S2k)
  const roof = BALER_TUNNEL.roofY - y0;
  for (const dx of [-1, 1]) k.box(C.blue, [t, roof + 0.1, tz0 - tz1], [x + dx * (halfX - t / 2), y0, mid(tz0, tz1)], { r: 0.04, mat: 'gloss' });
  k.box(C.blue, [halfX * 2, 0.1, tz0 - tz1], [x, y0 + roof, mid(tz0, tz1)], { r: 0.04, mat: 'gloss' });
  k.box(C.dark, [halfX * 2 - 0.2, 0.06, tz0 - tz1], [x, BALER_TUNNEL.floorY - 0.06, mid(tz0, tz1)], { r: 0.01 });
  for (let z = tz0 - 0.4; z > tz1; z -= 0.6) k.box(C.blueDeep, [halfX * 2 + 0.08, roof + 0.17, 0.08], [x, y0 - 0.02, z], { r: 0.02, mat: 'gloss' });
  // 결속부: 파랑 문형 틀과 끈 타래 (통로 위)
  const sz = mid(strapZ, minZ);
  for (const dx of [-1, 1]) k.box(C.blue, [0.14, 1.6, 0.5], [x + dx * (halfX + 0.05), y0, sz], { r: 0.06, mat: 'gloss', seg: 3 });
  k.box(C.blue, [halfX * 2 + 0.24, 0.16, 0.5], [x, y0 + 1.55, sz], { r: 0.06, mat: 'gloss', seg: 3 });
  for (const dx of [-0.36, 0, 0.36]) {
    k.cyl(C.yellow, 0.15, 0.1, [x + dx, y0 + 1.87, sz], { axis: 'x', mat: 'gloss' });
    k.cyl(C.steel, 0.05, 0.14, [x + dx, y0 + 1.87, sz], { axis: 'x' });
  }
  // 배출구 테두리 (노랑)
  k.box(C.yellow, [halfX * 2 + 0.3, 0.08, 0.07], [x, y0 + roof + 0.07, outletZ + 0.2], { r: 0.02 });
}

/** 본동 벽 네 장 (레일 좌표계 로컬). 벽마다 따로 조립해 카메라 쪽 벽을 숨길 수 있게 한다. 회색 벽 + 파랑 지붕선 */
function houseWalls(footprints: Footprint[]): Wall[] {
  const { main } = BALER_HOUSE;
  const h = main.wallH;
  const T = 0.22;
  const u0 = lu(main.u0);
  const u1 = lu(main.u1);
  const zNW = lw(main.w0);
  const zSE = lw(main.w1);
  const make = (build: (k: Kit) => void, name: string): Group => {
    const k = new Kit();
    k.footprints = footprints;
    k.at([0, TOP, 0], RAIL_FRAME.heading, () => build(k));
    return k.build(name);
  };
  const glass = (k: Kit, along: 'x' | 'z', fixed: number, from: number, to: number) => {
    const len = to - from;
    const c = mid(from, to);
    if (along === 'x') k.box(C.glass, [len, 0.6, 0.06], [c, h - 0.95, fixed], { r: 0.02, mat: 'glass' });
    else k.box(C.glass, [0.06, 0.6, len], [fixed, h - 0.95, c], { r: 0.02, mat: 'glass' });
  };
  const ribsX = (k: Kit, fixed: number, from: number, to: number, out: number) => {
    for (let x = from + 0.2; x < to; x += 0.45) k.box(C.steel, [0.04, h - 0.15, 0.03], [x, 0.05, fixed + out * 0.12], { r: 0 });
  };
  const ribsZ = (k: Kit, fixed: number, from: number, to: number, out: number) => {
    for (let z = from + 0.2; z < to; z += 0.45) k.box(C.steel, [0.03, h - 0.15, 0.04], [fixed + out * 0.12, 0.05, z], { r: 0 });
  };
  // 북동 벽(u0): 레일이 들어가는 구멍
  const railZ0 = -RAIL.width / 2 - 0.25;
  const railZ1 = RAIL.width / 2 + 0.25;
  const ne = make((k) => {
    k.box(C.factoryWall, [T, h, zNW - railZ1], [u0, 0, mid(railZ1, zNW)], { r: 0.04 });
    k.box(C.factoryWall, [T, h, railZ0 - zSE], [u0, 0, mid(zSE, railZ0)], { r: 0.04 });
    k.box(C.factoryWall, [T, 0.9, railZ1 - railZ0], [u0, 0, 0], { r: 0.04 });
    k.box(C.factoryWall, [T, h - 2.75, railZ1 - railZ0], [u0, 2.75, 0], { r: 0.04 });
    k.box(C.blue, [T + 0.04, 0.1, zNW - zSE + T], [u0, h, mid(zSE, zNW)], { r: 0.04, mat: 'gloss' });
    ribsZ(k, u0, railZ1, zNW, -1);
    ribsZ(k, u0, zSE, railZ0, -1);
    glass(k, 'z', u0, railZ1 + 0.3, zNW - 0.3);
  }, 'wall-ne');
  // 남동 벽(w1): 베일 배출구
  const gapL = BALER.x - 0.85;
  const gapR = BALER.x + 0.85;
  const se = make((k) => {
    k.box(C.factoryWall, [gapL - u0, h, T], [mid(u0, gapL), 0, zSE], { r: 0.04 });
    k.box(C.factoryWall, [u1 - gapR, h, T], [mid(gapR, u1), 0, zSE], { r: 0.04 });
    k.box(C.factoryWall, [gapR - gapL + 0.1, h - 1.35, T], [BALER.x, 1.35, zSE], { r: 0.04 });
    k.box(C.blue, [u1 - u0 + T, 0.1, T + 0.04], [mid(u0, u1), h, zSE], { r: 0.04, mat: 'gloss' });
    ribsX(k, zSE, gapR, u1, -1);
    edgeX(k, gapL, gapR, 1.33, zSE - 0.13);
    glass(k, 'x', zSE, gapR + 0.4, u1 - 0.4);
  }, 'wall-se');
  const sw = make((k) => {
    k.box(C.factoryWall, [T, h, zNW - zSE + T], [u1, 0, mid(zSE, zNW)], { r: 0.04 });
    k.box(C.blue, [T + 0.04, 0.1, zNW - zSE + T], [u1, h, mid(zSE, zNW)], { r: 0.04, mat: 'gloss' });
    ribsZ(k, u1, zSE, zNW, 1);
  }, 'wall-sw');
  const nw = make((k) => {
    k.box(C.factoryWall, [u1 - u0 + T, h, T], [mid(u0, u1), 0, zNW], { r: 0.04 });
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

/** 본동의 파란 지붕 + 지붕 위 파란 물탱크 (멀리서는 사진처럼 덮여 보이고, 가까이 오면 걷는다) */
function houseRoof(): Group {
  const { main } = BALER_HOUSE;
  const k = new Kit('gloss');
  k.at([0, TOP, 0], RAIL_FRAME.heading, () => {
    const w = lu(main.u1 - main.u0) + 0.4;
    const d = (main.w1 - main.w0) * S + 0.4;
    const c: Vec3 = [lu(mid(main.u0, main.u1)), main.wallH + 0.05, lw(mid(main.w0, main.w1))];
    k.box(C.roofBlue, [w, 0.16, d], c, { r: 0.07, seg: 3 });
    for (let i = 1; i < 16; i += 1) k.box(C.roofBlueDeep, [0.05, 0.02, d - 0.3], [c[0] - w / 2 + (w * i) / 16, main.wallH + 0.21, c[2]], { r: 0 });
    // 물탱크: 다리 넷 + 파란 원통
    const tx = lu(WATER_TANK.u);
    const tz = lw(WATER_TANK.w);
    for (const [dx, dz] of [
      [-0.45, -0.45],
      [0.45, -0.45],
      [-0.45, 0.45],
      [0.45, 0.45],
    ] as const) {
      k.box(C.steel, [0.08, 0.7, 0.08], [tx + dx, main.wallH + 0.2, tz + dz], { r: 0.01, mat: 'metal' });
    }
    k.cyl(C.blue, 0.72, 1.3, [tx, main.wallH + 0.9, tz], { seg: 18 });
    k.cyl(C.blueDeep, 0.74, 0.1, [tx, main.wallH + 2.2, tz], { seg: 18 });
  });
  return k.build('house-roof');
}

// ── 배출 받침대·베일 저울 (마당 좌표계) ────────────────────────────────

function standAndScale(k: Kit): void {
  const { stand, scale } = YARD;
  k.at([YARD_FRAME.x, TOP, YARD_FRAME.z], YARD_FRAME.rotY, () => {
    // 금속 받침대: 배출구에서 마당 쪽으로 베일 세 개 길이. 다리 + 양옆 레일 + 가로 받침 (롤러 없음)
    const z0 = stand.outletZ;
    const z1 = stand.outletZ + stand.length;
    const half = BALE.w / 2 + 0.06;
    for (const dx of [-1, 1]) {
      k.box(C.steel, [0.08, 0.1, z1 - z0], [stand.x + dx * half, stand.y - 0.1, mid(z0, z1)], { r: 0.01, mat: 'metal' });
      for (let z = z0 + 0.15; z < z1; z += 0.75) k.box(C.steel, [0.07, stand.y - 0.1, 0.07], [stand.x + dx * half, 0, z], { r: 0.01, mat: 'metal' });
    }
    for (let z = z0 + 0.2; z < z1; z += 0.45) k.box(C.steelLight, [half * 2, 0.05, 0.08], [stand.x, stand.y - 0.05, z], { r: 0.01, mat: 'metal' });
    // 끝 멈춤 턱 (노랑)
    k.box(C.yellow, [half * 2 + 0.1, 0.18, 0.06], [stand.x, stand.y - 0.05, z1 + 0.03], { r: 0.02 });
    // 베일 저울: 낮은 판 + 노란 테두리 + 표시 기둥(숫자 없음)
    const s = scale.size;
    k.box(C.dark, [s, scale.y, s], [scale.x, 0, scale.z], { r: 0.02, mat: 'metal' });
    k.box(C.steelLight, [s - 0.12, 0.02, s - 0.12], [scale.x, scale.y - 0.01, scale.z], { r: 0, mat: 'metal' });
    for (const [dx, dz, w, d] of [
      [0, s / 2, s + 0.08, 0.06],
      [0, -s / 2, s + 0.08, 0.06],
      [s / 2, 0, 0.06, s + 0.08],
      [-s / 2, 0, 0.06, s + 0.08],
    ] as const) {
      k.box(C.yellow, [w, 0.05, d], [scale.x + dx, scale.y - 0.02, scale.z + dz], { r: 0.01 });
    }
    k.cyl(C.steel, 0.04, 1.1, [scale.x - s / 2 - 0.25, 0, scale.z - s / 2], { seg: 8, mat: 'metal' });
    k.box(C.wall, [0.2, 0.28, 0.1], [scale.x - s / 2 - 0.25, 1.1, scale.z - s / 2], { r: 0.03 });
  });
}

// ── 베일 블록: 북서 재고 뒤쪽, 남동 북동 날개, 북쪽 숲 경계 줄 (같은 방향·같은 간격, 4~5단) ──


/** 바탕 베일 칸(layout의 staticBaleCells)을 층마다 쌓는다. 모양은 지게차가 옮기는 베일과 같다(props의 bale) */
function baleBlocks(k: Kit, cells: readonly StaticBaleCell[]): void {
  for (const c of cells) {
    const [wx, wz] = yardPoint(c.x, c.z);
    for (let l = 0; l < c.levels; l += 1) bale(k, wx, TOP + 0.06 + l * BALE.h, wz, YARD_FRAME.rotY - Math.PI / 2, LITE);
  }
}

function bales(k: Kit): void {
  baleBlocks(k, staticBaleCells('nw'));
  baleBlocks(k, staticBaleCells('se'));
  // 북쪽 그물망 곁 숲 경계 줄 (3단)
  const [a, b] = NORTH_ROW_PX.map(([x, y]) => sitePx(x, y));
  const len = Math.hypot(b![0] - a![0], b![1] - a![1]);
  const rot = Math.atan2(-(b![1] - a![1]), b![0] - a![0]);
  for (let s = 0.5; s < len; s += BALE.d + BALE_GAP) {
    const p: P2 = [a![0] + ((b![0] - a![0]) * s) / len, a![1] + ((b![1] - a![1]) * s) / len];
    for (let l = 0; l < 3; l += 1) bale(k, p[0], TOP + 0.06 + l * BALE.h, p[1], rot, LITE);
  }
}

/** 남동 칸 줄·북서 칸 줄 앞 칠한 표시: 칸 테두리(가는 노랑), 지게차 길(노랑 점선), 대기 자리(가는 파랑) */
function yardMarks(k: Kit): void {
  const y = TOP + 0.066;
  k.at([YARD_FRAME.x, 0, YARD_FRAME.z], YARD_FRAME.rotY, () => {
    for (const [xs, z] of [
      [YARD.seXs, YARD.slotZ],
      [YARD.nwXs, YARD.nwSlotZ],
    ] as const) {
      for (const x of xs) {
        k.box(C.yellow, [BALE.w + 0.04, 0.012, 0.035], [x, y, z + BALE.d / 2 + 0.04], { r: 0 });
        k.box(C.yellow, [BALE.w + 0.04, 0.012, 0.035], [x, y, z - BALE.d / 2 - 0.04], { r: 0 });
      }
    }
    for (let x = YARD.laneStart + 0.4; x < YARD.laneEnd - 0.3; x += 0.9) k.box(C.yellow, [0.45, 0.012, 0.06], [x + 0.22, y, YARD.laneZ + 0.75], { r: 0 });
    for (let x = YARD.nwXs[0]! - 0.4; x < YARD.nwLaneEnd - 0.3; x += 0.9) k.box(C.yellow, [0.45, 0.012, 0.06], [x + 0.22, y, YARD.nwLaneZ + 0.75], { r: 0 });
    for (const [hx, hz] of YARD.homes) {
      for (const dx of [-0.62, 0.62]) k.box(C.blue, [0.04, 0.014, 2.0], [hx + dx, y, hz - 0.2], { r: 0 });
    }
  });
}

/** 섹터 더미 둘레의 낮은 턱 (칸막이 없는 노천 더미: 바닥 경계만 표시) */
function pileKerbs(k: Kit): void {
  for (const id of TANK_IDS) {
    const poly = PILES[id];
    for (let i = 0; i < poly.length; i += 1) seg(k, C.concreteDark, poly[i]!, poly[(i + 1) % poly.length]!, 0.14, TOP + 0.04, 0.06);
  }
}

const yardTmp = { x: 0, z: 0 };
/** 남동 지게차 길·받침대·저울·지게차 대기 자리 근처인가 (마당 좌표) */
function nearYardLane(p: P2): boolean {
  const { x, z } = worldToYard(p[0], p[1], yardTmp);
  if (YARD.homes.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3.2)) return true;
  return x > YARD.stand.x - 2.5 && x < YARD.laneEnd + 1 && z > YARD.laneZ - 5 && z < YARD.laneZ + 1.5;
}

/** 흩어진 파지 조각: 섹터 더미 둘레 띠 (합친 메시 하나). 지게차 자리·새 베일이 나오는 받침대 쪽에는 두지 않는다 */
function debris(k: Kit): void {
  const rnd = random(731);
  const tones = [C.paper, C.kraftLight, C.paperGrey, C.kraft, C.white];
  let placed = 0;
  for (const sign of [-1, 1]) {
    const pile = sign < 0 ? PILES['sector-a'] : PILES['sector-c'];
    for (let i = 0; i < (LITE ? 260 : 520) && placed < 900; i += 1) {
      const u = -52 + rnd() * 74;
      const w = 6 + rnd() * 92;
      const [px, py] = railToPhoto(u, sign * w);
      const p = sitePx(px, py);
      if (inside(p, pile)) continue;
      // 레일 밑·건물 안·저울 쪽은 비운다
      if (w < 9 || u > 22) continue;
      // 지게차 대기 자리·받침대 앞 길·건물 뒤 숲은 비운다 (S2h #9)
      if (nearYardLane(p) || FORESTS.some((f) => inside(p, f))) continue;
      const s = 0.12 + rnd() * 0.18;
      k.box(tones[i % tones.length]!, [s * 1.4, 0.03, s], [p[0], TOP + 0.04, p[1]], { r: 0, rot: [0, rnd() * Math.PI, 0] });
      placed += 1;
    }
  }
}

function utilities(k: Kit): void {
  // 마당 가로등 (트럭·지게차 길을 피한 자리, `LAMP_PX`)
  for (const [x, y, rot] of LAMP_PX) {
    const [wx, wz] = sitePx(x, y);
    lamp(k, wx, wz, rot + SITE_ROT_Y);
  }
}

/** 고정물 전체. lite(low 단계)는 같은 배치를 더 적은 삼각형으로 그린다 (나무·언덕·능선·베일 띠·파지 조각) */
export function buildWorld(lite = false): World {
  LITE = lite;
  const footprints: Footprint[] = [];
  const k = new Kit();
  k.footprints = footprints;
  ground(k);
  retainingWall(k);
  boundaries(k);
  poles(k);
  forest(k);
  hills(k);
  office(k);
  weighbridge(k);
  pileKerbs(k);
  debris(k);
  bales(k);
  yardMarks(k);
  standAndScale(k);
  utilities(k);
  k.at([0, 0, 0], RAIL_FRAME.heading, () => {
    houseFloor(k);
    rail(k);
    baler(k);
  });
  const { main } = BALER_HOUSE;
  const houseCenter = railPx(mid(main.u0, main.u1), mid(main.w0, main.w1));
  return { base: k.build('world'), walls: houseWalls(footprints), roof: houseRoof(), houseCenter, footprints };
}
