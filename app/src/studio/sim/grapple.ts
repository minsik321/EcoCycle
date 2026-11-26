import { REAL_SIZE_M } from '../../config/yard';

// 입고 집게차(S2m): 5톤 카고 + 운전석 뒤 너클 크레인 + 갈퀴 6개 오렌지필 집게. three 미사용, 테스트 가능.
//  - 차량 종류는 서버 값이 아니다(하역 기록에 차량 종류가 없다). 연출로 차량 ID에서 정하고, 같은 차는 늘 같은 종류다(`inboundBody`).
//  - 하역 동작은 서버 하역 단계(unloading) 안에서만 한다: 받침다리 내림 → (움켜 → 들어 → 돌려 → 벌려 떨어뜨림) × GRABS → 크레인 접기 → 받침다리 올림.
//    전부 합쳐 GRAPPLE_TOTAL_SEC초로 모의 서버의 하역 9초 안에 끝난다. 서버 단계가 먼저 넘어가면 하던 동작을 그만두고 바로 접는다(늦게 떠나지 않는다).
//  - 좌표는 트럭 좌표(월드 단위, +X가 앞, 원점은 바닥 중심). 크레인 기둥은 운전석 바로 뒤(`CRANE.x`).

const M = (m: number) => m / 2;

/** 집게차 치수(월드 단위, 1단위 = 2 m). 길이·폭은 입고 트럭(5톤 카고, REAL_SIZE_M.truck)과 같다 */
export const GRAPPLE_TRUCK = {
  length: M(REAL_SIZE_M.truck.length),
  width: M(REAL_SIZE_M.truck.width),
  /** 운전석 지붕 */
  cabHeight: M(REAL_SIZE_M.truck.height),
  /** 운전석 길이 */
  cabLength: M(1.9),
  /** 적재함 바닥 윗면 높이, 옆판 높이 */
  deckY: M(1.12),
  sideH: M(0.5),
  /** 적재함 앞 끝(크레인 뒤)·뒤 끝 (트럭 가운데에서) */
  bedFront: M(1.2),
  bedRear: -M(3.68),
} as const;

/** 크레인: 기둥(돌아가는 받침)·붐 1·붐 2(+ 늘어나는 끝)·집게 */
export const CRANE = {
  /** 기둥 자리(트럭 x)와 붐 1 축 높이 */
  x: M(1.56),
  pivotY: M(1.9),
  boom1: M(2.25),
  boom2: M(2.0),
  /** 붐 2 끝이 늘어나는 최대 길이 */
  extMax: M(3.2),
  /** 붐 끝 → 갈퀴 아래 끝 */
  hang: M(0.76),
} as const;

/** 하역 한 번에 움켜 옮기는 횟수 */
export const GRABS = 4;
/** 한 번 집기의 구간(초): 위로 → 내려가 → 오므려 움켜 → 들어 → 섹터로 돌려 → 벌려 떨어뜨림 */
const SEG_SEC = [0.45, 0.25, 0.2, 0.25, 0.4, 0.15] as const;
export const GRAB_SEC = SEG_SEC.reduce((a, b) => a + b, 0);
/** 받침다리 내림·올림, 접는 자리로 돌아가기(초) */
export const LEGS_SEC = 0.6;
export const STOW_SEC = 0.6;
/** 하역 단계 시작부터 다 접고 받침다리를 올릴 때까지 (모의 서버 하역 9초 안) */
export const GRAPPLE_TOTAL_SEC = LEGS_SEC + GRABS * GRAB_SEC + STOW_SEC + LEGS_SEC;
/** 떨어뜨린 파지가 바닥에 닿는 시간(초) */
export const DROP_SEC = 0.55;

/** 크레인 끝(붐 2 끝)의 자리: 기둥 둘레 원통 좌표 (돌림 각, 기둥에서 거리, 높이) */
interface Cyl {
  slew: number;
  r: number;
  y: number;
}

