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

// 3D 홈(스튜디오) 월드의 배치. 실제 부지의 위성사진(613×616px, 위가 북쪽)을 따른다 (docs/decisions.md 2026-11-24 "실제 부지 배치와 섹터 2곳").
// 좌표: Y가 위, 로봇 받침대가 원점. 방향(heading)은 three의 rotation.y와 같다: 0이면 +X, 앞 방향은 (cos h, −sin h).
//
// ── 사진 → 월드 변환 (하나뿐이다: sitePx) ─────────────────────────────
// 닮음 변환(같은 배율 + 회전 + 평행 이동, 뒤집기 없음). 사진 좌표는 x가 오른쪽(동), y가 아래(남)다.
//  - 기준점 1: 로봇 자리(지금의 포크레인 자리, 사진 빨간 원) (200, 385)px → 월드 원점.
//  - 기준점 2: 레일이 압축기 건물로 들어가는 곳(사진 파란 선 끝) (152, 428)px.
//    로봇 → 기준점 2의 방향(남서)이 레일 쪽 base 각도 θc = DEMO_CYCLE.conveyorBaseDeg(150°)의 3D 방향 (cos θc, −sin θc)에 오도록 돌린다.
//    그래서 사진은 월드에서 약 −71.9°(위에서 볼 때 시계 방향 71.9°) 돌아가 놓인다: 사진의 북쪽은 월드 방향 18.1°다.
//  - 배율: 1px = 0.08 (월드 단위). 트럭(2.9)·지게차·베일(0.95)·로봇 배율(1.6)은 예전 그대로 두고, 로봇이 집는 자리(반지름 2.61)가
//    사진의 두 파지 더미 안쪽에 오도록 정했다. 사진의 베일 한 개(약 12px)가 장면의 베일(0.95)과 비슷하다.
//  - 뒤집지 않는다: 사진 (x, y) → (X, Z)는 위에서 내려다본 화면(+X 오른쪽, −Z 위)과 같은 손잡이라 회전만 하면 된다.
//    섹터 A(사진 북서 갈색 더미)는 레일을 볼 때 오른쪽(θc − 90°), C(남동 흰 더미)는 왼쪽(θc + 90°)이다 (config/robotCycle).
// 부지 요소(사무실·계근대·입구·도로·숲·베일 적치 구역 둘·압축기 건물·배출구·레일·섹터 더미·경로)는 모두 사진 좌표로 적고 sitePx로 옮긴다.
// 로봇이 집는 자리·놓는 자리만은 서버 관절 값(base 각도, 모의 서버와 같은 down 자세)에서 나온다.

const DEG = Math.PI / 180;

/** 사진 크기(px) */
export const PHOTO = { width: 613, height: 616 } as const;
/** 사진 1px의 월드 길이 */
export const SITE_SCALE = 0.08;
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

/** 사진에서 (dx, dy) 쪽을 보는 방향 → 월드 방향(라디안) */
export const siteHeading = (dx: number, dy: number): number => photoHeading(dx, dy) + SITE_ROTATION;
/** 사진 축에 맞춘 상자를 월드에 놓을 때의 회전(rotation.y) */
export const SITE_ROT_Y = SITE_ROTATION;

const pts = (list: ReadonlyArray<readonly [number, number]>): P2[] => list.map(([x, y]) => sitePx(x, y));

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

// ── 부지 (사진 테두리) ────────────────────────────────────────────────

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
export const ROAD = { line: pts(ROAD_PX), width: 2.8, lane: 0.68 } as const;

/** 북서쪽 숲의 테두리 (사진 px). 나무는 이 안에서 베일 적치 구역과 떨어진 곳에만 심는다 */
export const FOREST: readonly P2[] = pts([
  [-40, -40],
  [258, -40],
  [252, 0],
  [240, 60],
  [222, 110],
  [185, 182],
  [140, 220],
  [128, 262],
  [108, 292],
  [60, 302],
  [-40, 318],
]);

// ── 건물: 사무실, 계근대, 입구 ────────────────────────────────────────

