import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, TankId } from '@ecocycle/shared';
import { DEMO_CYCLE, TANK_BASE_DEG } from '../../config/robotCycle';
import { YARD_FLOW } from '../../config/yard';
import { chainSpecFor } from '../robot/chain';
import { tipPosition } from '../robot/kinematics';
import type { P2 } from '../sim/paths';
import type { V3 } from './views';

// 카메라 지역(views.ts)은 three 없이 패널도 읽으므로 따로 두고 여기서 다시 내보낸다
export * from './views';

// 3D 홈(스튜디오) 월드의 배치. 실제 부지의 위성사진(613×616px, 위가 북쪽)과 현장 사진 6장을 따른다
// (docs/decisions.md 2026-11-24 "실제 부지 배치와 섹터 2곳", 2026-11-25 "현장 사진 기준 3D 다듬기").
// 좌표: Y가 위, 로봇 받침대가 원점. 방향(heading)은 three의 rotation.y와 같다: 0이면 +X, 앞 방향은 (cos h, −sin h).
//
// ── 사진 → 월드 변환 (하나뿐이다: sitePx) ─────────────────────────────
// 닮음 변환(같은 배율 + 회전 + 평행 이동, 뒤집기 없음). 사진 좌표는 x가 오른쪽(동), y가 아래(남)다.
//  - 기준점 1: 로봇 자리(지금의 포크레인 자리, 사진 빨간 원) (200, 385)px → 월드 원점.
//  - 기준점 2: 레일이 압축기 건물로 들어가는 곳(사진 파란 선 끝) (152, 428)px.
//    로봇 → 기준점 2의 방향(남서)이 레일 쪽 base 각도 θc = DEMO_CYCLE.conveyorBaseDeg(150°)의 3D 방향 (cos θc, −sin θc)에 오도록 돌린다.
//  - 배율: 1px = 0.072 (월드 단위). 위성사진에서 잰 값(같은 정합 변환):
//    베일 줄 간격 13.3 × 13.8px(자기상관), 화물차 62.5px, 계근대 66.9px. 배율 0.072에서 베일(0.90 × 0.95, 틈 0.06)의 간격이 13.3 × 14.0px다.
//    장면의 트럭 모형은 베일에 비해 짧아서 배율 하나로는 함께 맞지 않는다: 트럭은 모형을 1.4배(4.06 × 1.62 = 56 × 22.5px, 계근대 안)로,
//    지게차는 큰 베일을 드니 1.15배로 키웠다. 로봇 배율(1.6)은 그대로다(집는 반지름 2.61 = 36px).
//  - 뒤집지 않는다: 사진 (x, y) → (X, Z)는 위에서 내려다본 화면(+X 오른쪽, −Z 위)과 같은 손잡이라 회전만 하면 된다.
//    섹터 A(사진 북서 갈색 더미)는 레일을 볼 때 오른쪽(θc − 90°), C(남동 흰 더미)는 왼쪽(θc + 90°)이다 (config/robotCycle).
// 부지 요소는 모두 사진 좌표로 적고 sitePx로 옮긴다. 로봇이 집는 자리·놓는 자리만은 서버 관절 값(base 각도, 모의 서버와 같은 down 자세)에서 나온다.
//
// ── 높이 ──────────────────────────────────────────────────────────────
// 마당과 계근대 단(사무실 앞)은 높이 0이다. 동쪽 도로는 그보다 낮고(북쪽이 가장 낮다) 남쪽으로 오른다. 도로 쪽은 블록 옹벽 + 쇠 난간이고,
// 차는 입구 경사로 한 곳으로만 드나든다(옛 입구 자리, 막는 팔 없이 열려 있다). 높이는 groundY가 정한다(트럭·작업자가 밟는 높이).

const DEG = Math.PI / 180;

/** 사진 크기(px) */
export const PHOTO = { width: 613, height: 616 } as const;
/** 사진 1px의 월드 길이 */
export const SITE_SCALE = 0.072;
/** 변환의 기준점 (사진 px): 로봇 자리, 레일이 건물로 들어가는 곳 */
export const SITE_ANCHORS = { robot: [200, 385] as P2, railEntry: [152, 428] as P2 } as const;

const photoHeading = (dx: number, dy: number): number => Math.atan2(-dy, dx);
/** 사진 방향(라디안, x축에서 북쪽으로 잰 각) → 월드 방향에 더하는 회전 */
export const SITE_ROTATION =
  DEMO_CYCLE.conveyorBaseDeg * DEG - photoHeading(SITE_ANCHORS.railEntry[0] - SITE_ANCHORS.robot[0], SITE_ANCHORS.railEntry[1] - SITE_ANCHORS.robot[1]);
const COS = Math.cos(SITE_ROTATION);
const SIN = Math.sin(SITE_ROTATION);

/** 사진 좌표(px) → 월드 바닥 좌표 (x, z) */
export function sitePx(x: number, y: number): P2 {
  const dx = x - SITE_ANCHORS.robot[0];
  const dy = y - SITE_ANCHORS.robot[1];
  return [(dx * COS + dy * SIN) * SITE_SCALE, (-dx * SIN + dy * COS) * SITE_SCALE];
}

/** 월드 바닥 좌표 → 사진 좌표(px) (점검·시험용) */
export function worldToPx(x: number, z: number): P2 {
  const X = x / SITE_SCALE;
  const Z = z / SITE_SCALE;
  return [X * COS - Z * SIN + SITE_ANCHORS.robot[0], X * SIN + Z * COS + SITE_ANCHORS.robot[1]];
}

/**
 * 월드 바닥 점을 부지(사진 사각형 0~613 × 0~616px) 안으로 들인다: 사진 좌표로 되돌려 사각형에 맞춘 뒤 다시 월드로.
 * 카메라를 끌어 옮길 때 보는 점이 부지 밖으로 나가지 않게 쓴다(사각형 가장자리를 따라 미끄러지므로 움직임이 끊기지 않는다)
 */
export function clampToSite(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  const [px, py] = worldToPx(x, z);
  const [cx, cz] = sitePx(Math.min(PHOTO.width, Math.max(0, px)), Math.min(PHOTO.height, Math.max(0, py)));
  out.x = cx;
  out.z = cz;
  return out;
}