/** 붐 각도: 돌림(y축), 붐 1 올림, 붐 2 꺾임(붐 1 기준), 늘어난 길이 */
export interface CranePose {
  slew: number;
  a1: number;
  a2: number;
  ext: number;
}

export type GrappleMode = 'stowed' | 'legsDown' | 'work' | 'stow' | 'legsUp';

export interface GrappleSim {
  mode: GrappleMode;
  /** 받침다리 0(올림)~1(내림) */
  legs: number;
  seg: number;
  segT: number;
  grabs: number;
  /** 이번 하역에서 집을 횟수(1~GRABS): 남은 하역 시간에 맞춘다 */
  plan: number;
  /** 동작 빠르기(1 = 보통). 남은 시간이 한 번 집기에도 모자라면 빨리 한다 */
  rate: number;
  /** 집게 0(벌림)~1(오므림) */
  jaw: number;
  holding: boolean;
  /** 적재함에 남은 파지 0~1 */
  load: number;
  /** 지금 끝 자리와 구간의 처음·끝 */
  tip: Cyl;
  from: Cyl;
  to: Cyl;
  pose: CranePose;
  /** 떨어뜨린 뒤 지난 시간(초, 떨어뜨린 적 없으면 큰 값)과 떨어뜨린 자리(트럭 좌표, 갈퀴 아래 끝) */
  dropT: number;
  drop: { x: number; y: number; z: number };
}

/** 접은 자리: 붐을 적재함 앞쪽 위에 눕히고 집게는 실린 파지 위에 얹는다 (운전석 지붕을 넘지 않게) */
const REST: Cyl = { slew: Math.PI, r: M(4.1), y: M(2.66) };
/** 움켜 들어 올리는 높이, 떨어뜨리는 자리(트럭 뒤 끝 너머, 섹터 더미 쪽)의 높이 */
const LIFT_Y = M(3.8);
const DROP_Y = M(4.0);
const GRAB_X = [-0.25, -0.95, -1.4, -0.6] as const;
const GRAB_Z = [0.14, -0.16, 0.08, -0.1] as const;
const DROP_Z = [0.7, -0.55, 0.25, -0.75] as const;
const DROP_BACK = 0.8;

/** 차량 ID → 입고 차량 모양. 집게차 2 : 덤프 1 (ID 해시, 무작위 아님: 같은 차는 늘 같은 모양) */
export function inboundBody(id: string): 'grapple' | 'dump' {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 3 === 0 ? 'dump' : 'grapple';
}

const toCyl = (x: number, z: number, y: number): Cyl => ({ slew: Math.atan2(-z, x - CRANE.x), r: Math.hypot(x - CRANE.x, z), y });
const smooth = (u: number) => u * u * (3 - 2 * u);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 적재함 파지 더미 윗면 높이 (load 0~1) */
export function heapTop(load: number): number {
  return GRAPPLE_TRUCK.deckY + 0.05 + load * M(0.95);
}

/** 크레인 끝 자리 → 붐 각도 (두 마디 역기구학, 꺾인 곳이 위). 닿지 않으면 끝까지 편다 */
export function solveCrane(tip: Cyl, out: CranePose): CranePose {
  const dy = tip.y - CRANE.pivotY;
  let d = Math.hypot(tip.r, dy);
  const ext = Math.min(CRANE.extMax, Math.max(0, d + M(0.3) - CRANE.boom1 - CRANE.boom2));
  const l2 = CRANE.boom2 + ext;
  d = Math.min(d, CRANE.boom1 + l2 - 1e-3);
  d = Math.max(d, Math.abs(CRANE.boom1 - l2) + 1e-3);
  const c = (d * d - CRANE.boom1 * CRANE.boom1 - l2 * l2) / (2 * CRANE.boom1 * l2);
  const q = Math.acos(Math.max(-1, Math.min(1, c)));
  out.slew = tip.slew;
  out.a1 = Math.atan2(dy, tip.r) + Math.atan2(l2 * Math.sin(q), CRANE.boom1 + l2 * Math.cos(q));
  out.a2 = -q;
  out.ext = ext;
  return out;
}

