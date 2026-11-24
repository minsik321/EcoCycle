import type { Bale } from '@ecocycle/shared';
import { YARD_FLOW } from '../../config/yard';
import { BALE, BALER, BALE_REST, CHUTE_HEADING, FORK_REACH, LOAD_BED_Y, LOAD_SLOTS, TRUCK, YARD, YARD_FRAME, railAt, worldToYard, yardToWorld } from '../world/layout';
import { FRESH_MS, advance, follow, mover } from './mover';
import type { Mover } from './mover';
import { angleDelta, headingTo } from './paths';
import type { P2, Path, Pose } from './paths';
import type { Token } from './token';

// 베일 적치·출하의 연출. three 미사용, 테스트 가능. 좌표는 모두 "마당 좌표계"(world/layout의 YARD_FRAME: 남동 적치 구역에 맞춰 돈 좌표)다.
//  - 남동 구역: 압축기 배출구에서 나온 서버 베일을 지게차가 길 앞 칸에 쌓는다. 칸은 고정이다: 열(YARD.slotXs) × 단(YARD.levels).
//    베일은 서로 다른 칸에만 놓이고 같은 칸에 둘이 놓이지 않는다. 칸이 다 차면 압축기는 다음 베일을 내보내지 않고 기다린다(`yardFull`).
//  - 북서 구역: 고정 재고("예시", world/buildWorld가 그린다). 서버 값이 아니고 쌓인 모양도 바뀌지 않는다.
//  - 서버가 출하했다고 한 베일: 지게차가 남동 칸에서 꺼내 마당을 가로질러 북서 고정 재고로 옮긴다(재고 앞에 내려놓으면 사라진다).
//    이렇게 정한 이유: 출하 화면(상차 차량)은 북서에서 꺼내 싣는 "예시"인데, 남동의 서버 베일을 그 자리에서 지우면 베일이 허공으로 사라지고,
//    남동에서 바로 상차 차량에 실으면 "출하는 북서에서" 흐름과 어긋난다. 그래서 출하된 서버 베일은 북서 재고로 들어가는 것으로 보여 주고,
//    실제로 실려 나가는 모습은 북서 재고에서 꺼내는 예시 연출이 맡는다(서버 베일 수·단계는 그대로 남동 칸에 맞는다).
//  - 출하는 서버가 출하 단계를 준 베일 가운데 가장 먼저 만들어진 것부터 맡는다. 그 베일이 다른 베일 밑에 깔렸으면 맨 위 베일을 들고 나가되
//    두 베일의 이름표(id·출하 요청·순서)를 바꿔 달아, 서버가 출하했다고 한 베일 이름이 나가는 베일에 붙게 한다.
//  - 상차 차량("예시")이 상차 자리에 서면 지게차가 북서 재고에서 베일을 한 개씩 꺼내 적재함에 싣는다(LOAD_SLOTS만큼).
//  - 지게차는 1~2대(YARD_FLOW.forkliftCount). 남동 길(laneZ)은 한 줄 통로라서 한 대씩만 쓰고(`laneHolder`), 칸 앞 작업은
//    서로 세 열 넘게 떨어져 있을 때만 동시에 한다(`colBusy`). 모든 움직임은 앞쪽을 미리 살펴 겹치면 멈춘다(`hits`).
//  - 트럭이 다니는 마당 안쪽 길을 가로지를 때는 마당 차례(`yardToken`, 트럭과 같은 것)를 잡는다. 남동 길에 들어서기 전에 잡고,
//    가로질러 돌아와 트럭 길 밖(대기점 YARD.crossing[0])에 닿으면 놓는다. 길을 잡은 채 차례를 기다리지 않아서 서로 막히지 않는다.
//  - 값은 서버 단계만 따른다: 베일 수·단계(적치/출하)는 서버 값이고 여기서는 그것을 장면으로 옮길 뿐이다.

export type BaleState = 'ejecting' | 'chute' | 'carried' | 'stack' | 'loaded' | 'gone';

export interface BaleSim {
  active: boolean;
  /** 서버 베일 아이디. 북서 재고에서 꺼낸 예시 베일은 빈 문자열 */
  id: string;
  state: BaleState;
  x: number;
  y: number;
  z: number;
  rot: number;
  /** 칸 번호(단 × 열 + 열). 칸에 있거나 놓으러 가는 중이면 그 칸, 아니면 -1 */
  slot: number;
  t: number;
  /** 처음 본 순서(먼저 만들어진 베일일수록 작다) */
  seq: number;
  /** 서버가 출하 단계를 줬다 */
  ship: boolean;
  /** 맡은 지게차 번호(1~), 없으면 0 */
  owner: number;
  /** 상차 차량에 실린 자리(LOAD_SLOTS 번호), 아니면 -1 */
  load: number;
}

type Leg =
  | { kind: 'drive'; to: P2; reverse: boolean }
  | { kind: 'turn'; heading: number }
  | { kind: 'fork'; height: number }
  | { kind: 'clamp'; closed: boolean }
  | { kind: 'call'; fn: () => void }
  | { kind: 'lane'; take: boolean }
  | { kind: 'token'; take: boolean };

interface Task {
  kind: 'store' | 'ship' | 'load' | 'home';
  bale: BaleSim | null;
}

export interface ForkliftSim extends Mover {
  /** 1부터 */
  id: number;
  fork: number;
  /** 0: 클램프 열림, 1: 베일 양옆을 잡음 */
  clamp: number;
  carrying: BaleSim | null;
  legs: Leg[];
  task: Task | null;
  idleT: number;
  home: P2;
  /** 지금 칸 앞 자리에 서 있는 열 번호, 없으면 -1 (길로 빠져나올 때 풀린다) */
  col: number;
  /** 하러 가는 열 번호, 없으면 -1 (일을 맡을 때 정해지고 일이 끝나면 풀린다) */
  target: number;
  /** 막혀서 기다린 시간(초) */
  blockedT: number;
}

export interface Obstacle extends Pose {
  active: boolean;
  /** 상차 차량("예시"): 싣는 지게차는 이 차 곁에 붙는다 */
  example?: boolean;
}

/** 상차 차량("예시")의 상태 (월드 좌표). Director가 매 걸음 적는다 */
export interface LoaderState {
  present: boolean;
  /** 상차 자리에 서서 싣기를 기다린다 */
  parked: boolean;
  x: number;
  z: number;
  heading: number;
  /** 실린 베일 수 */
  loaded: number;
}

export interface YardAudit {
  /** 장면에 있는 서버 베일 */
  active: number;
  stacked: number;
  chute: number;
  ejecting: number;
  carried: number;
  /** 상차 차량에 실린 예시 베일 */
  loaded: number;
  /** 압축기가 내보내지 못하고 기다리는 베일(서버는 '적치'로 센다) */
  waiting: number;
  slotsUsed: number;
  slots: number;
  yardFull: boolean;
  /** 같은 칸에 둘, 칸 번호와 위치가 어긋남 */
  slotErrors: string[];
  baleOnBale: number;
  forkOnBale: number;
  forkOnFork: number;
  forkOnTruck: number;
  maxBlockedSec: number;
}

const COLS = YARD.slotXs.length;
const LEVELS = YARD.levels;
const SLOTS = COLS * LEVELS;
/** 칸에 놓인 것 + 배출구 한 개 + 지게차가 든 것에 여유 + 상차 차량에 실린 것 */
const BALE_POOL = SLOTS + 4 + LOAD_SLOTS.length;