/** 사진에서 (dx, dy) 쪽을 보는 방향 → 월드 방향(라디안) */
export const siteHeading = (dx: number, dy: number): number => photoHeading(dx, dy) + SITE_ROTATION;
/** 사진 축에 맞춘 상자를 월드에 놓을 때의 회전(rotation.y) */
export const SITE_ROT_Y = SITE_ROTATION;

const pts = (list: ReadonlyArray<readonly [number, number]>): P2[] => list.map(([x, y]) => sitePx(x, y));

/** 점이 다각형 안에 있는가 (바닥 x, z 또는 사진 px) */
export function inside(p: P2, poly: readonly P2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

// ── 로봇과 집는·놓는 자리 ─────────────────────────────────────────────

export const ROBOT = { scale: 1.6, pedestalH: 0.8, pedestalR: 0.62 } as const;

const DOWN = (baseDeg: number): number[] => [baseDeg, 45, -70, 0, 25, 0];

function tip(baseDeg: number): [number, number, number] {
  const t = tipPosition(chainSpecFor(), DOWN(baseDeg));
  return [t.x * ROBOT.scale, ROBOT.pedestalH + t.y * ROBOT.scale, t.z * ROBOT.scale];
}

/** 로봇이 각 섹터에서 집는 자리 (공구 끝) */
export const PICK: Record<TankId, [number, number, number]> = {
  'sector-a': tip(TANK_BASE_DEG['sector-a']),
  'sector-c': tip(TANK_BASE_DEG['sector-c']),
};
/** 로봇이 레일에 놓는 자리 */
export const PLACE = tip(DEMO_CYCLE.conveyorBaseDeg);

export { SECTOR_LABEL } from '../../config/processDisplay';

// ── 레일 좌표계 ───────────────────────────────────────────────────────

/**
 * 레일 좌표계: 로봇이 원점, +u는 레일 방향(로봇 → 건물, 3D 방향 θc), +w는 섹터 C 쪽(θc + 90°, 사진 남동).
 * 사진의 파란 지붕 건물은 벽이 레일과 직각·평행이라 이 좌표계의 상자로 적는다(값은 사진 px를 이 축에 잰 것).
 * 섹터 더미 둘은 이 좌표계에서 w를 뒤집은 거울 대칭이다(A: −w, C: +w).
 */
const RAIL_H = DEMO_CYCLE.conveyorBaseDeg * DEG;
export const RAIL_FRAME = { heading: RAIL_H, u: [Math.cos(RAIL_H), -Math.sin(RAIL_H)] as P2, w: [Math.cos(RAIL_H + Math.PI / 2), -Math.sin(RAIL_H + Math.PI / 2)] as P2 };
// 레일 좌표계로 조립할 때(Kit.at(원점, RAIL_H)) 로컬 x는 u, 로컬 z는 −w다 (rotation.y는 로컬 +z를 θc − 90° 쪽으로 돌린다).

/** 레일 좌표계(u, w, 사진 px 단위) → 월드 */
export function railPx(u: number, w: number): P2 {
  const su = u * SITE_SCALE;
  const sw = w * SITE_SCALE;
  return [RAIL_FRAME.u[0] * su + RAIL_FRAME.w[0] * sw, RAIL_FRAME.u[1] * su + RAIL_FRAME.w[1] * sw];
}

/** 레일 좌표계(월드 단위) → 월드 */
export function railAt(u: number, w: number): P2 {
  return [RAIL_FRAME.u[0] * u + RAIL_FRAME.w[0] * w, RAIL_FRAME.u[1] * u + RAIL_FRAME.w[1] * w];
}

/** 사진 위의 레일 방향(로봇 → 레일 끝, 단위 벡터) */
const PU: P2 = (() => {
  const dx = SITE_ANCHORS.railEntry[0] - SITE_ANCHORS.robot[0];
  const dy = SITE_ANCHORS.railEntry[1] - SITE_ANCHORS.robot[1];
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len];
})();
/** 레일 좌표계(u, w, 사진 px) → 사진 px */
export function railToPhoto(u: number, w: number): P2 {
  return [SITE_ANCHORS.robot[0] + u * PU[0] + w * PU[1], SITE_ANCHORS.robot[1] + u * PU[1] - w * PU[0]];
}

// ── 부지 (사진 테두리)와 지형 ─────────────────────────────────────────

/** 사진 네 모서리(부지 판)의 월드 좌표 */
export const SITE_CORNERS: readonly P2[] = pts([
  [0, 0],
  [PHOTO.width, 0],
  [PHOTO.width, PHOTO.height],
  [0, PHOTO.height],
]);

/** 부지를 감싸는 월드 상자 (카메라가 이 밖으로 나가지 않게, 미리 굽는 그림자의 범위) */
export const SITE = {
  minX: Math.min(...SITE_CORNERS.map((p) => p[0])),
  maxX: Math.max(...SITE_CORNERS.map((p) => p[0])),
  minZ: Math.min(...SITE_CORNERS.map((p) => p[1])),
  maxZ: Math.max(...SITE_CORNERS.map((p) => p[1])),
} as const;

/** 부지의 가운데 (사진 가운데) */
export const SITE_CENTER = sitePx(PHOTO.width / 2, PHOTO.height / 2);

/** 동쪽 도로의 가운데 선 (사진 px: 북쪽 밖에서 들어와 남서쪽 밖으로). 폭은 두 차로 */
export const ROAD_PX: readonly P2[] = [
  [610, -90],
  [592, 0],
  [566, 110],
  [548, 200],
  [530, 300],
  [512, 385],
  [495, 440],
  [465, 480],
  [400, 530],
  [300, 616],
  [250, 660],
];
export const ROAD = { line: pts(ROAD_PX), width: 2.6, lane: 0.62 } as const;

/**
 * 도로 가운데 선에서 옆으로 offset px 떨어진 점(사진 y px에서). offset > 0이면 동쪽(들판 쪽), < 0이면 서쪽(부지 쪽)
 */