export function grappleSim(): GrappleSim {
  const g: GrappleSim = {
    mode: 'stowed',
    legs: 0,
    seg: 0,
    segT: 0,
    grabs: 0,
    plan: GRABS,
    rate: 1,
    jaw: 0,
    holding: false,
    load: 1,
    tip: { ...REST },
    from: { ...REST },
    to: { ...REST },
    pose: { slew: 0, a1: 0, a2: 0, ext: 0 },
    dropT: 99,
    drop: { x: 0, y: 0, z: 0 },
  };
  solveCrane(g.tip, g.pose);
  return g;
}

/** 새 차(또는 다시 쓰는 칸): 접고 받침다리 올린 채, 파지 가득 */
export function resetGrapple(g: GrappleSim, load = 1): void {
  Object.assign(g, grappleSim(), { load });
}

/** 이미 하역 중인 차를 처음 볼 때: 받침다리를 내리고 크레인을 편 채 (지나간 장면은 지어내지 않는다) */
export function grappleMidUnload(g: GrappleSim): void {
  resetGrapple(g, 0.5);
  g.mode = 'work';
  g.legs = 1;
  g.grabs = 2;
  g.plan = GRABS;
  startSeg(g, 0);
}

function grabCyl(k: number, y: number): Cyl {
  return toCyl(GRAB_X[k % GRAB_X.length]!, GRAB_Z[k % GRAB_Z.length]!, y);
}
function dropCyl(k: number): Cyl {
  return toCyl(GRAPPLE_TRUCK.bedRear - DROP_BACK, DROP_Z[k % DROP_Z.length]!, DROP_Y);
}

function startSeg(g: GrappleSim, seg: number): void {
  g.seg = seg;
  g.segT = 0;
  g.from = { ...g.tip };
  const k = g.grabs;
  const grabY = heapTop(g.load) + CRANE.hang - M(0.3);
  if (seg === 0) g.to = grabCyl(k, LIFT_Y);
  else if (seg === 1) g.to = grabCyl(k, grabY);
  else if (seg === 3) g.to = grabCyl(k, LIFT_Y);
  else if (seg === 4) g.to = dropCyl(k);
  else g.to = { ...g.tip };
}

function moveTip(g: GrappleSim, u: number): void {
  const e = smooth(Math.min(1, u));
  g.tip.slew = g.from.slew + wrap(g.to.slew - g.from.slew) * e;
  g.tip.r = g.from.r + (g.to.r - g.from.r) * e;
  g.tip.y = g.from.y + (g.to.y - g.from.y) * e;
}

function beginStow(g: GrappleSim): void {
  g.mode = 'stow';
  g.segT = 0;
  g.from = { ...g.tip };
  g.to = { ...REST };
  g.holding = false;
}

/** 고정 동작 시간(받침다리 내림·접기·받침다리 올림) */
const FIXED_SEC = LEGS_SEC + STOW_SEC + LEGS_SEC;
/** 가장 빨리 할 때의 빠르기 */
const RATE_MAX = 2.5;

/**
 * 남은 하역 시간(초)에 맞춰 집는 횟수와 빠르기를 정한다: 넉넉하면 GRABS번 보통 빠르기, 모자라면 횟수를 줄이고,
 * 한 번 집기에도 모자라면 한 번을 빨리(최대 RATE_MAX배) 한다. 그래도 모자라면 단계가 넘어갈 때 하던 동작을 그만두고 접는다
 */