const FACE_PLUS_Z = -Math.PI / 2;
const EJECT_SEC = 3.2;
/** 빈 포크 높이 */
const LOW_FORK = 0.3;
/** 대기 자리에 선 지게차가 이만큼 가만히 있으면 대기 자리로 돌아간다 */
const IDLE_HOME_SEC = 0.4;
/** 이웃한 칸 줄 작업끼리 이만큼 떨어져야 동시에 한다(열 수). 길에서 도는 원(≈1.6m)이 옆 줄의 지게차에 닿지 않는 거리 */
const COL_GAP = 3;

// 지게차 모양(자기 앞뒤 기준): 뒤 -0.62, 포크 끝 1.4, 베일을 들면 1.58, 폭 ±0.43. 본체는 마스트 앞(0.56)까지.
const FORK_BACK = -0.62;
const FORK_TIP = 1.4;
const LOAD_TIP = FORK_REACH + BALE.d / 2;
const HALF_W = 0.43;
const BODY_FRONT = 0.56;
/** 지게차가 마당 차례를 이만큼 기다리면 다음 차례를 맡아 둔다(초). 평소에는 트럭이 먼저이고, 트럭이 끊이지 않을 때(느린 화면에서 서버 값이 빨리 흐를 때)만 쓰인다 */
const TOKEN_PATIENCE_SEC = 60;
/** 서로 비켜 가는 여유(폭 한쪽 m) */
const CLEAR = 0.02;
const TURN_R = 1.45;
/** 상차 차량 곁에서 지게차 가운데가 차 가운데 선에서 떨어진 거리 (본체 앞이 적재함 옆에 닿지 않게) */
const LOAD_SIDE = TRUCK.width / 2 + BODY_FRONT + 0.06;

const slotCol = (s: number): number => s % COLS;
const slotLevel = (s: number): number => Math.floor(s / COLS);

/** 마당 좌표 (x, z) */
const tmpW = { x: 0, z: 0 };
function toYard(x: number, z: number): P2 {
  worldToYard(x, z, tmpW);
  return [tmpW.x, tmpW.z];
}

/** 배출구 안쪽(결속부 끝)에서 배출구 밖 멈추는 자리까지 (마당 좌표) */
const EJECT_FROM = toYard(...railAt(BALER.x, -(BALER.strapZ + 0.3)));
const REST = toYard(BALE_REST[0], BALE_REST[2]);
/** 베일이 배출구에서 나오는 방향 (마당 좌표계) */
const CHUTE_ROT = CHUTE_HEADING - YARD_FRAME.rotY;
/** 배출구 앞 자리로 들어서는 길 위의 점: 배출구 앞 자리에서 지게차가 보는 방향의 반대로 길까지 */
const CHUTE_ENTRY: P2 = (() => {
  const { x, z, heading } = YARD.chute;
  const t = (YARD.laneZ - z) / Math.sin(heading);
  return [x - t * Math.cos(heading), YARD.laneZ];
})();

interface Box {
  cx: number;
  cz: number;
  fx: number;
  fz: number;
  hx: number;
  hz: number;
}

const newBox = (): Box => ({ cx: 0, cz: 0, fx: 1, fz: 0, hx: 0, hz: 0 });

/** 중심 (x, z)에서 heading을 보는 상자: 앞뒤 [x0, x1], 반폭 hw */
function setBox(b: Box, x: number, z: number, heading: number, x0: number, x1: number, hw: number): Box {
  const fx = Math.cos(heading);
  const fz = -Math.sin(heading);
  const mid = (x0 + x1) / 2;
  b.cx = x + fx * mid;
  b.cz = z + fz * mid;
  b.fx = fx;
  b.fz = fz;
  b.hx = (x1 - x0) / 2;
  b.hz = hw;
  return b;
}

function axisSeparates(a: Box, b: Box, ax: number, az: number): boolean {
  const d = Math.abs((b.cx - a.cx) * ax + (b.cz - a.cz) * az);
  const ra = a.hx * Math.abs(a.fx * ax + a.fz * az) + a.hz * Math.abs(-a.fz * ax + a.fx * az);
  const rb = b.hx * Math.abs(b.fx * ax + b.fz * az) + b.hz * Math.abs(-b.fz * ax + b.fx * az);
  return d > ra + rb;
}

/** 두 상자(바닥 위 직사각형)가 겹치는가 */
export function boxesOverlap(a: Box, b: Box): boolean {
  return !(axisSeparates(a, b, a.fx, a.fz) || axisSeparates(a, b, -a.fz, a.fx) || axisSeparates(a, b, b.fx, b.fz) || axisSeparates(a, b, -b.fz, b.fx));
}

function discHitsBox(b: Box, cx: number, cz: number, r: number): boolean {
  const dx = cx - b.cx;
  const dz = cz - b.cz;
  const lx = dx * b.fx + dz * b.fz;
  const lz = -dx * b.fz + dz * b.fx;
  const qx = Math.max(-b.hx, Math.min(b.hx, lx));
  const qz = Math.max(-b.hz, Math.min(b.hz, lz));
  return Math.hypot(lx - qx, lz - qz) < r;
}

export interface YardEvents {
  /** 압축기가 베일을 배출구로 내보내기 시작했다 */
  onEject?: () => void;
  /** 칸이 다 차서 압축기가 기다리기 시작했거나 다시 내보낼 수 있게 됐다 */
  onFull?: (full: boolean) => void;
}

/** 마당 좌표의 트럭(장애물) */
interface LocalObstacle extends Obstacle {
  ref: Obstacle | null;
}

export class Yard {
  readonly bales: BaleSim[] = [];
  readonly forklifts: ForkliftSim[] = [];
  /** 칸이 다 차서 압축기가 베일을 내보내지 못하고 기다린다 */
  yardFull = false;
  /** 막혀서 가장 오래 기다린 시간(초). 시험·점검용 */
  maxBlockedSec = 0;
  /** 칸에 쌓은 수, 북서 재고로 옮긴(출하) 수, 깔린 베일 때문에 이름표를 바꾼 수, 상차 차량에 실은 수 (시험·점검용) */
  readonly stats = { stored: 0, shipped: 0, swaps: 0, loadedOut: 0 };
  events: YardEvents = {};
  /** 마당 좌표계가 월드에서 돈 각도 (그리는 쪽·선택 상자가 더한다) */
  readonly frameRotY = YARD_FRAME.rotY;

  private readonly slotBale: (BaleSim | null)[] = Array.from({ length: SLOTS }, () => null);
  private readonly slotRes: (BaleSim | null)[] = Array.from({ length: SLOTS }, () => null);
  /** 서버는 만들었다고 했지만 압축기가 아직 내보내지 못한 베일(칸이 없거나 배출구가 차 있다) */
  private readonly pending: Array<{ id: string; seq: number }> = [];
  /** 이미 출하되어 다시 만들지 않을 베일 */
  private readonly done = new Set<string>();
  private laneHolder: ForkliftSim | null = null;
  private seq = 0;
  private readonly boxA = newBox();
  private readonly boxB = newBox();
  /** 이번 걸음의 트럭 (마당 좌표) */
  private readonly obstacles: LocalObstacle[] = [];
  /** 상차 차량 (마당 좌표). 실린 베일 수는 loader.loaded */
  private readonly loader: LoaderState = { present: false, parked: false, x: 0, z: 0, heading: 0, loaded: 0 };
  private loaderLink: LoaderState | null = null;
  /** 상차 자리 하나마다 맡은 지게차가 있는가 */
  private readonly loadClaimed: boolean[] = LOAD_SLOTS.map(() => false);
  private readonly paths = new WeakMap<Path, Path>();