export function roadSidePx(py: number, offset: number): P2 {
  let i = 0;
  while (i < ROAD_PX.length - 2 && ROAD_PX[i + 1]![1] < py) i += 1;
  const a = ROAD_PX[i]!;
  const b = ROAD_PX[i + 1]!;
  const t = (py - a[1]) / (b[1] - a[1]);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [a[0] + dx * t + (dy / len) * offset, py - (dx / len) * offset];
}
/** 전봇대가 도로 가운데 선에서 떨어진 거리(px): 도로 가장자리 밖 0.55 (S2h: 전에는 가운데 선 위였다) */
export const POLE_OFFSET_PX = (ROAD.width / 2 + 0.55) / SITE_SCALE;
/** 도로변 전봇대 자리(사진 px): 도로 동쪽(들판 쪽) 가장자리 밖. 차는 서쪽 차로·경사로로만 다닌다 */
export const POLE_PX: readonly P2[] = [26, 140, 244, 356, 452, 510, 580].map((py) => roadSidePx(py, POLE_OFFSET_PX));

/**
 * 마당 가로등 둘(사진 px, 팔 방향 rad). 트럭이 지나는 길·서는 자리(외곽선)에서 0.6 넘게 떨어진 곳 (S2h: 전에는 [236, 300]이
 * 섹터 A에 쏟는 트럭 안, [404, 205]가 대기 자리로 가는 트럭에 닿았다). 하나는 사무실 서쪽 벽 앞, 하나는 섹터 A 더미 북서
 */
export const LAMP_PX: ReadonlyArray<readonly [number, number, number]> = [
  [410, 198, Math.PI / 2],
  [172, 292, 0],
];

/** 도로 높이(사진 y px → 월드 높이): 북쪽이 가장 낮고 남쪽으로 오른다 (approach.png: 사무실 북동에서 남쪽이 오르막) */
const ROAD_RISE: ReadonlyArray<readonly [number, number]> = [
  [-120, -1.9],
  [0, -1.7],
  [150, -1.15],
  [306, -0.48],
  [460, -0.2],
  [700, -0.05],
];
export function roadY(py: number): number {
  const list = ROAD_RISE;
  if (py <= list[0]![0]) return list[0]![1];
  for (let i = 1; i < list.length; i += 1) {
    const [y1, h1] = list[i]!;
    const [y0, h0] = list[i - 1]!;
    if (py <= y1) return h0 + ((py - y0) / (y1 - y0)) * (h1 - h0);
  }
  return list[list.length - 1]![1];
}

/**
 * 마당·계근대 단의 윤곽(높이 0, 사진 px). 동쪽은 블록 옹벽(사무실·계근대 단 둘레와 경사로 남쪽), 남동은 회색 철판 울타리 선이다.
 * 이 밖(도로·도로 동쪽)은 도로 높이를 따른다
 */
export const PLATEAU_PX: readonly P2[] = [
  [-60, -60],
  [494, -60],
  [498, 40],
  [508, 120],
  [513, 200],
  [514, 276],
  [490, 281],
  [486, 283],
  [484, 330],
  [503, 334],
  [470, 384],
  [452, 410],
  [420, 446],
  [300, 548],
  [272, 560],
  [240, 600],
  [200, 680],
  [-60, 680],
];
export const PLATEAU = pts(PLATEAU_PX);
/** 동쪽 블록 옹벽(위에 쇠 난간): 사무실·계근대 단 둘레, 경사로 남쪽 (사진 px) */
export const WALL_PX: ReadonlyArray<readonly P2[]> = [
  [
    [494, -60],
    [498, 40],
    [508, 120],
    [513, 200],
    [514, 276],
    [490, 281],
    [486, 283],
  ],
  [
    [484, 330],
    [503, 334],
    [470, 384],
  ],
];
/** 입구 경사로(사진 px): 도로 서쪽 가장자리에서 마당으로 오른다. 차가 드나드는 유일한 곳 */
export const RAMP_PX: readonly P2[] = [
  [486, 283],
  [512, 287],
  [509, 331],
  [484, 330],
];
export const RAMP = pts(RAMP_PX);
/** 남동 회색 철판 울타리(사진 px, 울타리 안쪽에 높은 녹색 그물망) */
export const FENCE_PX: readonly P2[] = [
  [470, 384],
  [452, 410],
  [420, 446],
  [300, 548],
  [272, 560],
];
/** 높은 녹색 그물망: 북쪽(숲 경계), 남쪽(철판 울타리 안쪽과 건물까지) */
export const NET_PX: ReadonlyArray<readonly P2[]> = [
  [
    [252, 4],
    [330, 8],
    [420, 26],
    [494, 38],
  ],
  [
    [466, 380],
    [446, 406],
    [414, 441],
    [296, 541],
    [240, 566],
    [196, 583],
  ],
];

/** 바닥 높이 (트럭·작업자가 밟는 곳): 마당·단은 0, 경사로는 도로까지 기울고, 그 밖은 도로 높이 */
export function groundY(x: number, z: number): number {
  const [px, py] = worldToPx(x, z);
  if (inside([px, py], PLATEAU_PX)) return 0;
  const road = roadY(py);
  if (inside([px, py], RAMP_PX)) {
    // 경사로: 마당 가장자리(서쪽 x 485)에서 도로 가장자리(동쪽 x 511)까지
    const t = Math.min(1, Math.max(0, (px - 485) / 26));
    return road * t;
  }
  return road;
}

/** 북서쪽 숲의 테두리 (사진 px). 나무는 이 안에서 베일 적치 구역과 떨어진 곳에만 심는다 */
export const FOREST: readonly P2[] = pts([
  [-60, -60],
  [258, -60],
  [252, 0],
  [240, 60],
  [222, 110],
  [185, 182],
  [140, 220],
  [128, 262],
  [108, 292],
  [60, 302],
  [-60, 318],
]);

/**
 * 압축기 건물 뒤(남서·서쪽): 건물과 남쪽 그물망 끝 사이 빈 포장 판을 숲으로 덮는다(사진에서는 이웃 땅이라 그리지 않는다).
 * 건물 벽에서 8~13px 떨어진 선을 따른다. 바닥 높이는 마당과 같다(PLATEAU 안)
 */
export const FOREST_SW: readonly P2[] = pts([
  [-60, 318],
  [66, 300],
  [-12, 378],
  [40, 448],
  [124, 542],
  [196, 590],
  [236, 606],
  [200, 680],
  [-60, 680],
]);
/** 숲 둘(북서, 압축기 건물 뒤) */
export const FORESTS: readonly (readonly P2[])[] = [FOREST, FOREST_SW];