/** 사무실("태화리싸이클링" 자리): 사진 축에 맞춘 상자 (415~500, 100~210)px */
export const OFFICE = { center: sitePx(457.5, 155), w: 85 * SITE_SCALE, d: 110 * SITE_SCALE, height: 2.3 } as const;
/** 사무실 옆에 세워 둔 트레일러 (소품) */
export const TRAILER = { center: sitePx(384, 132), heading: siteHeading(0, 1), length: 75 * SITE_SCALE } as const;

/** 계근대(검은 사각형, 420~493 × 233~261px): 가로로 길다. 트럭은 그 위에 서서 무게를 잰다 */
export const SCALE = {
  center: sitePx(456.5, 247),
  /** 긴 쪽 방향(사진 동 → 서) */
  heading: siteHeading(-1, 0),
  length: 73 * SITE_SCALE,
  width: 28 * SITE_SCALE,
  /** 트럭이 서는 자리 */
  stop: sitePx(454, 247),
} as const;

/** 입구: 계근대 아래, 계근대와 남동 베일 구역 사이(도로 쪽 부지 끝). 기둥 둘 */
export const GATE = { north: sitePx(518, 256), south: sitePx(508, 346) } as const;

// ── 압축기 건물·레일 (레일 좌표계) ────────────────────────────────────

/**
 * 레일 좌표계: 로봇이 원점, +u는 레일 방향(로봇 → 건물, 3D 방향 θc), +w는 섹터 C 쪽(θc + 90°, 사진 남동).
 * 사진의 파란 지붕 건물은 벽이 레일과 직각·평행이라 이 좌표계의 상자 둘로 적는다(값은 사진 px를 이 축에 잰 것).
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

/**
 * 압축기 건물(파란 지붕). 본동: u 62~150, w −60~66 (압축기·배출구), 옆동: u 33~150, w −140~−60 (사진 북서쪽의 짙은 지붕).
 * 레일은 본동의 북동 벽(u 62)으로 들어가고, 베일은 남동 벽(w 66)의 북동 끝(사진 남동 모서리 165~190, 480~500px)으로 나온다.
 */
export const BALER_HOUSE = {
  main: { u0: 62, u1: 150, w0: -60, w1: 66, wallH: 3.1 },
  annex: { u0: 33, u1: 150, w0: -140, w1: -60, wallH: 2.7 },
} as const;

/**
 * 압축기(레일 좌표계로 조립한 로컬 좌표: x = u, z = −w, 월드 단위). 압축실은 레일 끝 아래(w 0 근처),
 * 램은 +z(−w)에서 −z(+w, 배출구 쪽)로 밀고, 결속부를 지나 롤러를 타고 남동 벽 밖(배출구)으로 나온다.
 */
export const BALER = {
  x: 80 * SITE_SCALE,
  halfX: 0.85,
  minZ: -0.9,
  maxZ: 0.9,
  height: 1.0,
  /** 결속부가 끝나는 곳, 배출 롤러가 끝나는 곳 (건물 남동 벽 w 66px = z −5.28 밖) */
  strapZ: -1.5,
  chuteEndZ: -6.6,
  chuteY: 0.5,
} as const;

/** 레일 좌표계(월드 단위) → 월드 */
export function railAt(u: number, w: number): P2 {
  return [RAIL_FRAME.u[0] * u + RAIL_FRAME.w[0] * w, RAIL_FRAME.u[1] * u + RAIL_FRAME.w[1] * w];
}

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

export const BALE = { w: 0.75, h: 0.62, d: 0.95 } as const;
/** 배출된 베일이 멈추는 자리 (배출구 밖 롤러 끝) */
const REST = railAt(BALER.x, -(BALER.chuteEndZ + 0.6));
export const BALE_REST: [number, number, number] = [REST[0], BALER.chuteY, REST[1]];
/** 베일이 배출구로 나오는 방향 (+w) */
export const CHUTE_HEADING = RAIL_H + Math.PI / 2;

/** 지게차가 포크를 내밀어 베일을 드는 거리(지게차 중심 → 베일 중심). 베일 뒤쪽이 포크 받침 바로 앞에 오도록 잡았다 */
export const FORK_REACH = 1.1;