  constructor(private readonly token: Token | null = null) {
    for (let i = 0; i < BALE_POOL; i += 1) this.bales.push({ active: false, id: '', state: 'gone', x: 0, y: 0, z: 0, rot: 0, slot: -1, t: 0, seq: 0, ship: false, owner: 0, load: -1 });
    for (let i = 0; i < YARD_FLOW.forkliftCount; i += 1) {
      const home = YARD.homes[i]!;
      this.forklifts.push({ ...mover(home[0], home[1], FACE_PLUS_Z), id: i + 1, fork: LOW_FORK, clamp: 0, carrying: null, legs: [], task: null, idleT: 0, home, col: -1, target: -1, blockedT: 0 });
    }
  }

  // ── 서버 값 반영 ────────────────────────────────────────────────────

  /** store 값이 바뀔 때 부른다. 끊긴 동안에는 부르지 않는다. */
  sync(input: readonly Bale[], nowMs: number): void {
    let fresh: Bale[] | null = null;
    // 서버가 목록에서 뺀 베일은 오래전에 출하된 것이다: 장면에 남아 있으면 출하 단계가 온 것으로 본다 (마당에 영영 남지 않게)
    if (input.length > 0) {
      const listed = new Set<string>();
      for (const b of input) listed.add(b.id);
      for (const b of this.bales) if (b.active && b.id && !listed.has(b.id)) b.ship = true;
      for (let i = this.pending.length - 1; i >= 0; i -= 1) {
        if (listed.has(this.pending[i]!.id)) continue;
        this.done.add(this.pending[i]!.id);
        this.pending.splice(i, 1);
      }
    }
    for (const b of input) {
      if (this.done.has(b.id)) continue;
      const bale = this.baleById(b.id);
      if (bale) {
        if (b.stage === 'shipped') bale.ship = true;
        continue;
      }
      const p = this.pending.findIndex((x) => x.id === b.id);
      if (p >= 0) {
        // 내보내기 전에 서버가 출하했다고 하면 장면에는 나오지 않는다
        if (b.stage === 'shipped') {
          this.pending.splice(p, 1);
          this.done.add(b.id);
        }
        continue;
      }
      if (b.stage !== 'created') {
        this.done.add(b.id);
        continue;
      }
      (fresh ??= []).push(b);
    }
    if (!fresh) return;
    fresh.sort((a, b) => Date.parse(a.stageTimes.created ?? a.updatedAt) - Date.parse(b.stageTimes.created ?? b.updatedAt));
    for (const b of fresh) {
      this.seq += 1;
      const age = nowMs - Date.parse(b.stageTimes.created ?? b.updatedAt);
      const slot = age >= FRESH_MS && this.pending.length === 0 ? this.pickSlot(null) : -1;
      const bale = slot >= 0 ? this.allocate() : null;
      if (bale) {
        // 처음 본 대상이 이미 오래됐으면 지나간 장면을 지어내지 않고 있어야 할 칸에 바로 놓는다
        this.reset(bale, b.id, this.seq);
        this.slotRes[slot] = bale;
        this.placeInSlot(bale, slot);
      } else {
        this.pending.push({ id: b.id, seq: this.seq });
      }
    }
  }

  private allocate(): BaleSim | null {
    for (const b of this.bales) if (!b.active) return b;
    return null;
  }

  private reset(bale: BaleSim, id: string, seq: number): void {
    bale.active = true;
    bale.id = id;
    bale.seq = seq;
    bale.t = 0;
    bale.rot = FACE_PLUS_Z;
    bale.ship = false;
    bale.owner = 0;
    bale.slot = -1;
    bale.load = -1;
  }

  baleById(id: string): BaleSim | undefined {
    if (!id) return undefined;
    for (const b of this.bales) if (b.active && b.id === id) return b;
    return undefined;
  }

  // ── 칸 ──────────────────────────────────────────────────────────────

  private slotPos(slot: number, out: { x: number; y: number; z: number }): void {
    out.x = YARD.slotXs[slotCol(slot)] ?? 0;
    out.y = slotLevel(slot) * BALE.h;
    out.z = YARD.slotZ;
  }

  private readonly tmp = { x: 0, y: 0, z: 0 };

  private placeInSlot(bale: BaleSim, slot: number): void {
    this.slotPos(slot, this.tmp);
    this.slotRes[slot] = null;
    this.slotBale[slot] = bale;
    bale.slot = slot;
    bale.state = 'stack';
    bale.x = this.tmp.x;
    bale.y = this.tmp.y;
    bale.z = this.tmp.z;
    bale.rot = FACE_PLUS_Z;
    bale.owner = 0;
  }

  /** 이 열에 출하하러 오는 지게차가 있는가 (그 열에는 새 베일을 배정하지 않는다) */
  private shipColumn(col: number): boolean {
    for (const f of this.forklifts) if (f.task?.kind === 'ship' && f.target === col) return true;
    return false;
  }

  /**
   * 새 베일을 놓을 칸. 낮은 단부터, 같은 단에서는 배출구 쪽 열부터. 위 단은 아래 단이 차 있거나 배정돼 있을 때만.
   * 비어 있고 배정도 안 된 칸이 없으면 -1. self가 있으면 다른 지게차가 일하는 열 곁은 피한다.
   */
  private pickSlot(self: ForkliftSim | null | undefined): number {
    for (let s = 0; s < SLOTS; s += 1) {
      if (this.slotBale[s] || this.slotRes[s]) continue;
      const col = slotCol(s);
      if (slotLevel(s) > 0 && !(this.slotBale[s - COLS] || this.slotRes[s - COLS])) continue;
      if (this.shipColumn(col)) continue;
      if (self !== null && self !== undefined && this.colBusy(col, self)) continue;
      return s;
    }
    return -1;
  }

  private colBusy(col: number, self: ForkliftSim | null): boolean {
    for (const g of this.forklifts) {
      if (g === self) continue;
      if ((g.col >= 0 && Math.abs(g.col - col) < COL_GAP) || (g.target >= 0 && Math.abs(g.target - col) < COL_GAP)) return true;
    }
    return false;
  }

  private topOf(col: number): BaleSim | null {
    for (let l = LEVELS - 1; l >= 0; l -= 1) {
      const b = this.slotBale[l * COLS + col];
      if (b) return b;
    }
    return null;
  }

  private columnReserved(col: number): boolean {
    for (let l = 0; l < LEVELS; l += 1) if (this.slotRes[l * COLS + col]) return true;
    return false;
  }

  // ── 시간 진행 ───────────────────────────────────────────────────────

  /** trucks·loader는 월드 좌표다 (Director의 트럭). 마당 좌표로 옮겨 쓴다 */
  step(dt: number, trucks: readonly Obstacle[], loader: LoaderState | null = null): void {
    this.localize(trucks, loader);
    this.tryEject();
    for (const f of this.forklifts) this.stepForklift(f, dt);
    // 든 베일은 지게차가 움직인 뒤의 자세를 따른다 (한 걸음 늦으면 도는 동안 본체와 어긋난다)
    this.stepBales(dt);
    this.dispatch();
    const full = this.pending.length > 0 && this.pickSlot(null) < 0;
    if (full !== this.yardFull) {
      this.yardFull = full;
      this.events.onFull?.(full);
    }
  }