// ── 건물: 사무실, 계근대 ──────────────────────────────────────────────

/** 사무실("태화리싸이클링" 자리): 짙은 회색 골판 2층, 사진 축에 맞춘 상자 (415~500, 100~210)px */
export const OFFICE = { center: sitePx(457.5, 155), w: 85 * SITE_SCALE, d: 110 * SITE_SCALE, height: 4.6 } as const;
/** 사무실 남서 모서리 곁의 흰 창고 (사진 px 446~462, 212~226) */
export const SHED = { center: sitePx(454, 219), w: 16 * SITE_SCALE, d: 14 * SITE_SCALE } as const;

/**
 * 계근대(노란 테두리 철판, 사진 420~493 × 233~261px, 위성사진 실측 66.9px): 가로로 길고 동쪽 끝이 옹벽이다.
 * 차는 마당 쪽(서쪽)에서만 오르내린다: 입차 계근은 후진으로 올라 앞으로 나가고(서쪽을 봄), 출차 계근은 앞으로 올라 후진으로 내려온다(동쪽을 봄)
 */
export const SCALE = {
  center: sitePx(456.5, 247),
  /** 긴 쪽 방향(사진 동 → 서) */
  heading: siteHeading(-1, 0),
  length: 67 * SITE_SCALE,
  width: 28 * SITE_SCALE,
  /** 트럭이 서는 자리 */
  stop: sitePx(456, 247),
} as const;
/** 번호판 인식 카메라 기둥: 계근대 서남 끝(사진 415, 266px), 계근대를 본다 */
export const PLATE_CAMERA = { at: sitePx(415, 266), heading: siteHeading(1, -0.45) } as const;

// ── 압축기 건물·레일 ──────────────────────────────────────────────────

/**
 * 압축기 건물(회색 벽 + 파란 지붕의 긴 공장). 본동: u 62~150, w −60~66 (압축기·배출구), 옆동: u 33~150, w −140~−60 (사진 북서쪽의 짙은 지붕).
 * 레일은 본동의 북동 벽(u 62)으로 들어가고, 베일은 남동 벽(w 66)의 북동 끝(u 80)으로 나온다.
 */
export const BALER_HOUSE = {
  main: { u0: 62, u1: 150, w0: -60, w1: 66, wallH: 3.4 },
  annex: { u0: 33, u1: 150, w0: -140, w1: -60, wallH: 3.0 },
} as const;
/** 지붕 위 파란 물탱크 (레일 좌표 px) */
export const WATER_TANK = { u: 128, w: -30 } as const;

/**
 * 압축기: 길쭉한 가로형 (레일 좌표계로 조립한 로컬 좌표: x = u, z = −w, 월드 단위).
 * 뒤쪽(+z, w −45px)에 유압 실린더, 레일 끝 아래(z 0 근처)에 투입구·압축실, 앞쪽(−z)으로 긴 압출 통로와 결속부가 이어져
 * 남동 벽(w 66) 배출구에 닿는다. 롤러 없이 새 베일이 앞 베일을 밀어낸다.
 */
export const BALER = {
  x: 80 * SITE_SCALE,
  halfX: 0.62,
  /** 몸체가 끝나는 곳 (뒤 +z) */
  backZ: 45 * SITE_SCALE,
  minZ: -0.75,
  maxZ: 0.75,
  height: 1.15,
  /** 결속부가 끝나는 곳, 배출구(남동 벽) */
  strapZ: -2.6,
  outletZ: -66 * SITE_SCALE,
  chuteY: 0.55,
} as const;

/** 경사 레일: 로봇이 놓는 자리 아래에서 시작해 건물 안 압축기 투입구 위까지 오른다 (u는 레일 좌표계, 월드 단위) */
export const RAIL = {
  startU: Math.hypot(PLACE[0], PLACE[2]) - 0.55,
  endU: BALER.x - 0.15,
  startY: PLACE[1] - 0.22,
  endY: 2.35,
  width: 0.95,
} as const;
/** 레일 길이(비탈면을 따라), 기울기(라디안) */
export const RAIL_LEN = Math.hypot(RAIL.endU - RAIL.startU, RAIL.endY - RAIL.startY);
export const RAIL_SLOPE = Math.atan2(RAIL.endY - RAIL.startY, RAIL.endU - RAIL.startU);
/** 레일 위 u(수평 거리)에서의 벨트 윗면 높이 */
export const railY = (u: number): number => RAIL.startY + ((u - RAIL.startU) / (RAIL.endU - RAIL.startU)) * (RAIL.endY - RAIL.startY);

/** 베일 (긴 쪽 d가 로컬 X). 사진의 줄 간격(13.3 × 13.8px)에 맞춘 크기와 틈 */
export const BALE = { w: 0.9, h: 0.66, d: 0.95 } as const;
export const BALE_GAP = 0.06;
/** 베일이 배출구로 나오는 방향 (+w) */
export const CHUTE_HEADING = RAIL_H + Math.PI / 2;

/**
 * 지게차 모형 배율(몸체). 2026-11-26 S2h: 부지(도로 폭·계근대·건물)에 비해 커서 1.15 → 0.9로 줄였다.
 * 베일 클램프(마스트 앞 틀·양옆 판)는 베일 크기(0.9 × 0.95)에 맞춰야 하므로 몸체와 따로 CLAMP_SCALE배로 그린다
 * (실제 베일 클램프도 판이 몸체보다 넓다). 클램프 틀은 줄인 마스트 앞에 붙도록 CLAMP_SHIFT만큼 뒤로 당긴다
 */
export const FORKLIFT_SCALE = 0.9;
/** 베일 클램프 배율: 판 사이 0.955(베일 폭 0.9), 판 길이 0.87(베일 길이 0.95) */
export const CLAMP_SCALE = 1.15;
/** 클램프 틀(모형 x 0.6)이 몸체 배율과 클램프 배율의 차이로 앞으로 나가는 만큼을 당긴다 (월드 m) */
export const CLAMP_SHIFT = 0.6 * (CLAMP_SCALE - FORKLIFT_SCALE);
/** 지게차가 클램프로 베일을 드는 거리(지게차 중심 → 베일 중심) */
export const FORK_REACH = 1.1 * CLAMP_SCALE - CLAMP_SHIFT;