// ── 섹터 더미 ─────────────────────────────────────────────────────────

/**
 * 노천 파지 더미(칸막이 없음). 로봇이 집는 자리(PICK)를 품고 바깥으로 사진의 더미처럼 퍼진다.
 * 바닥 윤곽은 사진 px 다각형(A: 북서 갈색, C: 남동 흰 더미)이고, 높이는 서버 적재율(fillPercent)로 정한다.
 * 트럭이 쏟는 쪽(북쪽 끝)과 지게차 길·건물에서는 떨어지게 다듬었다.
 */
export const PILE_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [
    [150, 328],
    [196, 334],
    [205, 356],
    [192, 378],
    [166, 392],
    [142, 380],
    [136, 350],
  ],
  'sector-c': [
    [212, 398],
    [236, 360],
    [272, 356],
    [304, 362],
    [302, 392],
    [270, 418],
    [232, 430],
  ],
};
export const PILES: Record<TankId, readonly P2[]> = { 'sector-a': pts(PILE_PX['sector-a']), 'sector-c': pts(PILE_PX['sector-c']) };
/** 더미의 가장 높은 곳 (적재율 100%) */
export const PILE_MAX_H = 1.6;

// ── 베일 적치 구역 ────────────────────────────────────────────────────

/** 북서 구역(ㄱ자, 고정 재고 "예시")과 남동 구역(ㄴ자, 서버 베일을 쌓는 곳)의 윤곽 */
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
    [420, 436],
    [395, 455],
    [300, 535],
    [285, 540],
    [245, 488],
    [240, 470],
    [325, 398],
    [366, 406],
    [386, 392],
    [384, 345],
  ] as readonly P2[],
};
export const BALE_AREAS = { nw: pts(BALE_AREA_PX.nw), se: pts(BALE_AREA_PX.se) } as const;

/**
 * 남동 구역의 지게차 좌표계(마당 좌표계): 원점은 사진 (250.7, 483.3)px, +x는 ㄴ자 아랫줄의 긴 방향(사진 동북동),
 * +z는 그 직각으로 구역 안쪽(사진 남남동). 지게차 길은 z = 0의 한 줄이고, 칸은 길 앞(+z) 한 줄에 열을 늘어놓는다.
 * 베일 적치·출하 연출(sim/yard.ts)은 이 좌표계에서 돈다. 그리는 쪽은 YARD_FRAME으로 월드에 옮긴다.
 */
const YARD_O = sitePx(250.7, 483.3);
const YARD_A = siteHeading(0.78, -0.63);
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
function yardPx(x: number, y: number): P2 {
  const [wx, wz] = sitePx(x, y);
  const o = worldToYard(wx, wz, { x: 0, z: 0 });
  return [o.x, o.z];
}

const SLOT_X0 = 0.5;
const SLOT_DX = 0.95;
const SLOT_Z = 2.43;
const LANE_END = 13;
const restYard = worldToYardP2(BALE_REST[0], BALE_REST[2]);
function worldToYardP2(x: number, z: number): P2 {
  const o = worldToYard(x, z, { x: 0, z: 0 });
  return [o.x, o.z];
}
/** 지게차가 북서 구역의 고정 재고에서 베일을 집는(또는 내려놓는) 자리: 사진 (299, 227)px, 북서쪽을 본다 */
const NW_FACE = yardPx(299, 227);
const NW_HEADING = siteHeading(-0.75, -0.67) - YARD_A;

/**
 * 남동 마당 (마당 좌표계). 칸은 길 앞 한 줄(slotZ)에 열(slotXs)을 늘어놓고 칸마다 levels단까지 쌓는다.
 * 배출구는 길의 서쪽 끝 곁에 있고, 지게차는 길에서 배출구 쪽(−w)을 보고 들어가 베일을 든다(chute).
 * 길 동쪽 끝(laneEnd)에서 북쪽으로 마당을 가로질러(crossing) 북서 구역으로 오간다.
 */