  private localize(trucks: readonly Obstacle[], loader: LoaderState | null): void {
    while (this.obstacles.length < trucks.length) this.obstacles.push({ active: false, x: 0, z: 0, heading: 0, ref: null });
    this.obstacles.length = trucks.length;
    trucks.forEach((t, i) => {
      const o = this.obstacles[i]!;
      o.active = t.active;
      o.example = t.example;
      o.ref = t;
      worldToYard(t.x, t.z, tmpW);
      o.x = tmpW.x;
      o.z = tmpW.z;
      o.heading = t.heading - YARD_FRAME.rotY;
    });
    this.loaderLink = loader;
    if (loader) {
      worldToYard(loader.x, loader.z, tmpW);
      this.loader.present = loader.present;
      this.loader.parked = loader.parked;
      this.loader.x = tmpW.x;
      this.loader.z = tmpW.z;
      this.loader.heading = loader.heading - YARD_FRAME.rotY;
    } else {
      this.loader.present = false;
      this.loader.parked = false;
    }
  }

  private chuteFree(): boolean {
    for (const b of this.bales) {
      if (!b.active) continue;
      if (b.state === 'ejecting' || b.state === 'chute') return false;
      // 막 집어 올린 베일이 아직 배출구 앞에 걸쳐 있으면 다음 베일을 내보내지 않는다
      if (b.state === 'carried' && Math.hypot(b.x - REST[0], b.z - REST[1]) < BALE.d + 0.6) return false;
    }
    return true;
  }

  private tryEject(): void {
    const next = this.pending[0];
    if (!next || !this.chuteFree()) return;
    const slot = this.pickSlot(null);
    if (slot < 0) return;
    const bale = this.allocate();
    if (!bale) return;
    this.pending.shift();
    this.reset(bale, next.id, next.seq);
    this.slotRes[slot] = bale;
    bale.slot = slot;
    bale.state = 'ejecting';
    bale.rot = CHUTE_ROT;
    bale.x = EJECT_FROM[0];
    bale.y = BALE_REST[1];
    bale.z = EJECT_FROM[1];
    this.events.onEject?.();
  }

  private stepBales(dt: number): void {
    for (const b of this.bales) {
      if (!b.active) continue;
      if (b.state === 'ejecting') {
        b.t += dt / EJECT_SEC;
        const k = Math.min(1, b.t);
        const ease = k * k * (3 - 2 * k);
        b.x = EJECT_FROM[0] + (REST[0] - EJECT_FROM[0]) * ease;
        b.z = EJECT_FROM[1] + (REST[1] - EJECT_FROM[1]) * ease;
        if (k >= 1) b.state = 'chute';
      } else if (b.state === 'carried') {
        const f = this.forklifts[b.owner - 1];
        if (!f) continue;
        b.x = f.x + Math.cos(f.heading) * FORK_REACH;
        b.z = f.z - Math.sin(f.heading) * FORK_REACH;
        b.y = f.fork;
        b.rot = f.heading;
      } else if (b.state === 'loaded') {
        // 상차 차량에 실린 베일은 차를 따라간다 (적재함 위 자리 LOAD_SLOTS)
        const slot = LOAD_SLOTS[b.load];
        if (!slot) continue;
        const h = this.loader.heading;
        b.x = this.loader.x + Math.cos(h) * slot[0];
        b.z = this.loader.z - Math.sin(h) * slot[0];
        b.y = LOAD_BED_Y + slot[1] * BALE.h;
        b.rot = h + Math.PI / 2;
      }
    }
  }

  // ── 상차 차량("예시") ───────────────────────────────────────────────

  /** 실을 만큼 다 실었고 싣는 중인 지게차도 없다 */
  loadingDone(): boolean {
    return (this.loaderLink?.loaded ?? 0) >= LOAD_SLOTS.length && !this.forklifts.some((f) => f.task?.kind === 'load' && f.carrying);
  }

  /** 상차 차량이 부지를 떠났다: 실린 예시 베일을 지운다 */
  clearLoaded(): void {
    for (const b of this.bales) {
      if (b.active && b.state === 'loaded') {
        b.active = false;
        b.state = 'gone';
        b.load = -1;
      }
    }
    this.loadClaimed.fill(false);
    if (this.loaderLink) this.loaderLink.loaded = 0;
  }

  // ── 일 나누기 ───────────────────────────────────────────────────────

  private idle(f: ForkliftSim): boolean {
    return f.legs.length === 0 && f.task === null;
  }