// ── 섹터 더미 ─────────────────────────────────────────────────────────

/**
 * 노천 파지 더미(칸막이 없음). 사진의 로봇 양옆 큰 파지 더미(갈색 A, 흰 C) 크기로, 레일 축에 거울 대칭이다:
 * 레일 좌표 (u, w) 윤곽 하나를 A는 (u, −w), C는 (u, +w)로 놓는다. 중심 (u −10, |w| 45)px, 로봇이 집는 점(u 0, |w| 36px)을 품는다.
 * 레일(w 0)·옆동(u ≥ 33)·저울(u ≥ 50)과 떨어지게 다듬었다. 높이는 서버 적재율(fillPercent)로 정한다
 */
export const PILE_UW: readonly P2[] = [
  [-36, 16],
  [-14, 13],
  [8, 15],
  [20, 30],
  [22, 52],
  [14, 72],
  [-4, 82],
  [-28, 80],
  [-40, 58],
  [-42, 34],
];
export const PILE_PX: Record<TankId, readonly P2[]> = {
  'sector-a': PILE_UW.map(([u, w]) => railToPhoto(u, -w)),
  'sector-c': PILE_UW.map(([u, w]) => railToPhoto(u, w)),
};
export const PILES: Record<TankId, readonly P2[]> = { 'sector-a': pts(PILE_PX['sector-a']), 'sector-c': pts(PILE_PX['sector-c']) };
/** 더미의 가장 높은 곳 (적재율 100%) */
export const PILE_MAX_H = 1.9;

// ── 베일 적치 구역 ────────────────────────────────────────────────────

/** 북서 구역(ㄱ자, 적치 재고: 상차는 여기서)과 남동 구역(ㄴ자, 새 베일을 쌓는 곳)의 윤곽 (사진 노랑 표시) */
export const BALE_AREA_PX = {
  nw: [
    [262, 22],
    [292, 40],
    [346, 72],
    [345, 92],
    [320, 122],
    [316, 168],
    [300, 196],
    [268, 232],
    [248, 240],
    [232, 232],
    [232, 250],
    [212, 262],
    [176, 266],
    [148, 248],
    [146, 226],
    [190, 188],
    [225, 140],
    [232, 98],
  ] as readonly P2[],
  se: [
    [392, 330],
    [447, 368],
    [440, 402],
    [421, 441],
    [396, 461],
    [300, 541],
    [284, 546],
    [250, 495],
    [246, 480],
    [325, 410],
    [366, 410],
    [386, 396],
    [384, 345],
  ] as readonly P2[],
};
export const BALE_AREAS = { nw: pts(BALE_AREA_PX.nw), se: pts(BALE_AREA_PX.se) } as const;
/** 북쪽 그물망을 따라 숲 경계에 늘어선 베일 줄 (사진 px, 3단) */
export const NORTH_ROW_PX: readonly [P2, P2] = [
  [274, 14],
  [404, 34],
];

/**
 * 마당 좌표계: 레일 좌표계를 뒤집어 남동 구역에 맞춘 것. +x = −u(사진 동북동, 남동 구역 줄 방향), +z = +w(사진 남남동, 구역 안쪽),
 * 원점은 레일 좌표 (u 26, w 132)px. 레일 축과 나란해서 압축기 배출구·받침대·베일 저울이 축에 맞는다.
 * 베일 적치·지게차 연출(sim/yard.ts)은 이 좌표계에서 돈다. 그리는 쪽은 YARD_FRAME으로 월드에 옮긴다.
 */
const YARD_U0 = 26;
const YARD_W0 = 132;
const YARD_O = railPx(YARD_U0, YARD_W0);
const YARD_A = RAIL_H + Math.PI;
export const YARD_FRAME = { x: YARD_O[0], z: YARD_O[1], rotY: YARD_A } as const;

/** 마당 좌표 → 월드 */
export function yardToWorld(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  const c = Math.cos(YARD_A);
  const s = Math.sin(YARD_A);
  out.x = YARD_FRAME.x + x * c + z * s;
  out.z = YARD_FRAME.z - x * s + z * c;
  return out;
}

/** 월드 → 마당 좌표 */
export function worldToYard(x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  const c = Math.cos(YARD_A);
  const s = Math.sin(YARD_A);
  const dx = x - YARD_FRAME.x;
  const dz = z - YARD_FRAME.z;
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
  return out;
}

/** 사진 px → 마당 좌표 */
export function yardPx(x: number, y: number): P2 {
  const [wx, wz] = sitePx(x, y);
  const o = worldToYard(wx, wz, { x: 0, z: 0 });
  return [o.x, o.z];
}
/** 레일 좌표(px) → 마당 좌표 (축이 나란하다) */
const railYard = (u: number, w: number): P2 => [-(u - YARD_U0) * SITE_SCALE, (w - YARD_W0) * SITE_SCALE];

const PITCH_X = BALE.w + BALE_GAP;
const SLOT_GAP = 2.75;
/** 남동 지게차 길: 칸 줄을 마당 쪽으로 당겨 칸 줄 뒤(울타리 쪽)에 바탕 베일 한 줄이 더 들어가게 한다 (남동 벽이 두 줄 깊이) */
const SE_LANE_Z = -0.6;

/** 남동 구역의 칸 열(x): 길(z 0)은 구역 안쪽 가장자리를 따르고, 칸은 길 앞(+z) 한 줄 */
const SE_XS = Array.from({ length: YARD_FLOW.seColumns }, (_, i) => 3.1 + i * PITCH_X);
/** 북서 구역의 길·칸 줄: 구역의 남동 면(마당 쪽)을 따라 길(z −13.5)을 두고, 칸은 길 뒤(−z, 북서 쪽) 한 줄 */
const NW_LANE_Z = -13.47;
const NW_XS = Array.from({ length: YARD_FLOW.nwColumns }, (_, i) => 12.2 + i * PITCH_X);