export function planGrabs(left: number): { plan: number; rate: number } {
  const usable = left;
  const plan = Math.max(1, Math.min(GRABS, Math.floor((usable - FIXED_SEC) / GRAB_SEC)));
  const need = FIXED_SEC + plan * GRAB_SEC;
  return { plan, rate: Math.min(RATE_MAX, Math.max(1, need / Math.max(0.1, usable))) };
}

/**
 * 한 걸음. stage는 서버 차량 단계, left는 하역 단계에서 남았으리라 보는 시간(초, 모르면 Infinity).
 * 하역 단계(unloading)에만 집고, 그 밖의 단계가 오면 접는다. 하역이 끝난 단계(unloaded 뒤)면 실린 파지는 0이다(서버 값을 따른다).
 */
export function stepGrapple(g: GrappleSim, dtIn: number, stage: string, left = Infinity): void {
  const unloading = stage === 'unloading';
  const dt = dtIn * g.rate;
  if (!unloading && stage !== 'arrived' && stage !== 'identified') {
    g.load = 0;
    if (g.mode === 'legsDown' || g.mode === 'work') beginStow(g);
  }
  g.dropT += dtIn;
  switch (g.mode) {
    case 'stowed':
      if (unloading && g.load > 0) {
        g.mode = 'legsDown';
        Object.assign(g, planGrabs(left));
      }
      break;
    case 'legsDown':
      g.legs = Math.min(1, g.legs + dt / LEGS_SEC);
      if (g.legs >= 1) {
        g.mode = 'work';
        startSeg(g, 0);
      }
      break;
    case 'work': {
      g.segT += dt;
      const len = SEG_SEC[g.seg]!;
      const u = g.segT / len;
      if (g.seg === 2) g.jaw = Math.min(1, u);
      else if (g.seg === 5) g.jaw = Math.max(0, 1 - u);
      else moveTip(g, u);
      if (u < 1) break;
      if (g.seg === 2) {
        // 움켜쥠: 적재함 더미가 한 번만큼 준다
        g.holding = true;
        g.load = Math.max(0, g.load - 1 / g.plan);
      }
      if (g.seg === 4) {
        // 벌리기 시작: 떨어뜨린 파지가 섹터 쪽으로 떨어진다
        const a = g.tip.slew;
        g.drop = { x: CRANE.x + Math.cos(a) * g.tip.r, y: g.tip.y - CRANE.hang, z: -Math.sin(a) * g.tip.r };
        g.dropT = 0;
        g.holding = false;
      }
      // 구간을 넘친 시간은 다음 구간으로 넘긴다 (걸음마다 조금씩 늦어지지 않게)
      const spill = g.segT - len;
      if (g.seg < SEG_SEC.length - 1) startSeg(g, g.seg + 1);
      else {
        g.grabs += 1;
        if (g.grabs >= g.plan || g.load <= 0.001) {
          g.load = 0;
          beginStow(g);
        } else startSeg(g, 0);
      }
      g.segT = spill;
      break;
    }
    case 'stow':
      g.segT += dt;
      g.jaw = Math.max(0, g.jaw - dt / 0.2);
      moveTip(g, g.segT / STOW_SEC);
      if (g.segT >= STOW_SEC) g.mode = 'legsUp';
      break;
    case 'legsUp':
      g.legs = Math.max(0, g.legs - dt / LEGS_SEC);
      if (g.legs <= 0) {
        g.mode = 'stowed';
        g.rate = 1;
      }
      break;
  }
  solveCrane(g.tip, g.pose);
}

/** 다 접고 받침다리를 올렸나 (떠나도 되나) */
export function grappleStowed(g: GrappleSim): boolean {
  return g.mode === 'stowed';
}

/** "움직였나" 값 (Director.motionKey) */
export function grappleKey(g: GrappleSim): number {
  return g.legs * 3.1 + g.tip.slew * 2.3 + g.tip.r * 1.7 + g.tip.y * 1.3 + g.jaw * 4.7 + g.load * 2.9 + Math.min(g.dropT, DROP_SEC + 0.1) * 5.3;
}