export const YARD = {
  laneZ: 0,
  slotZ: SLOT_Z,
  pocketZ: SLOT_Z - FORK_REACH,
  slotXs: Array.from({ length: YARD_FLOW.columns }, (_, i) => SLOT_X0 + i * SLOT_DX) as readonly number[],
  levels: YARD_FLOW.levels,
  /** 지게차 대기 자리(칸 줄 동쪽 밖, ㄴ자 안쪽 모서리). 길 앞(+z) 칸 앞 자리 높이 */
  homes: [[9.05, SLOT_Z - FORK_REACH], [10.95, SLOT_Z - FORK_REACH]] as readonly P2[],
  /** 길의 서쪽·동쪽 끝(x) */
  laneStart: -5.2,
  laneEnd: LANE_END,
  /** 배출구 앞 자리: 지게차 중심과 바라보는 방향(마당 좌표계) */
  chute: {
    x: restYard[0] + Math.cos(CHUTE_HEADING - YARD_A) * FORK_REACH,
    z: restYard[1] - Math.sin(CHUTE_HEADING - YARD_A) * FORK_REACH,
    heading: CHUTE_HEADING - YARD_A + Math.PI,
  },
  /** 북서 고정 재고 앞 자리(지게차 중심, 바라보는 방향): 상차할 베일을 꺼내는 곳 */
  stock: { x: NW_FACE[0], z: NW_FACE[1], heading: NW_HEADING },
  /**
   * 출하된 서버 베일을 북서 재고에 내려놓는 곳: 재고 동쪽 면(사진 338, 152px, 서쪽을 본다). 상차용 자리와 떨어져 있어
   * 상차 지게차가 재고 앞에 머무는 동안에도 출하 베일을 옮길 수 있다. 가로지르는 길의 둘째 점에서 갈라져 이 점들을 지난다
   * (계근대 곁 대기 자리 QUEUE에 선 트럭과 한 차 폭 넘게 떨어지게: 그 트럭은 지게차가 비키기를 기다리지 않는다)
   */
  drop: { via: [yardPx(332, 238), yardPx(332, 164)] as readonly P2[], x: yardPx(338, 152)[0], z: yardPx(338, 152)[1], heading: siteHeading(-1, 0) - YARD_A },
  /** 길 동쪽 끝에서 북서 구역까지 가로지르는 길의 꺾이는 점(마당 좌표계): 남동 구역 서쪽 가장자리를 따라 북쪽으로, 레일·트럭 자리를 피한다. 첫 점은 트럭 길 밖의 대기점 */
  crossing: [yardPx(377, 352), yardPx(374, 300), yardPx(330, 262), yardPx(310, 238)] as readonly P2[],
} as const;

// ── 트럭 경로 (사진 px로 적고 옮긴다) ─────────────────────────────────

export const TRUCK = { length: 2.9, width: 1.16 } as const;

