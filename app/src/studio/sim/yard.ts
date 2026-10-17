import type { Bale } from '@ecocycle/shared';
import { YARD_FLOW } from '../../config/yard';
import { BALE, BALE_REST, BALER, FORK_REACH, TRUCK, YARD } from '../world/layout';
import { FRESH_MS, advance, follow, mover } from './mover';
import type { Mover } from './mover';
import { angleDelta } from './paths';
import type { P2, Pose } from './paths';

// 출하 마당의 연출: 배출된 베일을 지게차가 줄 앞 칸에 쌓고, 출하 단계가 오면 싣고 화면 밖으로 나간다. three 미사용, 테스트 가능.
//  - 칸은 고정이다: 열(YARD.slotXs) × 단(YARD.levels). 베일은 서로 다른 칸에만 놓이고 같은 칸에 둘이 놓이지 않는다.
//    칸이 다 차면 압축기는 다음 베일을 내보내지 않고 기다린다(`yardFull`). 베일 오브젝트는 배출되는 순간에만 만든다.
//  - 지게차는 1~2대(YARD_FLOW.forkliftCount). 길(laneZ)은 한 줄 통로라서 한 대씩만 쓰고(`laneHolder`), 칸 앞 자리에서의 작업은
//    서로 세 열 넘게 떨어져 있을 때만 동시에 한다(`colBusy`). 모든 움직임은 앞쪽을 미리 살펴 겹치면 멈춘다(`hits`).
//  - 출하는 서버가 출하 단계를 준 베일 가운데 가장 먼저 만들어진 것부터 맡는다. 그 베일이 다른 베일 밑에 깔렸으면 맨 위 베일을 들고 나가되
//    두 베일의 이름표(id·출하 요청·순서)를 바꿔 달아, 서버가 출하했다고 한 베일 이름이 나가는 베일에 붙게 한다.
//  - 값은 서버 단계만 따른다: 베일 수·단계(적치/출하)는 서버 값이고 여기서는 그것을 장면으로 옮길 뿐이다.

export type BaleState = 'ejecting' | 'chute' | 'carried' | 'stack' | 'gone';

export interface BaleSim {
  active: boolean;
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
}

type Leg =
  | { kind: 'drive'; to: P2; reverse: boolean }
  | { kind: 'turn'; heading: number }
  | { kind: 'fork'; height: number }
  | { kind: 'clamp'; closed: boolean }
  | { kind: 'call'; fn: () => void }
  | { kind: 'lane'; take: boolean }
  | { kind: 'wait'; sec: number };

interface Task {
  kind: 'store' | 'ship' | 'home';
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
  /** 화면 밖에 나가 있다 */
  away: boolean;
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
}

export interface YardAudit {
  /** 장면에 있는 베일 */
  active: number;
  stacked: number;
  chute: number;
  ejecting: number;
  carried: number;
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
/** 칸에 놓인 것 + 배출구 한 개 + 지게차가 든 것(칸을 비우고 나온 것)에 여유 */
const BALE_POOL = SLOTS + 4;

const FACE_PLUS_Z = -Math.PI / 2;
const EJECT_FROM_Z = BALER.strapZ + 0.3;
const EJECT_SEC = 3.2;
/** 빈 포크 높이 */
const LOW_FORK = 0.3;
const CHUTE: P2 = [BALE_REST[0], BALE_REST[2] - FORK_REACH];
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
/** 서로 비켜 가는 여유(폭 한쪽 m) */
const CLEAR = 0.02;
const TURN_R = 1.45;

const slotCol = (s: number): number => s % COLS;
const slotLevel = (s: number): number => Math.floor(s / COLS);

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

export class Yard {
  readonly bales: BaleSim[] = [];
  readonly forklifts: ForkliftSim[] = [];
  /** 칸이 다 차서 압축기가 베일을 내보내지 못하고 기다린다 */
  yardFull = false;
  /** 막혀서 가장 오래 기다린 시간(초). 시험·점검용 */
  maxBlockedSec = 0;
  /** 칸에 쌓은 수, 화면 밖으로 출하한 수, 깔린 베일 때문에 이름표를 바꾼 수 (시험·점검용) */
  readonly stats = { stored: 0, shipped: 0, swaps: 0 };
  events: YardEvents = {};

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