  private nearestIdle(x: number, col: number, needFree: boolean): ForkliftSim | null {
    let best: ForkliftSim | null = null;
    let bestD = Infinity;
    for (const f of this.forklifts) {
      if (!this.idle(f)) continue;
      if (needFree && this.colBusy(col, f)) continue;
      const d = Math.abs(f.x - x);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  private dispatch(): void {
    // 입고가 먼저다: 배출구의 베일이 놓이지 않으면 압축기가 막힌다
    let chute: BaleSim | null = null;
    for (const b of this.bales) if (b.active && b.state === 'chute' && b.owner === 0) chute = b;
    if (chute) this.assignStore(chute);

    // 출하(북서 재고로 옮기기): 서버가 출하 단계를 준 베일 중 가장 먼저 만들어진 것부터. 가로지르는 길은 마당 차례로 한 대씩 지난다.
    // 내려놓는 곳(YARD.drop)은 상차용 재고 앞 자리와 떨어져 있어 상차 중에도 옮길 수 있다
    for (;;) {
      let pick: BaleSim | null = null;
      let pickF: ForkliftSim | null = null;
      for (const b of this.bales) {
        if (!b.active || !b.ship || b.state !== 'stack' || b.owner !== 0) continue;
        if (pick && b.seq >= pick.seq) continue;
        const col = slotCol(b.slot);
        if (this.columnReserved(col)) continue;
        const top = this.topOf(col);
        if (!top || top.owner !== 0) continue;
        const f = this.nearestIdle(YARD.slotXs[col] ?? 0, col, true);
        if (!f) continue;
        pick = b;
        pickF = f;
      }
      if (!pick || !pickF) break;
      this.startShip(pickF, pick);
    }

    // 상차(예시): 상차 차량이 서 있고 실을 자리가 남았으면 북서 재고에서 한 개씩
    if (this.loader.parked && this.loaderLink && !this.forklifts.some((f) => f.task?.kind === 'load')) {
      const slots = LOAD_SLOTS.map((_, i) => i).filter((i) => !this.loadClaimed[i]);
      if (slots.length > 0) {
        const f = this.nearestIdle(YARD.laneEnd, -1, false);
        if (f) this.startLoad(f, slots);
      }
    }

    // 할 일이 없으면 대기 자리로
    for (const f of this.forklifts) {
      if (!this.idle(f)) continue;
      if (Math.hypot(f.x - f.home[0], f.z - f.home[1]) < 0.15) {
        f.idleT = 0;
        continue;
      }
      if (f.idleT < IDLE_HOME_SEC) continue;
      const legs: Leg[] = [];
      this.route(f, legs, { x: f.x, z: f.z }, f.home[0], f.home[1], true, { afterExit: [{ kind: 'fork', height: LOW_FORK }] });
      this.begin(f, { kind: 'home', bale: null }, legs);
    }
  }

  private begin(f: ForkliftSim, task: Task, legs: Leg[]): void {
    f.task = task;
    f.legs = legs;
    f.idleT = 0;
  }

  private assignStore(bale: BaleSim): void {
    let slot = bale.slot;
    let f = this.nearestIdle(REST[0], slotCol(slot), true);
    if (!f) {
      // 배정된 칸 곁에서 다른 지게차가 일하고 있다: 비어 있는 다른 칸이 있으면 바꾼다 (위에 이어 배정된 칸이 없을 때만)
      const any = this.nearestIdle(REST[0], 0, false);
      if (!any || (slotLevel(slot) < LEVELS - 1 && this.slotRes[slot + COLS])) return;
      this.slotRes[slot] = null;
      const alt = this.pickSlot(any);
      if (alt < 0) {
        this.slotRes[slot] = bale;
        return;
      }
      this.slotRes[alt] = bale;
      bale.slot = alt;
      slot = alt;
      f = any;
    }
    // 아래 단이 아직 놓이지 않았으면 기다린다(공중에 놓지 않는다)
    if (slotLevel(slot) > 0 && !this.slotBale[slot - COLS]) return;

    const target = slot;
    this.slotPos(target, this.tmp);
    const [sx, sy] = [this.tmp.x, this.tmp.y];
    const cur = { x: f.x, z: f.z };
    const legs: Leg[] = [];
    this.route(f, legs, cur, YARD.chute.x, YARD.chute.z, true, { afterExit: [{ kind: 'fork', height: BALE_REST[1] }] });
    legs.push(
      { kind: 'clamp', closed: true },
      {
        kind: 'call',
        fn: () => {
          bale.state = 'carried';
          bale.owner = f.id;
          f.carrying = bale;
        },
      },
      { kind: 'fork', height: BALE_REST[1] + 0.14 },
    );
    this.route(f, legs, cur, sx, YARD.pocketZ, true, { beforeEnter: [{ kind: 'fork', height: sy + 0.03 }], enterCol: slotCol(target) });
    legs.push({
      kind: 'call',
      fn: () => {
        this.placeInSlot(bale, target);
        this.stats.stored += 1;
        f.carrying = null;
      },
    });
    legs.push({ kind: 'clamp', closed: false });
    bale.owner = f.id;
    f.target = slotCol(target);
    this.begin(f, { kind: 'store', bale }, legs);
  }

  /** 서버가 출하했다고 한 베일: 칸에서 꺼내 북서 재고로 옮긴다 */
  private startShip(f: ForkliftSim, wanted: BaleSim): void {
    const col = slotCol(wanted.slot);
    const top = this.topOf(col)!;
    this.slotPos(top.slot, this.tmp);
    const sx = this.tmp.x;
    const sy = this.tmp.y;
    const cur = { x: f.x, z: f.z };
    const legs: Leg[] = [];
    this.route(f, legs, cur, sx, YARD.pocketZ, true, { beforeEnter: [{ kind: 'fork', height: sy + 0.03 }], enterCol: col });
    legs.push(
      { kind: 'clamp', closed: true },
      {
        kind: 'call',
        fn: () => {
          // 깔린 베일이면 맨 위 것을 들고 나가되 이름표를 바꿔 단다
          if (top !== wanted) {
            [top.id, wanted.id] = [wanted.id, top.id];
            [top.seq, wanted.seq] = [wanted.seq, top.seq];
            [top.ship, wanted.ship] = [wanted.ship, top.ship];
            wanted.owner = 0;
            this.stats.swaps += 1;
          }
          this.slotBale[top.slot] = null;
          top.slot = -1;
          top.state = 'carried';
          top.owner = f.id;
          f.carrying = top;
        },
      },
      { kind: 'fork', height: sy + 0.16 },
      // 마당 차례를 잡은 뒤에 길로 나온다 (길을 잡은 채 차례를 기다리지 않는다)
      { kind: 'token', take: true },
    );
    this.crossToDrop(f, legs, cur, LOW_FORK + 0.1);
    // 북서 재고 곁에 내려놓으면 재고에 섞여 사라진다. 내려놓는 곳에는 한 대만 가도록 마당 차례를 잡은 채 다녀온다
    legs.push(
      { kind: 'fork', height: 0.05 },
      {
        kind: 'call',
        fn: () => {
          const out = f.carrying;
          if (out) {
            out.active = false;
            out.state = 'gone';
            out.owner = 0;
            this.done.add(out.id);
            this.stats.shipped += 1;
          }
          f.carrying = null;
        },
      },
      { kind: 'clamp', closed: false },
    );
    this.dropBack(f, legs, cur);
    top.owner = f.id;
    wanted.owner = f.id;
    f.target = col;
    this.begin(f, { kind: 'ship', bale: top }, legs);
  }

  /**
   * 상차(예시): 북서 재고 앞에서 베일을 한 개씩 꺼내 상차 차량의 남은 자리에 차례로 싣는다.
   * 재고 앞 자리는 트럭 길 밖이라 마당 차례를 놓고 기다릴 수 있다: 재고 ↔ 상차 차량을 오갈 때만 차례를 잡는다
   */
  private startLoad(f: ForkliftSim, slots: number[]): void {
    const lo = this.loader;
    const h = lo.heading;
    const side = h + Math.PI / 2;
    const sxw = Math.cos(side);
    const szw = -Math.sin(side);
    const face = side + Math.PI;
    const turnPoint = YARD.crossing[YARD.crossing.length - 1]!;
    const { x: stockX, z: stockZ } = YARD.stock;
    const cur = { x: f.x, z: f.z };
    const legs: Leg[] = [{ kind: 'token', take: true }];
    this.crossOut(f, legs, cur, LOW_FORK, true);
    slots.forEach((slot, i) => {
      const [along, level] = LOAD_SLOTS[slot]!;
      // 적재함 위 자리(트럭 앞뒤 along)와, 그 왼쪽 곁 지게차 자리
      const bx = lo.x + Math.cos(h) * along;
      const bz = lo.z - Math.sin(h) * along;
      const at: P2 = [bx + sxw * LOAD_SIDE, bz + szw * LOAD_SIDE];
      const approach: P2 = [bx + sxw * (LOAD_SIDE + 1.6), bz + szw * (LOAD_SIDE + 1.6)];
      const forkY = LOAD_BED_Y + level * BALE.h + 0.03;
      const last = i === slots.length - 1;
      legs.push(
        { kind: 'clamp', closed: true },
        {
          kind: 'call',
          fn: () => {
            // 고정 재고는 줄지 않는다(예시): 재고 앞에서 베일 한 개를 든 것으로 보여 준다
            const b = this.allocate();
            if (!b) return;
            this.reset(b, '', 0);
            b.state = 'carried';
            b.owner = f.id;
            f.carrying = b;
          },
        },
        { kind: 'fork', height: 0.2 },
        { kind: 'token', take: true },
        { kind: 'drive', to: turnPoint, reverse: true },
        { kind: 'fork', height: forkY + 0.12 },
        { kind: 'turn', heading: headingTo(turnPoint[0], turnPoint[1], approach[0], approach[1]) },
        { kind: 'drive', to: approach, reverse: false },
        { kind: 'turn', heading: face },
        { kind: 'drive', to: at, reverse: false },
        { kind: 'fork', height: forkY },
        {
          kind: 'call',
          fn: () => {
            const b = f.carrying;
            if (b) {
              b.state = 'loaded';
              b.owner = 0;
              b.load = slot;
              this.stats.loadedOut += 1;
              if (this.loaderLink) this.loaderLink.loaded += 1;
            }
            f.carrying = null;
          },
        },
        { kind: 'clamp', closed: false },
        { kind: 'drive', to: approach, reverse: true },
        { kind: 'fork', height: LOW_FORK },
        { kind: 'turn', heading: headingTo(approach[0], approach[1], turnPoint[0], turnPoint[1]) },
        { kind: 'drive', to: turnPoint, reverse: false },
      );
      if (!last) {
        // 재고 앞으로 돌아가 차례를 놓는다 (트럭이 그 사이에 지나갈 수 있다)
        legs.push({ kind: 'turn', heading: headingTo(turnPoint[0], turnPoint[1], stockX, stockZ) }, { kind: 'drive', to: [stockX, stockZ], reverse: false }, { kind: 'token', take: false });
      }
      this.loadClaimed[slot] = true;
    });
    cur.x = turnPoint[0];
    cur.z = turnPoint[1];
    this.crossHome(f, legs, cur, YARD.crossing.length - 1);
    this.begin(f, { kind: 'load', bale: null }, legs);
  }

  /**
   * 남동 길 → 동쪽 끝 → 가로지르는 길(YARD.crossing) → 북서 재고 앞 자리까지. 마당 차례는 이미 잡았다(releaseAtStock이면 재고 앞에서 놓는다).
   * 길에서 빠져나온 뒤 포크를 fork 높이로 둔다
   */
  private crossOut(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }, fork: number, releaseAtStock: boolean): void {
    this.route(f, legs, cur, YARD.laneEnd, YARD.laneZ, false, { afterExit: [{ kind: 'fork', height: fork }] });
    let from: P2 = [cur.x, cur.z];
    YARD.crossing.forEach((p, i) => {
      legs.push({ kind: 'turn', heading: headingTo(from[0], from[1], p[0], p[1]) }, { kind: 'drive', to: p, reverse: false });
      // 대기점에 닿으면 남동 길을 놓는다 (길 밖이다)
      if (i === 0) legs.push({ kind: 'lane', take: false });
      from = p;
    });
    const { x, z } = YARD.stock;
    legs.push({ kind: 'turn', heading: headingTo(from[0], from[1], x, z) }, { kind: 'drive', to: [x, z], reverse: false });
    // 재고 앞 자리는 트럭 길 밖이다: 상차처럼 여기서 오래 머물면 마당 차례를 놓는다
    if (releaseAtStock) legs.push({ kind: 'token', take: false });
    cur.x = x;
    cur.z = z;
  }

  /** 남동 길 → 동쪽 끝 → 대기점 → 가로지르는 길의 둘째 점 → 출하 베일 내려놓는 곳(YARD.drop). 마당 차례는 이미 잡았다 */
  private crossToDrop(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }, fork: number): void {
    this.route(f, legs, cur, YARD.laneEnd, YARD.laneZ, false, { afterExit: [{ kind: 'fork', height: fork }] });
    let from: P2 = [cur.x, cur.z];
    const points = [YARD.crossing[0]!, YARD.crossing[1]!, ...YARD.drop.via];
    points.forEach((p, i) => {
      legs.push({ kind: 'turn', heading: headingTo(from[0], from[1], p[0], p[1]) }, { kind: 'drive', to: p, reverse: false });
      if (i === 0) legs.push({ kind: 'lane', take: false });
      from = p;
    });
    const { x, z, heading } = YARD.drop;
    legs.push({ kind: 'turn', heading }, { kind: 'drive', to: [x, z], reverse: false });
    cur.x = x;
    cur.z = z;
  }