/** 배출구 받침대: 남동 벽(w 66px)에서 마당 쪽으로 베일 세 개 길이. 새 베일이 나오면 앞 베일이 밀려 한 칸씩 나간다 */
const STAND_X = railYard(80, 0)[0];
const STAND_OUTLET_Z = railYard(0, 66)[1];
const STAND_PITCH = BALE.d + 0.04;
const STAND = {
  x: STAND_X,
  /** 받침대 위 자리(베일 가운데 z): 끝(지게차가 집는 곳)이 0번 */
  slots: [0, 1, 2].map((k) => STAND_OUTLET_Z + 0.05 + (2.5 - k) * STAND_PITCH) as readonly number[],
  pitch: STAND_PITCH,
  /** 받침대 윗면 높이 */
  y: 0.5,
  /** 배출구 안쪽(결속부 끝): 새 베일이 여기서 나온다 */
  fromZ: STAND_OUTLET_Z - 0.55,
  outletZ: STAND_OUTLET_Z,
  length: 3 * STAND_PITCH + 0.1,
} as const;
/** 베일 저울: 배출구 오른쪽(마당 쪽, 레일 좌표 u 58, w 83px). 베일 두 개를 위아래로 겹쳐 올려 한 번에 잰다 (무게 숫자 없음) */
const BALE_SCALE_POS = railYard(58, 83);
const BALE_SCALE = { x: BALE_SCALE_POS[0], z: BALE_SCALE_POS[1], y: 0.16, size: 1.3 } as const;

/**
 * 마당(마당 좌표계)의 자리와 길.
 *  - 남동: 길 laneZ(0), 칸 줄 seXs × levels (길 앞 +z, slotZ)
 *  - 북서: 길 nwLaneZ, 칸 줄 nwXs × levels (길 뒤 −z, nwSlotZ)
 *  - 받침대(stand)·저울(scale)은 남동 길의 서쪽 끝 뒤(−z)에 있다
 *  - 가로지르는 길(crossing): 남동 길 동쪽 끝 → 마당 가운데(트럭 길) → 북서 길 동쪽 끝. 트럭과 같은 마당 차례를 잡고 지난다
 */
export const YARD = {
  laneZ: SE_LANE_Z,
  slotZ: SE_LANE_Z + SLOT_GAP,
  seXs: SE_XS as readonly number[],
  nwLaneZ: NW_LANE_Z,
  nwSlotZ: NW_LANE_Z - SLOT_GAP,
  nwXs: NW_XS as readonly number[],
  levels: YARD_FLOW.levels,
  pitchX: PITCH_X,
  /** 남동 길의 서쪽 끝(받침대 앞)·동쪽 끝(가로지르는 길로 나가는 곳) */
  laneStart: STAND_X - 0.6,
  laneEnd: SE_XS[SE_XS.length - 1]! + 1.2,
  /** 북서 길의 동쪽 끝 (가로지르는 길이 닿는 곳) */
  nwLaneEnd: NW_XS[NW_XS.length - 1]! + 0.8,
  stand: STAND,
  scale: BALE_SCALE,
  /** 지게차 대기 자리 (남동 길 뒤 −z, 받침대·저울 동쪽): 길에서 도는 원이 닿지 않는 곳 */
  homes: [
    [0.25, SE_LANE_Z - 2.75],
    [1.7, SE_LANE_Z - 2.75],
  ] as readonly P2[],
  /** 남동 길 동쪽 끝 → 북서 길 동쪽 끝: 꺾이는 점 (사진 px로 잡아 옮긴다). 상차 자리·쏟는 자리·대기 자리 트럭을 피한다 */
  crossing: [yardPx(340, 400), yardPx(328, 296), yardPx(316, 250)] as readonly P2[],
} as const;

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

/** 바탕 베일(서버 베일이 아닌 고정 재고) 한 칸: 마당 좌표의 가운데, 단 수 */
export interface StaticBaleCell {
  x: number;
  z: number;
  levels: number;
  i: number;
  j: number;
}

/**
 * 바탕 베일 칸: 칸 줄과 같은 간격·방향의 격자로 구역을 채운다.
 *  - 북서: 칸 줄(지게차가 쓰는 곳, 길 앞) 뒤쪽을 모두 (가장자리는 한 단 낮게, 3~5단)
 *  - 남동: 울타리를 따라 이어진 4~5단 벽. 칸 줄 7열 뒤 한 줄과 칸 줄 양 끝을 채우고, 지게차 길(칸 줄 앞)·칸 줄 7열·가로지르는 길로 나가는 곳만 비운다
 * 지게차가 이 칸에 닿지 않는지는 yard의 audit(forkOnWall)가 본다
 */
export function staticBaleCells(area: 'nw' | 'se'): StaticBaleCell[] {
  const poly = BALE_AREAS[area];
  const keep =
    area === 'nw'
      ? (_x: number, z: number) => z + BALE.d / 2 < YARD.nwSlotZ - BALE.d / 2 - 0.1
      : (x: number, z: number) => {
          const corridor = x > YARD.laneStart - 1.2 && x < YARD.laneEnd + 0.4 && z > YARD.laneZ - 2.2 && z < YARD.slotZ - BALE.d / 2 - 0.05;
          const slots = x > YARD.seXs[0]! - BALE.w && x < YARD.seXs[YARD.seXs.length - 1]! + BALE.w && Math.abs(z - YARD.slotZ) < BALE.d;
          const exit = x > YARD.laneEnd - 1.6 && x < YARD.laneEnd + 2.6 && z < YARD.laneZ + 1.2;
          return !corridor && !slots && !exit;
        };
  const out: StaticBaleCell[] = [];
  const px = BALE.w + BALE_GAP;
  const pz = BALE.d + BALE_GAP;
  const w = { x: 0, z: 0 };
  for (let i = -30; i < 40; i += 1) {
    for (let j = -40; j < 30; j += 1) {
      const x = 3.1 + i * px;
      const z = YARD.slotZ + j * pz;
      if (!keep(x, z)) continue;
      const corners: P2[] = [
        [x - BALE.w / 2, z - BALE.d / 2],
        [x + BALE.w / 2, z - BALE.d / 2],
        [x - BALE.w / 2, z + BALE.d / 2],
        [x + BALE.w / 2, z + BALE.d / 2],
      ].map(([a, b]) => {
        yardToWorld(a!, b!, w);
        return [w.x, w.z] as P2;
      });
      if (!corners.every((c) => inside(c, poly) && edgeDistance(c, poly) > 0.12)) continue;
      // 4열 블록마다 높이 하나. 북서는 가장자리 블록을 한 단 낮게, 남동 벽은 고르게 4~5단
      const block = Math.floor(i / 4) * 7 + Math.floor(j / 3);
      const edge = Math.min(...corners.map((c) => edgeDistance(c, poly)));
      const levels = (area === 'se' || edge >= 0.9 ? 4 : 3) + (((block * 2654435761) >>> 0) % 2);
      out.push({ x, z, levels, i, j });
    }
  }
  return out;
}