/** 도로 차로의 가운데 선: 남쪽으로 가는 차로(부지 쪽, 서쪽)를 따라간다 */
function roadLanePx(offset: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < ROAD_PX.length; i += 1) {
    const a = ROAD_PX[Math.max(0, i - 1)]!;
    const b = ROAD_PX[Math.min(ROAD_PX.length - 1, i + 1)]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // 남쪽으로 가는 방향의 오른쪽(서쪽)
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

/** 섹터 더미에 쏟는 자리 (적재함 뒤가 더미 쪽) */
export const TIP: Record<TankId, Spot> = {
  'sector-a': spot(196, 318, 16, -32),
  'sector-c': spot(288, 338, 0, -1),
};
/** 상차 자리(남동 구역 곁, 입구 가까이): 상차 차량("예시")이 서서 베일을 싣는다. 남쪽 길에서 한 차 폭 떨어져 있다 */
export const HOLD = spot(440, 320, 1, 0);
/**
 * 배정 더미 앞에 다른 트럭이 있을 때 기다리는 자리(계근대 서쪽 위, 트레일러와 계근대 사이). 계근대를 비워 줘야
 * 쏟고 나서 다시 재러 오는 트럭과 서로 막히지 않는다
 */
export const QUEUE = spot(372, 220, -1, 0);
/** 계근대 위에 서는 자리: 들어올 때는 서쪽을 보고, 쏟고 다시 잴 때는 동쪽을 본다 */
export const SCALE_STOP = spot(454, 247, -1, 0);
export const SCALE_STOP_EAST = spot(458, 247, 1, 0);
/** 도로에서 계근대가 빌 때까지 기다리는 자리 */
export const ROAD_HOLD = spot(LANE_PX[3]![0], LANE_PX[3]![1], -18, 100);

/** 도로(사진 위 끝, 북쪽) → 입구 북쪽 차로 → 계근대 (서쪽으로 서서 잰다). 서버의 "계중대 도착" 무렵 계근대에 닿게 사진 끝에서 들어온다 */
export const TRUCK_IN: P2[] = pts([LANE_PX[1]!, LANE_PX[2]!, LANE_PX[3]!, [531, 270], [505, 270], [482, 248], [454, 247]]);
/** 도로 대기 자리 → 입구에 들어가지 않고 도로를 따라 남쪽 밖으로 (들어오기 전에 출차 단계가 온 드문 차) */
export const ROAD_PASS_BY: P2[] = pts(LANE_PX.slice(3));
/** 도로 대기 자리 → 계근대 (TRUCK_IN의 뒷부분) */
export const ROAD_TO_SCALE: P2[] = pts([LANE_PX[3]!, [531, 270], [505, 270], [482, 248], [454, 247]]);

/** 계근대 → 서쪽 차로 → 섹터 앞에서 꺾는 자리 */
const TO_TIP_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [
    [454, 247],
    [396, 247],
    [330, 264],
    [250, 284],
    [158, 284],
  ],
  'sector-c': [
    [454, 247],
    [396, 247],
    [340, 262],
    [268, 282],
  ],
};
/** 꺾는 자리에서 더미 쪽으로 후진해 쏟는 자리까지 */
const REVERSE_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [
    [158, 284],
    [212, 286],
    [196, 318],
  ],
  'sector-c': [
    [268, 282],
    [296, 286],
    [288, 338],
  ],
};
/** 쏟는 자리 → 서쪽 차로를 거슬러(마당 차례를 잡았을 때만) → 계근대 서쪽 끝으로 올라 동쪽을 보고 다시 잰다 */
const TIP_TO_SCALE_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [
    [196, 318],
    [210, 290],
    [262, 284],
    [330, 268],
    [396, 251],
    [424, 247],
    [458, 247],
  ],
  'sector-c': [
    [288, 338],
    [290, 302],
    [330, 280],
    [396, 252],
    [424, 247],
    [458, 247],
  ],
};

/** 기다리는 자리 → 서쪽 차로 → 섹터 앞에서 꺾는 자리 */
const QUEUE_TO_TIP_PX: Record<TankId, readonly P2[]> = {
  'sector-a': [
    [372, 220],
    [350, 224],
    [336, 250],
    [330, 264],
    [250, 284],
    [158, 284],
  ],
  'sector-c': [
    [372, 220],
    [350, 224],
    [336, 252],
    [306, 272],
    [268, 282],
  ],
};
/** 계근대 → 서쪽으로 나가 북쪽으로 비켜 기다리는 자리 */
export const SCALE_TO_QUEUE: P2[] = pts([
  [454, 247],
  [422, 247],
  [402, 222],
  [372, 220],
]);

export const truckToTip = (id: TankId): P2[] => pts(TO_TIP_PX[id]);
export const truckQueueToTip = (id: TankId): P2[] => pts(QUEUE_TO_TIP_PX[id]);
export const truckReverse = (id: TankId): P2[] => pts(REVERSE_PX[id]);
export const truckTipToScale = (id: TankId): P2[] => pts(TIP_TO_SCALE_PX[id]);