  /** 내려놓는 곳에서 뒤로 빠져 같은 길을 되짚어 대기점 → 남동 길 → 대기 자리 (마당 차례는 잡은 채) */
  private dropBack(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }): void {
    const via = YARD.drop.via;
    const last = via[via.length - 1]!;
    legs.push({ kind: 'drive', to: last, reverse: true }, { kind: 'fork', height: LOW_FORK });
    let at: P2 = last;
    for (const p of [...via.slice(0, -1).reverse(), YARD.crossing[1]!]) {
      legs.push({ kind: 'turn', heading: headingTo(at[0], at[1], p[0], p[1]) }, { kind: 'drive', to: p, reverse: false });
      at = p;
    }
    cur.x = at[0];
    cur.z = at[1];
    this.crossHome(f, legs, cur, 1);
  }

  /**
   * 가로지르는 길의 i번째 점에서 대기점까지 되짚고, 남동 길을 잡아 동쪽 끝에 들어선 뒤에 마당 차례를 놓고 대기 자리로 간다.
   * 차례를 길에 들어선 뒤에 놓아야, 다음에 차례를 잡은 지게차가 길을 잡고 와서 대기점에 선 이 지게차와 서로 막히지 않는다
   */
  private crossHome(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }, from: number): void {
    let at: P2 = [cur.x, cur.z];
    for (let i = from - 1; i >= 0; i -= 1) {
      const p = YARD.crossing[i]!;
      legs.push({ kind: 'turn', heading: headingTo(at[0], at[1], p[0], p[1]) }, { kind: 'drive', to: p, reverse: false });
      at = p;
    }
    legs.push({ kind: 'lane', take: true }, { kind: 'turn', heading: headingTo(at[0], at[1], YARD.laneEnd, YARD.laneZ) }, { kind: 'drive', to: [YARD.laneEnd, YARD.laneZ], reverse: false }, { kind: 'token', take: false });
    cur.x = YARD.laneEnd;
    cur.z = YARD.laneZ;
    this.route(f, legs, cur, f.home[0], f.home[1], true);
  }

  private leavePocket(f: ForkliftSim): void {
    f.col = -1;
  }

  /**
   * 지금 자리(cur)에서 목표 자리까지 길을 따라가는 동작을 legs에 잇고 cur을 목표로 옮긴다.
   * 칸 앞 자리(길 앞 +z)나 배출구 앞 자리(길 뒤 −z)에 있으면 먼저 후진으로 길에 나오고, 길에서는 한 대씩만 다닌다(laneHolder).
   * 목표가 배출구 앞 자리면 길 위의 들어서는 점(CHUTE_ENTRY)에서 배출구 쪽으로 돌아 들어간다.
   * release: 도착하면 길을 놓는다 (칸 앞·배출구 앞·대기 자리는 모두 길 밖이다).
   * afterExit: 자리에서 빠져나온 뒤에 할 일(포크를 내려놓은 높이로 맞추기. 베일 밑에 포크가 있는 동안에는 올리지 않는다)
   * beforeEnter: 칸 앞 자리로 들어서기 전에 할 일(포크 높이 맞추기), enterCol: 칸 앞 자리에 서면 `col`로 적는 열
   */
  private route(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }, tx: number, tz: number, release: boolean, opts: { afterExit?: Leg[]; beforeEnter?: Leg[]; enterCol?: number } = {}): void {
    const lane = YARD.laneZ;
    if (Math.abs(cur.x - tx) < 0.05 && Math.abs(cur.z - tz) < 0.05) {
      // 이미 그 자리다: 길에 나갔다 들어오지 않는다
      legs.push(...(opts.afterExit ?? []), ...(opts.beforeEnter ?? []));
      return;
    }
    legs.push({ kind: 'lane', take: true });
    if (cur.z > lane + 0.3) {
      legs.push({ kind: 'drive', to: [cur.x, lane], reverse: true }, { kind: 'call', fn: () => this.leavePocket(f) });
      cur.z = lane;
    } else if (cur.z < lane - 0.3) {
      // 배출구 앞 자리: 들어왔던 방향 그대로 뒤로 빠진다
      legs.push({ kind: 'drive', to: CHUTE_ENTRY, reverse: true });
      cur.x = CHUTE_ENTRY[0];
      cur.z = lane;
    }
    legs.push(...(opts.afterExit ?? []));
    const toChute = tz < lane - 0.3;
    const laneX = toChute ? CHUTE_ENTRY[0] : tx;
    if (Math.abs(cur.x - laneX) > 0.05) {
      legs.push({ kind: 'turn', heading: laneX > cur.x ? 0 : Math.PI }, { kind: 'drive', to: [laneX, lane], reverse: false });
      cur.x = laneX;
    }
    if (toChute) {
      legs.push(...(opts.beforeEnter ?? []), { kind: 'turn', heading: YARD.chute.heading }, { kind: 'drive', to: [tx, tz], reverse: false });
      cur.x = tx;
      cur.z = tz;
    } else if (tz > lane + 0.3) {
      const enterCol = opts.enterCol ?? -1;
      legs.push(...(opts.beforeEnter ?? []), { kind: 'turn', heading: FACE_PLUS_Z }, { kind: 'drive', to: [tx, tz], reverse: false });
      if (enterCol >= 0) legs.push({ kind: 'call', fn: () => void (f.col = enterCol) });
      cur.z = tz;
    }
    if (release) legs.push({ kind: 'lane', take: false });
  }

  // ── 지게차 움직임 ───────────────────────────────────────────────────

  /** 이 자세의 지게차(또는 원: turnR > 0)가 다른 지게차·트럭에 닿는가 */
  private hits(f: ForkliftSim, x: number, z: number, heading: number, turnR: number): boolean {
    const a = setBox(this.boxA, x, z, heading, FORK_BACK, f.carrying ? LOAD_TIP : FORK_TIP, HALF_W + CLEAR);
    const b = this.boxB;
    for (const g of this.forklifts) {
      if (g === f) continue;
      setBox(b, g.x, g.z, g.heading, FORK_BACK, g.carrying ? LOAD_TIP : FORK_TIP, HALF_W + CLEAR);
      if (turnR > 0 ? discHitsBox(b, x, z, turnR) : boxesOverlap(a, b)) return true;
    }
    for (const t of this.obstacles) {
      if (!t.active) continue;
      // 싣는 지게차는 상차 차량 곁에 붙는다(포크가 적재함 위로 간다)
      if (t.example && f.task?.kind === 'load') continue;
      // 트럭에는 크게 비켜선다
      setBox(b, t.x, t.z, t.heading, -TRUCK.length / 2, TRUCK.length / 2, TRUCK.width / 2 + 0.35);
      if (turnR > 0 ? discHitsBox(b, x, z, turnR) : boxesOverlap(a, b)) return true;
    }
    return false;
  }

  private stepForklift(f: ForkliftSim, dt: number): void {
    const leg = f.legs[0];
    if (!leg) {
      f.task = null;
      f.target = -1;
      f.speed = 0;
      f.idleT += dt;
      f.blockedT = 0;
      return;
    }
    let done = false;
    let blocked = false;
    const who = `forklift:${f.id}`;
    switch (leg.kind) {
      case 'call':
        leg.fn();
        done = true;
        break;
      case 'lane':
        if (!leg.take) {
          if (this.laneHolder === f) this.laneHolder = null;
          done = true;
        } else if (this.laneHolder === null || this.laneHolder === f) {
          this.laneHolder = f;
          done = true;
        } else {
          blocked = true;
        }
        break;
      case 'token':
        if (!leg.take) {
          this.token?.release(who);
          done = true;
        } else if (!this.token || this.token.takeIfQuiet(who)) {
          done = true;
        } else {
          blocked = true;
          // 트럭이 끊이지 않아 오래 기다렸으면 다음 차례를 맡아 둔다 (지금 쓰는 트럭이 놓으면 이 지게차가 간다)
          if (f.blockedT > TOKEN_PATIENCE_SEC) this.token.reserve(who);
        }
        break;
      case 'clamp': {
        const target = leg.closed ? 1 : 0;
        f.clamp += Math.max(-dt * 4, Math.min(dt * 4, target - f.clamp));
        done = Math.abs(target - f.clamp) < 1e-3;
        if (done) f.clamp = target;
        break;
      }
      case 'fork': {
        const d = leg.height - f.fork;
        f.fork += Math.max(-YARD_FLOW.liftMps * dt, Math.min(YARD_FLOW.liftMps * dt, d));
        done = Math.abs(leg.height - f.fork) < 1e-3;
        break;
      }
      case 'turn': {
        const d = angleDelta(f.heading, leg.heading);
        if (Math.abs(d) < 1e-3) {
          f.heading = leg.heading;
          done = true;
        } else if (this.hits(f, f.x, f.z, f.heading, f.carrying ? TURN_R + 0.15 : TURN_R)) {
          blocked = true;
        } else {
          const stepA = Math.max(-YARD_FLOW.turnRadPerSec * dt, Math.min(YARD_FLOW.turnRadPerSec * dt, d));
          f.heading += stepA;
          f.wheel += stepA * 0.6;
          if (Math.abs(d - stepA) < 1e-3) {
            f.heading = leg.heading;
            done = true;
          }
        }
        break;
      }
      case 'drive': {
        const dx = leg.to[0] - f.x;
        const dz = leg.to[1] - f.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1e-3 && !f.path) {
          done = true;
          break;
        }
        if (!f.path) follow(f, [[f.x, f.z], leg.to], leg.reverse, 0);
        const accel = YARD_FLOW.accelMps2;
        // 멈추는 데 드는 거리만큼 앞을 미리 살핀다
        const look = 0.3 + (f.speed * f.speed) / (2 * accel * 2.2);
        const ux = dist > 1e-6 ? dx / dist : 0;
        const uz = dist > 1e-6 ? dz / dist : 0;
        blocked = this.hits(f, f.x + ux * look, f.z + uz * look, f.heading, 0);
        if (advance(f, dt, leg.reverse ? YARD_FLOW.reverseMps : YARD_FLOW.driveMps, accel, blocked)) {
          f.path = null;
          done = true;
        }
        break;
      }
    }
    if (blocked) {
      f.blockedT += dt;
      if (f.blockedT > this.maxBlockedSec) this.maxBlockedSec = f.blockedT;
    } else if (done || leg.kind !== 'drive') {
      f.blockedT = 0;
    }
    if (done) f.legs.shift();
  }

  // ── 점검 (시험·점검용: 겹침과 데이터 일치) ──────────────────────────

  /** 지금 장면의 겹침과 칸 정합을 센다. trucks는 월드 좌표. 새 객체를 만드니 그리기 중에는 부르지 않는다 */
  audit(trucks: readonly Obstacle[] = []): YardAudit {
    this.localize(trucks, this.loaderLink);
    const out: YardAudit = { active: 0, stacked: 0, chute: 0, ejecting: 0, carried: 0, loaded: 0, waiting: this.pending.length, slotsUsed: 0, slots: SLOTS, yardFull: this.yardFull, slotErrors: [], baleOnBale: 0, forkOnBale: 0, forkOnFork: 0, forkOnTruck: 0, maxBlockedSec: this.maxBlockedSec };
    const live = this.bales.filter((b) => b.active);
    // 서버 베일만 센다 (북서 재고에서 꺼낸 예시 베일은 아이디가 없다)
    out.active = live.filter((b) => b.id).length;
    for (const b of live) {
      if (b.state === 'stack') out.stacked += 1;
      else if (b.state === 'chute') out.chute += 1;
      else if (b.state === 'ejecting') out.ejecting += 1;
      else if (b.state === 'carried') out.carried += 1;
      else if (b.state === 'loaded') out.loaded += 1;
    }
    const seen = new Set<BaleSim>();
    for (let s = 0; s < SLOTS; s += 1) {
      const b = this.slotBale[s];
      if (!b) continue;
      out.slotsUsed += 1;
      if (seen.has(b)) out.slotErrors.push(`베일 ${b.id}이 두 칸에 있다`);
      seen.add(b);
      if (b.state !== 'stack' || b.slot !== s) out.slotErrors.push(`칸 ${s}의 베일 ${b.id} 상태 ${b.state} 칸 ${b.slot}`);
      this.slotPos(s, this.tmp);
      if (Math.abs(b.x - this.tmp.x) > 1e-6 || Math.abs(b.y - this.tmp.y) > 1e-6 || Math.abs(b.z - this.tmp.z) > 1e-6) out.slotErrors.push(`칸 ${s}의 베일 ${b.id} 위치가 칸과 다르다`);
      if (slotLevel(s) > 0 && !this.slotBale[s - COLS]) out.slotErrors.push(`칸 ${s}의 베일이 공중에 있다`);
    }
    for (const b of live) if (b.state === 'stack' && this.slotBale[b.slot] !== b) out.slotErrors.push(`베일 ${b.id}이 칸 ${b.slot}에 등록되지 않았다`);

    const a = newBox();
    const c = newBox();
    // 베일끼리: 바닥 위 직사각형이 겹치고 높이도 겹치면 겹친 것이다
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const p = live[i]!;
        const q = live[j]!;
        if (Math.abs(p.y - q.y) >= BALE.h - 0.03) continue;
        setBox(a, p.x, p.z, p.rot, -BALE.d / 2, BALE.d / 2, BALE.w / 2);
        setBox(c, q.x, q.z, q.rot, -BALE.d / 2, BALE.d / 2, BALE.w / 2);
        if (boxesOverlap(a, c)) out.baleOnBale += 1;
      }
    }
    // 지게차 본체(마스트 앞까지)와 모든 베일: 포크 위의 베일은 본체 앞에 놓여야 한다
    for (const f of this.forklifts) {
      setBox(a, f.x, f.z, f.heading, FORK_BACK, BODY_FRONT, HALF_W);
      for (const b of live) {
        setBox(c, b.x, b.z, b.rot, -BALE.d / 2, BALE.d / 2, BALE.w / 2);
        if (boxesOverlap(a, c)) out.forkOnBale += 1;
      }
      // 양쪽 클램프 판과 베일: 실제 판의 높이와 폭으로 검사한다.
      for (const b of live) {
        if (b === f.carrying || b.owner === f.id) continue;
        // 포크가 가리키는 바로 앞의 베일(같은 열의 아래 단, 적재함 위 베일)은 지금 일하는 대상이라 거른다
        const lat = Math.abs(-(b.x - f.x) * -Math.sin(f.heading) + (b.z - f.z) * Math.cos(f.heading));
        if (lat < 0.4 && (b.x - f.x) * Math.cos(f.heading) - (b.z - f.z) * Math.sin(f.heading) > 0) continue;
        if (f.fork + 0.52 <= b.y + 0.03 || f.fork + 0.12 >= b.y + 0.03 + BALE.h) continue;
        setBox(c, b.x, b.z, b.rot, -BALE.d / 2, BALE.d / 2, BALE.w / 2);
        for (const side of [-1, 1]) {
          const offset = side * (0.415 - f.clamp * 0.025);
          setBox(a, f.x + Math.sin(f.heading) * offset, f.z + Math.cos(f.heading) * offset, f.heading, 0.61, 1.37, 0.015);
          if (boxesOverlap(a, c)) out.forkOnBale += 1;
        }
      }
    }
    for (let i = 0; i < this.forklifts.length; i += 1) {
      const f = this.forklifts[i]!;
      setBox(a, f.x, f.z, f.heading, FORK_BACK, f.carrying ? LOAD_TIP : FORK_TIP, HALF_W);
      for (let j = i + 1; j < this.forklifts.length; j += 1) {
        const g = this.forklifts[j]!;
        setBox(c, g.x, g.z, g.heading, FORK_BACK, g.carrying ? LOAD_TIP : FORK_TIP, HALF_W);
        if (boxesOverlap(a, c)) out.forkOnFork += 1;
      }
      for (const t of this.obstacles) {
        if (!t.active) continue;
        // 상차 차량 곁에서는 포크가 적재함 위로 간다: 본체만 견준다
        if (t.example) setBox(a, f.x, f.z, f.heading, FORK_BACK, BODY_FRONT, HALF_W);
        else setBox(a, f.x, f.z, f.heading, FORK_BACK, f.carrying ? LOAD_TIP : FORK_TIP, HALF_W);
        setBox(c, t.x, t.z, t.heading, -TRUCK.length / 2, TRUCK.length / 2, TRUCK.width / 2);
        if (boxesOverlap(a, c)) out.forkOnTruck += 1;
      }
    }
    return out;
  }

  // ── 움직임 알림·기준점 ──────────────────────────────────────────────

  /** 이 시각의 베일·지게차 위치를 하나의 수로 묶는다(움직였나 보는 열쇠) */
  motionKey(): number {
    let k = 0;
    this.bales.forEach((b, i) => {
      if (b.active) k += (b.x * 1.1 + b.y * 3.7 + b.z * 2.3 + b.rot) * (i + 11);
    });
    this.forklifts.forEach((f, i) => {
      k += (f.x * 1.9 + f.z * 3.3 + f.heading * 5.1 + f.fork * 7.3 + f.clamp * 2.7) * (i + 1);
    });
    return k;
  }

  forklift(key: string): ForkliftSim | undefined {
    if (key === 'forklift') return this.forklifts[0];
    if (!key.startsWith('forklift:')) return undefined;
    return this.forklifts[Number(key.slice(9)) - 1];
  }

  /** 마당 좌표의 경로를 월드 좌표로 (고른 지게차의 점선) */
  worldPath(path: Path): Path {
    const cached = this.paths.get(path);
    if (cached) return cached;
    const pts: number[] = [];
    const w = { x: 0, z: 0 };
    for (let i = 0; i < path.pts.length; i += 2) {
      yardToWorld(path.pts[i]!, path.pts[i + 1]!, w);
      pts.push(w.x, w.z);
    }
    const out: Path = { pts, dist: path.dist, total: path.total };
    this.paths.set(path, out);
    return out;
  }
}