/** 마당 좌표 → 월드 (그리는 쪽) */
export function yardPoint(x: number, z: number): P2 {
  const o = yardToWorld(x, z, { x: 0, z: 0 });
  return [o.x, o.z];
}

// ── 트럭 자리·경로 (사진 px로 적고 옮긴다) ─────────────────────────────

/** 트럭 모형(배율 1)의 길이·폭 */
const TRUCK_MODEL = { length: 2.9, width: 1.157 } as const;
const TRUCK_SCALE = 1.1;
/**
 * 트럭(덤프·윙바디) 크기: 모형을 TRUCK_SCALE배로 그린 값. 2026-11-26 S2h: 1.4배(4.06 × 1.62)는 두 차로 도로(2.6)를 거의 다 덮고
 * 마당에 비해 커서 1.1배(3.19 × 1.27, 44 × 18px)로 줄였다: 한 차로(1.3)에 들어가고 계근대(4.82)의 2/3
 */
export const TRUCK = { length: TRUCK_MODEL.length * TRUCK_SCALE, width: TRUCK_MODEL.width * TRUCK_SCALE, scale: TRUCK_SCALE } as const;

/** 도로 차로의 가운데 선: 남쪽으로 가는 차로(부지 쪽, 서쪽)를 따라간다 */
function roadLanePx(offset: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < ROAD_PX.length; i += 1) {
    const a = ROAD_PX[Math.max(0, i - 1)]!;
    const b = ROAD_PX[Math.min(ROAD_PX.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    out.push([ROAD_PX[i]![0] - (dy / len) * offset, ROAD_PX[i]![1] + (dx / len) * offset]);
  }
  return out;
}
const LANE_PX = roadLanePx(ROAD.lane / SITE_SCALE);

/** 차량이 서는 자리와 방향 (월드) */
export interface Spot {
  x: number;
  z: number;
  heading: number;
}
const spot = (x: number, y: number, dx: number, dy: number): Spot => {
  const [wx, wz] = sitePx(x, y);
  return { x: wx, z: wz, heading: siteHeading(dx, dy) };
};

/** 레일의 반대 방향(사진 북동): 쏟는 트럭이 보는 방향 */
const NE: P2 = [-PU[0], -PU[1]];
// 트럭 뒤(적재함 끝)가 더미 북동 면에 닿는 자리: 트럭을 줄여(S2h) 가운데를 −72 → −66px로 당겼다
const tipPx = (sign: 1 | -1): P2 => railToPhoto(-66, sign * 45);
const plus = (p: P2, d: P2, k: number): P2 => [p[0] + d[0] * k, p[1] + d[1] * k];

/** 섹터 더미에 쏟는 자리: 더미 북동 면 바깥, 적재함 뒤가 더미 쪽(앞이 북동). A·C가 레일 축에 대칭이다 */
export const TIP_PX: Record<TankId, P2> = { 'sector-a': tipPx(-1), 'sector-c': tipPx(1) };
export const TIP: Record<TankId, Spot> = {
  'sector-a': spot(...TIP_PX['sector-a'], NE[0], NE[1]),
  'sector-c': spot(...TIP_PX['sector-c'], NE[0], NE[1]),
};
/** 상차 자리(남동 구역 북동 날개 곁): 남쪽을 보고 선다. 지게차가 서쪽 곁에서 북서 재고의 베일을 싣는다 */
export const HOLD = spot(366, 345, 0, 1);
/** 배정 더미 앞에 다른 트럭이 있을 때 기다리는 자리 (계근대 서쪽 위, 서쪽을 봄) */
export const QUEUE = spot(384, 217, -1, 0);
/** 계근대 위에 서는 자리: 입차 계근은 서쪽을 보고(후진으로 올라옴), 출차 계근은 동쪽을 본다(앞으로 올라옴) */
export const SCALE_STOP = spot(456, 247, -1, 0);
export const SCALE_STOP_EAST = spot(456, 247, 1, 0);
/** 계근대 서쪽 끝 앞: 입차 차가 서쪽을 보고 서서 후진으로 계근대에 오르는 곳 */
export const SCALE_WEST = spot(372, 250, -1, 0);
/** 도로에서 계근대가 빌 때까지 기다리는 자리 (남쪽으로 가는 차로, 입구 북쪽). 앞에서부터 차례로 줄 선다 */
export const ROAD_HOLDS: readonly Spot[] = [3, 2, 1].map((i) => {
  const p = LANE_PX[i]!;
  const next = LANE_PX[i + 1]!;
  return spot(p[0], p[1], next[0] - p[0], next[1] - p[1]);
});
export const ROAD_HOLD = ROAD_HOLDS[0]!;

const RAMP_IN_PX: P2[] = [
  [527, 296],
  [500, 306],
  [470, 305],
  [440, 302],
  [412, 288],
  [400, 266],
  [390, 253],
  [372, 250],
];
/** 도로 차로를 사진 위(북쪽) 밖으로 더 늘인 점: 막 들어오는 차가 여러 대면 이 길 위에 차례로 줄 선다 */
const LANE_OFF: P2 = [LANE_PX[0]![0] - ROAD_PX[0]![0], LANE_PX[0]![1] - ROAD_PX[0]![1]];
const FAR_PX: P2[] = [
  [840 + LANE_OFF[0], -1500 + LANE_OFF[1]],
  [650 + LANE_OFF[0], -330 + LANE_OFF[1]],
  [630 + LANE_OFF[0], -210 + LANE_OFF[1]],
];
/** 도로(사진 위 끝 밖, 북쪽) → 도로 대기 자리 */
export const TRUCK_IN: P2[] = pts([...FAR_PX, LANE_PX[0]!, LANE_PX[1]!, LANE_PX[2]!, LANE_PX[3]!]);
/** 도로 대기 자리 → 경사로로 올라 → 계근대 서쪽 끝 앞(서쪽을 봄) */
export const ROAD_TO_SCALE: P2[] = pts([LANE_PX[3]!, ...RAMP_IN_PX]);
/** 계근대 서쪽 끝 앞 → 후진으로 계근대 위 (입차 계근) */
export const SCALE_REVERSE_IN: P2[] = pts([
  [372, 250],
  [400, 248],
  [456, 247],
]);
/** 계근대 위(동쪽을 봄) → 후진으로 서쪽에 내려옴 (출차 계근 뒤) */
export const SCALE_REVERSE_OUT: P2[] = pts([
  [456, 247],
  [410, 248],
  [380, 250],
]);
/** 계근대 서쪽에 내려온 곳(동쪽을 봄) → 경사로 위 출차 대기 자리(동쪽, 도로를 봄). 서버가 출차를 주면 여기서 회사 밖으로 빠진다 */
export const SCALE_TO_EXIT: P2[] = pts([
  [380, 250],
  [420, 268],
  [458, 300],
  [478, 306],
]);
export const EXIT_HOLD = spot(478, 306, 1, 0);

/** 계근대(서쪽을 봄) → 앞으로 내려가 → 더미 앞에서 후진할 자리 */
const TO_TIP_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [
    [456, 247],
    [396, 248],
    [330, 262],
    [244, 278],
  ],
  'sector-c': [
    [456, 247],
    [396, 250],
    [340, 290],
    [300, 316],
  ],
};
/** 후진할 자리 → 동쪽으로 물렸다가 더미 쪽으로 후진해 쏟는 자리까지 */
const REVERSE_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [[244, 278], [270, 276], plus(TIP_PX['sector-a'], NE, 26), TIP_PX['sector-a']],
  'sector-c': [[300, 316], [326, 318], plus(TIP_PX['sector-c'], NE, 26), TIP_PX['sector-c']],
};
/** 쏟는 자리 → 앞으로 북동쪽 → 계근대 서쪽 끝에서 앞으로 올라 동쪽을 보고 다시 잰다 (출차 계근) */
const TIP_TO_SCALE_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [TIP_PX['sector-a'], plus(TIP_PX['sector-a'], NE, 34), [330, 262], [396, 248], [456, 247]],
  'sector-c': [TIP_PX['sector-c'], plus(TIP_PX['sector-c'], NE, 34), [340, 285], [396, 250], [456, 247]],
};
/** 기다리는 자리 → 서쪽·남쪽으로 → 더미 앞에서 후진할 자리 */
const QUEUE_TO_TIP_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [
    [384, 217],
    [350, 220],
    [330, 250],
    [300, 268],
    [244, 278],
  ],
  'sector-c': [
    [384, 217],
    [350, 222],
    [334, 256],
    [322, 296],
    [300, 316],
  ],
};
/** 계근대(서쪽을 봄) → 앞으로 내려가 북쪽으로 비켜 기다리는 자리 */
export const SCALE_TO_QUEUE: P2[] = pts([
  [456, 247],
  [420, 247],
  [404, 224],
  [384, 217],
]);