  constructor() {
    for (let i = 0; i < BALE_POOL; i += 1) this.bales.push({ active: false, id: '', state: 'gone', x: 0, y: 0, z: 0, rot: 0, slot: -1, t: 0, seq: 0, ship: false, owner: 0 });
    for (let i = 0; i < YARD_FLOW.forkliftCount; i += 1) {
      const home = YARD.homes[i]!;
      this.forklifts.push({ ...mover(home[0], home[1], FACE_PLUS_Z), id: i + 1, fork: LOW_FORK, clamp: 0, carrying: null, legs: [], task: null, idleT: 0, away: false, home, col: -1, target: -1, blockedT: 0 });
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
      for (const b of this.bales) if (b.active && !listed.has(b.id)) b.ship = true;
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
  }

  baleById(id: string): BaleSim | undefined {
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

  step(dt: number, obstacles: readonly Obstacle[]): void {
    this.tryEject();
    for (const f of this.forklifts) this.stepForklift(f, dt, obstacles);
    // 든 베일은 지게차가 움직인 뒤의 자세를 따른다 (한 걸음 늦으면 도는 동안 본체와 어긋난다)
    this.stepBales(dt);
    this.dispatch();
    const full = this.pending.length > 0 && this.pickSlot(null) < 0;
    if (full !== this.yardFull) {
      this.yardFull = full;
      this.events.onFull?.(full);
    }
  }

  private chuteFree(): boolean {
    for (const b of this.bales) {
      if (!b.active) continue;
      if (b.state === 'ejecting' || b.state === 'chute') return false;
      // 막 집어 올린 베일이 아직 배출구 앞에 걸쳐 있으면 다음 베일을 내보내지 않는다
      if (b.state === 'carried' && Math.abs(b.x - BALE_REST[0]) < 0.7 && b.z > BALE_REST[2] - BALE.d - 0.6) return false;
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
    bale.x = BALE_REST[0];
    bale.y = BALE_REST[1];
    bale.z = EJECT_FROM_Z;
    this.events.onEject?.();
  }

  private stepBales(dt: number): void {
    for (const b of this.bales) {
      if (!b.active) continue;
      if (b.state === 'ejecting') {
        b.t += dt / EJECT_SEC;
        const k = Math.min(1, b.t);
        const ease = k * k * (3 - 2 * k);
        b.z = EJECT_FROM_Z + (BALE_REST[2] - EJECT_FROM_Z) * ease;
        if (k >= 1) b.state = 'chute';
      } else if (b.state === 'carried') {
        const f = this.forklifts[b.owner - 1];
        if (!f) continue;
        b.x = f.x + Math.cos(f.heading) * FORK_REACH;
        b.z = f.z - Math.sin(f.heading) * FORK_REACH;
        b.y = f.fork;
        b.rot = f.heading;
      }
    }
  }

  // ── 일 나누기 ───────────────────────────────────────────────────────

  private idle(f: ForkliftSim): boolean {
    return f.legs.length === 0 && !f.away && f.task === null;
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

    // 출하: 서버가 출하 단계를 준 베일 중 가장 먼저 만들어진 것부터. 지금 맡을 수 없는 것은 건너뛴다
    for (;;) {
      let any = false;
      for (const f of this.forklifts) any ||= this.idle(f);
      if (!any) break;
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
    let f = this.nearestIdle(BALE_REST[0], slotCol(slot), true);
    if (!f) {
      // 배정된 칸 곁에서 다른 지게차가 일하고 있다: 비어 있는 다른 칸이 있으면 바꾼다 (위에 이어 배정된 칸이 없을 때만)
      const any = this.nearestIdle(BALE_REST[0], 0, false);
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
    this.route(f, legs, cur, CHUTE[0], CHUTE[1], true, { afterExit: [{ kind: 'fork', height: BALE_REST[1] }] });
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
    );
    // 길로 빠져나와 화면 끝으로
    legs.push({ kind: 'lane', take: true }, { kind: 'drive', to: [sx, YARD.laneZ], reverse: true }, { kind: 'call', fn: () => this.leavePocket(f) });
    cur.z = YARD.laneZ;
    legs.push({ kind: 'fork', height: LOW_FORK + 0.1 }, { kind: 'turn', heading: Math.PI }, { kind: 'drive', to: [YARD.exitX, YARD.laneZ], reverse: false });
    legs.push(
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
          f.away = true;
          f.speed = 0;
          if (this.laneHolder === f) this.laneHolder = null;
        },
      },
      { kind: 'wait', sec: YARD_FLOW.awaySec },
      { kind: 'lane', take: true },
      {
        kind: 'call',
        fn: () => {
          f.away = false;
          f.fork = LOW_FORK;
          f.clamp = 0;
          f.heading = 0;
          f.x = YARD.exitX;
          f.z = YARD.laneZ;
          const back: Leg[] = [];
          this.route(f, back, { x: f.x, z: f.z }, f.home[0], f.home[1], true);
          f.legs.push(...back);
        },
      },
    );
    top.owner = f.id;
    wanted.owner = f.id;
    f.target = col;
    this.begin(f, { kind: 'ship', bale: top }, legs);
  }

  private leavePocket(f: ForkliftSim): void {
    f.col = -1;
  }

  /**
   * 지금 자리(cur)에서 목표 자리까지 길을 따라가는 동작을 legs에 잇고 cur을 목표로 옮긴다.
   * 칸 앞 자리·배출구 앞에 있으면 먼저 후진으로 길에 나오고, 길에서는 한 대씩만 다닌다(laneHolder).
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
    }
    legs.push(...(opts.afterExit ?? []));
    if (Math.abs(cur.x - tx) > 0.05) {
      legs.push({ kind: 'turn', heading: tx > cur.x ? 0 : Math.PI }, { kind: 'drive', to: [tx, lane], reverse: false });
      cur.x = tx;
    }
    if (tz > lane + 0.3) {
      const enterCol = opts.enterCol ?? -1;
      legs.push(...(opts.beforeEnter ?? []), { kind: 'turn', heading: FACE_PLUS_Z }, { kind: 'drive', to: [tx, tz], reverse: false });
      if (enterCol >= 0) legs.push({ kind: 'call', fn: () => void (f.col = enterCol) });
      cur.z = tz;
    }
    if (release) legs.push({ kind: 'lane', take: false });
  }

  // ── 지게차 움직임 ───────────────────────────────────────────────────

  /** 이 자세의 지게차(또는 원: turnR > 0)가 다른 지게차·트럭에 닿는가 */
  private hits(f: ForkliftSim, x: number, z: number, heading: number, turnR: number, obstacles: readonly Obstacle[]): boolean {
    const a = setBox(this.boxA, x, z, heading, FORK_BACK, f.carrying ? LOAD_TIP : FORK_TIP, HALF_W + CLEAR);
    const b = this.boxB;
    for (const g of this.forklifts) {
      if (g === f || g.away) continue;
      setBox(b, g.x, g.z, g.heading, FORK_BACK, g.carrying ? LOAD_TIP : FORK_TIP, HALF_W + CLEAR);
      if (turnR > 0 ? discHitsBox(b, x, z, turnR) : boxesOverlap(a, b)) return true;
    }
    for (const t of obstacles) {
      if (!t.active) continue;
      // 트럭에는 크게 비켜선다 (트럭 쪽은 지게차를 보지 않는다)
      setBox(b, t.x, t.z, t.heading, -TRUCK.length / 2, TRUCK.length / 2, TRUCK.width / 2 + 0.35);
      if (turnR > 0 ? discHitsBox(b, x, z, turnR) : boxesOverlap(a, b)) return true;
    }
    return false;
  }

  private stepForklift(f: ForkliftSim, dt: number, obstacles: readonly Obstacle[]): void {
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
      case 'wait':
        leg.sec -= dt;
        done = leg.sec <= 0;
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
        } else if (this.hits(f, f.x, f.z, f.heading, f.carrying ? TURN_R + 0.15 : TURN_R, obstacles)) {
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
        blocked = this.hits(f, f.x + ux * look, f.z + uz * look, f.heading, 0, obstacles);
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

  /** 지금 장면의 겹침과 칸 정합을 센다. 새 객체를 만드니 그리기 중에는 부르지 않는다 */
  audit(obstacles: readonly Obstacle[] = []): YardAudit {
    const out: YardAudit = { active: 0, stacked: 0, chute: 0, ejecting: 0, carried: 0, waiting: this.pending.length, slotsUsed: 0, slots: SLOTS, yardFull: this.yardFull, slotErrors: [], baleOnBale: 0, forkOnBale: 0, forkOnFork: 0, forkOnTruck: 0, maxBlockedSec: this.maxBlockedSec };
    const live = this.bales.filter((b) => b.active);
    out.active = live.length;
    for (const b of live) {
      if (b.state === 'stack') out.stacked += 1;
      else if (b.state === 'chute') out.chute += 1;
      else if (b.state === 'ejecting') out.ejecting += 1;
      else if (b.state === 'carried') out.carried += 1;
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
      if (f.away) continue;
      setBox(a, f.x, f.z, f.heading, FORK_BACK, BODY_FRONT, HALF_W);
      for (const b of live) {
        setBox(c, b.x, b.z, b.rot, -BALE.d / 2, BALE.d / 2, BALE.w / 2);
        if (boxesOverlap(a, c)) out.forkOnBale += 1;
      }
      // 양쪽 클램프 판과 베일: 실제 판의 높이와 폭으로 검사한다.
      for (const b of live) {
        if (b === f.carrying || b.owner === f.id) continue;
        // 포크가 가리키는 바로 앞의 베일(같은 열의 아래 단)은 지금 일하는 대상이라 거른다
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
      if (f.away) continue;
      setBox(a, f.x, f.z, f.heading, FORK_BACK, f.carrying ? LOAD_TIP : FORK_TIP, HALF_W);
      for (let j = i + 1; j < this.forklifts.length; j += 1) {
        const g = this.forklifts[j]!;
        if (g.away) continue;
        setBox(c, g.x, g.z, g.heading, FORK_BACK, g.carrying ? LOAD_TIP : FORK_TIP, HALF_W);
        if (boxesOverlap(a, c)) out.forkOnFork += 1;
      }
      for (const t of obstacles) {
        if (!t.active) continue;
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
}