/** 상차 자리 → 입구 안쪽으로 돌아 북쪽으로 → 계근대 (서쪽으로 서서 다시 잰다) */
export const HOLD_TO_SCALE: P2[] = pts([
  [440, 320],
  [487, 320],
  [487, 247],
  [454, 247],
]);
/** 서쪽을 보고 잰 차(상차 차량, 쏟지 않고 출차하는 드문 차): 계근대 → 서쪽으로 나가 남쪽으로 돌아 → 남쪽 길로 동쪽 → 입구 남쪽 차로 → 도로(남쪽 밖) */
export const SCALE_TO_OUT: P2[] = pts([
  [454, 247],
  [350, 247],
  [350, 296],
  [482, 296],
  [506, 300],
  LANE_PX[5]!,
  LANE_PX[6]!,
  LANE_PX[7]!,
  LANE_PX[8]!,
  LANE_PX[9]!,
  LANE_PX[10]!,
]);
/** 다시 잰 트럭(동쪽을 봄): 계근대 → 동쪽 끝 → 입구 안쪽에서 남쪽으로 → 입구 남쪽 차로 → 도로(남쪽 밖) */
export const SCALE_EAST_OUT: P2[] = pts([[458, 247], [497, 247], [503, 280], [521, 300], LANE_PX[5]!, LANE_PX[6]!, LANE_PX[7]!, LANE_PX[8]!, LANE_PX[9]!, LANE_PX[10]!]);
/** 상차 차량(예시): 계근대 → 서쪽으로 나가 남쪽으로 돌아 → 상차 자리 */
export const SCALE_TO_HOLD: P2[] = pts([
  [454, 247],
  [342, 247],
  [342, 320],
  [440, 320],
]);
/** 상차 차량이 다시 재러 갈 때 마당 안쪽 길을 벗어났다고 보는 곳: 입구 안쪽에서 북쪽으로 돈 뒤 (사진 px) */
export const STRIP_CLEAR_PX: P2 = [487, 284];
/** 쏟은 트럭이 다시 재러 갈 때 마당 안쪽 길을 벗어났다고 보는 곳: 계근대 서쪽 끝 (사진 px) */
export const SCALE_WEST_PX: P2 = [424, 247];

/** 마당 안쪽 길(트럭이 다니는 곳)에서 계근대 쪽 끝을 벗어났다고 보는 거리: 계근대 가운데에서 이만큼 서쪽 */
export const SCALE_CLEAR = 5.2;
/** 서쪽으로 돌아 나가는 차가 도로로 나가 입구를 지났다고 보는 자리(사진 y px) */
export const OUT_CLEAR_PX_Y = 360;
/** 동쪽으로 잰 트럭이 입구 북쪽 차로(들어오는 길) 아래로 내려섰다고 보는 자리(사진 y px) */
export const EAST_OUT_CLEAR_PX_Y = 288;

/** 상차 차량(예시)에 베일을 놓는 자리: 적재함 위 (트럭 기준 앞뒤 거리, 단) */
export const LOAD_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [-1.05, 0],
  [-0.15, 0],
  [-1.05, 1],
  [-0.15, 1],
];
/** 상차 차량의 적재함 바닥 높이 */
export const LOAD_BED_Y = 0.61;

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
const balerCenter = railAt(BALER.x, -(BALER.minZ + BALER.strapZ) / 2);

export function deviceCenter(id: DeviceId): V3 {
  if ((TANK_IDS as readonly string[]).includes(id)) {
    const [x, z] = centroid(PILES[id as TankId]);
    return [x, 0.6, z];
  }
  if (id === 'robot-1') return [0, 1.6, 0];
  if (id === 'conveyor-z') return [railMid[0], (RAIL.startY + RAIL.endY) / 2, railMid[1]];
  return [balerCenter[0], 0.8, balerCenter[1]];
}

export function devicePin(id: DeviceId): V3 {
  const [x, , z] = deviceCenter(id);
  if ((TANK_IDS as readonly string[]).includes(id)) return [x, 2.5, z];
  if (id === 'robot-1') return [0, 4.1, 0];
  if (id === 'conveyor-z') return [x, 3.4, z];
  return [x, 3.9, z];
}

/** 북서 고정 재고("예시") 이름표 자리 */
const nwMid = centroid(BALE_AREAS.nw);
export const STOCK_PIN: V3 = [nwMid[0], 2.6, nwMid[1]];