export const truckToTip = (id: TankId): P2[] => pts(TO_TIP_PX[id]);
export const truckQueueToTip = (id: TankId): P2[] => pts(QUEUE_TO_TIP_PX[id]);
export const truckReverse = (id: TankId): P2[] => pts(REVERSE_PX[id]);
export const truckTipToScale = (id: TankId): P2[] => pts(TIP_TO_SCALE_PX[id]);

/** 상차 차량: 계근대(서쪽을 봄) → 상차 자리 (남쪽을 보고 선다) */
export const SCALE_TO_HOLD: P2[] = pts([
  [456, 247],
  [400, 252],
  [372, 290],
  [366, 345],
]);
/** 상차 자리 → 후진으로 북쪽에 물림 */
export const HOLD_REVERSE: P2[] = pts([
  [366, 345],
  [366, 292],
]);
/** 물린 곳(남쪽을 봄) → 마당 가운데에서 돌아 → 계근대 서쪽 끝에서 앞으로 올라 동쪽을 보고 잰다 */
export const HOLD_TO_SCALE: P2[] = pts([
  [366, 292],
  [350, 312],
  [322, 300],
  [330, 268],
  [370, 252],
  [456, 247],
]);

/** 마당 안쪽 길을 벗어났다고 보는 곳: 계근대 서쪽 끝 (사진 px) */
export const SCALE_WEST_PX: P2 = [424, 247];
/** 마당 안쪽 길(트럭이 다니는 곳)에서 계근대 쪽 끝을 벗어났다고 보는 거리: 계근대 가운데에서 이만큼 서쪽 */
export const SCALE_CLEAR = 5.6;

/** 상차 차량에 베일을 놓는 자리: 적재함 위 (트럭 기준 앞뒤 거리, 단) */
export const LOAD_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [-1.5, 0],
  [-0.52, 0],
  [-1.5, 1],
  [-0.52, 1],
  [-1.5, 2],
  [-0.52, 2],
];
/** 상차 차량의 적재함 바닥 높이 */
export const LOAD_BED_Y = 0.85;

// ── 기준점 (핀·카메라) ────────────────────────────────────────────────

/** 다각형의 가운데(꼭짓점 평균) */
export function centroid(poly: readonly P2[]): P2 {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p[0];
    z += p[1];
  }
  return [x / poly.length, z / poly.length];
}

const railMid = railAt((RAIL.startU + RAIL.endU) / 2, 0);
const balerCenter = railAt(BALER.x, -(BALER.backZ + BALER.outletZ) / 2);

export function deviceCenter(id: DeviceId): V3 {
  if ((TANK_IDS as readonly string[]).includes(id)) {
    const [x, z] = centroid(PILES[id as TankId]);
    return [x, 0.7, z];
  }
  if (id === 'robot-1') return [0, 1.6, 0];
  if (id === 'conveyor-z') return [railMid[0], (RAIL.startY + RAIL.endY) / 2, railMid[1]];
  return [balerCenter[0], 0.8, balerCenter[1]];
}

export function devicePin(id: DeviceId): V3 {
  const [x, , z] = deviceCenter(id);
  if ((TANK_IDS as readonly string[]).includes(id)) return [x, 2.8, z];
  if (id === 'robot-1') return [0, 4.1, 0];
  if (id === 'conveyor-z') return [x, 3.4, z];
  return [x, 4.3, z];
}
