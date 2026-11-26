import type { Bale } from '@ecocycle/shared';
import { YARD_FLOW } from '../../config/yard';
import { BALE, CLAMP_SCALE, CLAMP_SHIFT, FORKLIFT_SCALE, FORK_REACH, LOAD_BED_Y, LOAD_ORDER, LOAD_SLOTS, LOAD_TRUCK, YARD, YARD_FRAME, staticBaleCells, truckSize, worldToYard, yardToWorld } from '../world/layout';
import { FRESH_MS, advance, follow, mover } from './mover';
import type { Mover } from './mover';
import { angleDelta, headingTo } from './paths';
import type { P2, Path, Pose } from './paths';
import type { Token } from './token';

// 베일 적치의 연출. three 미사용, 테스트 가능. 좌표는 모두 "마당 좌표계"(world/layout의 YARD_FRAME: 레일 축에 나란한 좌표)다.
// 흐름(docs/dashboard-spec.md 3절, 사용자 요청 2026-11-25):
//  1. 압축기는 새 베일을 배출구 뒤 금속 받침대로 내보낸다. 롤러가 없어 새 베일이 앞 베일을 한 칸씩 밀어내고, 받침대 끝(0번)에 닿은 베일을 지게차가 집는다.
//     끝이 차 있고 받침대가 가득하면 압축기는 기다린다(`yardFull`).
//  2. 지게차가 받침대 끝 베일을 배출구 오른쪽(마당 쪽) 베일 저울에 올린다. 둘째 베일을 그 위에 겹쳐 올리면 두 개를 한 번에 잰다(무게 숫자 없음).
//  3. 잰 한 쌍을 들어 남동 칸 줄에 쌓는다(열마다 levels단, 한 번에 두 단). 남동은 점점 차오른다(비어 사라지지 않는다).
//  4. 남동의 빈 열이 seFreeColumnsMin보다 적으면 가장 오래된 열부터 한 쌍씩 북서 칸 줄로 옮긴다(줄 단위).
//  5. 서버가 출하(`shipped`)라 한 베일은 북서에서 빠진다: 북서에 있으면 그 베일(깔렸으면 맨 위 베일과 이름표를 바꿔 맨 위)을,
//     아직 남동·받침대·저울에 있으면 그 베일은 이름 없는 재고가 되고 북서 맨 위 베일 하나가 빠진다(이름표를 넘겨 받는다).
//  6. 상차 차량이 상차 자리에 서면 지게차가 북서 맨 위 베일을 하나씩 꺼내 적재함에 싣는다(LOAD_SLOTS만큼).
//  - 처음 장면을 열 때 남동·북서에 이름 없는 재고(숫자·이름이 없다)가 쌓여 있다(seStartColumns, nwStartColumns = YARD_SEED_BALES칸).
//    처음 본 오래된 적치 베일(서버 created)은 이 재고에 하나씩 이름을 붙인다(오래된 것부터 북서 → 남동, S2q). 모의 서버는 이 칸 수만큼
//    적치 베일을 가진 채 시작하므로 서버 베일 수 = 마당 베일 수다. 서버 베일이 오기 전(연결 전)이나 재고보다 적으면(시연, 실서버 초기)
//    남는 칸은 이름 없는 재고로 둔다(지금까지와 같음), 재고보다 많으면 남는 베일은 남동 빈 칸에 놓는다.
//  - 남동 길(laneZ)은 한 대씩만 쓴다(`laneHolder`): 받침대·저울·칸 앞 작업은 길을 잡은 채 한다. 대기 자리는 길 뒤(−z)라 길을 막지 않는다.
//  - 트럭이 다니는 마당 가운데(가로지르는 길)와 북서 길은 마당 차례(`yardToken`, 트럭과 같은 것)를 잡은 하나만 간다.
//    차례는 대기 자리에서 길을 잡기 전에 잡고, 돌아와 남동 길 동쪽 끝에 들어선 뒤에 놓는다.
//  - 모든 움직임은 앞쪽을 미리 살펴 겹치면 멈춘다(`hits`). 값은 서버 단계만 따른다(베일 수·적치/출하).

/** ground: 상차하려고 돌려 잡기 자리에 잠깐 내려놓은 베일 (S2j) */
export type BaleState = 'ejecting' | 'stand' | 'scale' | 'carried' | 'ground' | 'stack' | 'loaded' | 'gone';

export interface BaleSim {
  active: boolean;
  /** 서버 베일 아이디. 이름 없는 재고는 빈 문자열 */
  id: string;
  state: BaleState;
  x: number;
  y: number;
  z: number;
  rot: number;
  /** 칸 번호(남동 0~, 북서는 그 뒤). 칸에 있거나 놓으러 가는 중이면 그 칸, 아니면 -1 */
  slot: number;
  t: number;
  /** 처음 본 순서(먼저 만들어진 베일일수록 작다), 재고는 0 */
  seq: number;
  /** 맡은 지게차 번호(1~), 없으면 0 */
  owner: number;
  /** 상차 차량에 실린 차례(LOAD_ORDER 번호, 자리는 LOAD_SLOTS[LOAD_ORDER[load]]), 아니면 -1 */
  load: number;
  /** 받침대 위 자리(0이 끝), 저울 위 단(0·1), 아니면 -1 */
  pos: number;
  /** 받침대에서 밀려 움직이는 중: 시작 z */
  fromZ: number;
}

type Leg =
  | { kind: 'drive'; to: P2; reverse: boolean }
  | { kind: 'turn'; heading: number }
  | { kind: 'fork'; height: number }
  /** 포크 높이를 정해 두고 기다리지 않는다: 다음 움직임(달리기·돌기)과 함께 오르내린다 */
  | { kind: 'forkTo'; height: number }
  /** 제자리에서 기다린다 (저울에서 무게를 재는 동안 등) */
  | { kind: 'wait'; sec: number }
  | { kind: 'clamp'; closed: boolean }
  /** 클램프 판 사이를 베일 끝면(1.5 m)에 맞게 넓히거나 옆면(1.1 m)으로 되돌린다 (돌려 잡기, S2j) */
  | { kind: 'jaws'; wide: boolean }
  /** 클램프 판 사이를 베일 끝면(1.5 m)에 맞게 넓히거나 옆면(1.1 m)으로 되돌린다 (돌려 잡기, S2j) */
  | { kind: 'jaws'; wide: boolean }
  | { kind: 'call'; fn: () => void }
  | { kind: 'lane'; take: boolean }
  | { kind: 'token'; take: boolean };

type TaskKind = 'scale' | 'store' | 'transfer' | 'load' | 'home';

interface Task {
  kind: TaskKind;
}

export interface ForkliftSim extends Mover {
  /** 1부터 */
  id: number;
  fork: number;
  /** 0: 클램프 열림, 1: 베일 양옆을 잡음 */
  clamp: number;
  /** 든 베일(아래), 위에 겹쳐 든 베일 */
  carrying: BaleSim | null;
  carrying2: BaleSim | null;
  legs: Leg[];
  task: Task | null;
  idleT: number;
  home: P2;
  /** 막혀서 기다린 시간(초) */
  blockedT: number;
  /** forkTo로 정해 둔 포크 높이 (없으면 null): 다른 움직임과 함께 맞춘다 */
  forkGoal: number | null;
  /** wait 다리에서 기다린 시간(초) */
  waitT: number;
  /** 클램프를 넓혀 베일 끝면을 잡았다(베일 긴 쪽이 지게차 옆 방향): 상차 차량에 차 길이 방향으로 싣는다 */
  cross: boolean;
  /** 클램프 판 넓힘 0~1 (1이면 베일 끝면 간격) */
  wide: number;
}

export interface Obstacle extends Pose {
  active: boolean;
  /** 상차 차량: 싣는 지게차는 이 차 곁에 붙는다 */
  loader?: boolean;
}

/** 상차 차량의 상태 (월드 좌표). Director가 매 걸음 적는다 */
export interface LoaderState {
  present: boolean;
  /** 상차 자리에 서서 싣기를 기다린다 */
  parked: boolean;
  /** 서버 차량 아이디 (출하 베일의 vehicleId와 견준다) */
  id: string;
  x: number;
  z: number;
  heading: number;
  /** 실린 베일 수 */
  loaded: number;
  /** 서버가 이 차에 실었다고 한 베일 수 (차량 baleIds) */
  want: number;
  /** 서버 단계가 상차 중(loading)이다: 이때만 새로 싣는다 */
  loading: boolean;
  /** 서버는 이미 다 실었다(loaded 이후)는데 장면이 덜 실었다: 남은 베일을 빠르게 마저 싣는다 (S2j) */
  hurry?: boolean;
}

export interface YardAudit {
  /** 장면에 있는 서버 베일 (이름 없는 재고는 세지 않는다) */
  active: number;
  stacked: number;
  /** 남동·북서에 쌓인 베일 (재고 포함) */
  seStacked: number;
  nwStacked: number;
  onStand: number;
  onScale: number;
  ejecting: number;
  carried: number;
  /** 상차 차량에 실린 베일 */
  loaded: number;
  /** 압축기가 내보내지 못하고 기다리는 베일(서버는 '적치'로 센다) */
  waiting: number;
  slotsUsed: number;
  slots: number;
  yardFull: boolean;
  /** 같은 칸에 둘, 칸 번호와 위치가 어긋남, 공중 */
  slotErrors: string[];
  baleOnBale: number;
  forkOnBale: number;
  /** 지게차 본체·든 베일이 바탕 베일 벽(남동·북서 고정 재고)에 닿은 수 */
  forkOnWall: number;
  forkOnFork: number;
  forkOnTruck: number;
  maxBlockedSec: number;
}

const SE_COLS = YARD.seXs.length;
const NW_COLS = YARD.nwXs.length;
const LEVELS = YARD.levels;
const SE_SLOTS = SE_COLS * LEVELS;
const SLOTS = SE_SLOTS + NW_COLS * LEVELS;
/** 칸 + 받침대 3 + 저울 2 + 지게차가 든 것 + 상차 차량에 실린 것 */
const BALE_POOL = SLOTS + 3 + 2 + 4 + LOAD_ORDER.length;

/** 칸 줄을 볼 때의 방향: 남동 칸은 +z(길 앞), 받침대·저울·대기 자리·북서 칸은 −z(길 뒤) */
const FACE_PLUS_Z = -Math.PI / 2;
const FACE_MINUS_Z = Math.PI / 2;
const EJECT_SEC = 3.2;
/** 두 베일을 한 번에 재는 동안 저울 위에 두는 시간(초, 연출) */
export const WEIGH_SEC = 1.6;
/** 압축기가 이만큼 넘게 기다리면 적치 구역이 가득 찬 것으로 알린다(초) */
const FULL_AFTER_SEC = 20;
/** 빈 포크 높이 */
const LOW_FORK = 0.3;
const IDLE_HOME_SEC = 0.4;
/** 서버가 앞서 간 상차를 마저 실을 때 지게차 움직임 배속 */
const HURRY = 2.2;
/** 돌려 잡기: 내려놓은 뒤 물러나는 거리 */
const REGRIP_BACK = 0.75;
/** 상차: 차 곁에서 들어가기 전에 서는 거리(잡는 자리에서 더 밖으로) */
const LOAD_APPROACH = 0.7;
/** 상차 차량 앞을 돌 때: 앞 끝에서 나가는 거리, 옆으로 차 폭 밖 거리 */
const FRONT_GAP = 1.2;
const SIDE_GAP = 0.75;
/** 저울 앞에서 다음 베일을 기다리는 최대 시간(초): 받침대 밀기 한 번(EJECT_SEC)보다 조금 길게 */
const SCALE_WAIT_SEC = EJECT_SEC + 2;

const FS = FORKLIFT_SCALE;
// 지게차 모양(자기 앞뒤 기준): 뒤, 포크 끝, 베일을 들면, 폭, 본체 앞(마스트). 몸체는 FS배, 클램프는 CS배(베일에 맞춤)를 CLAMP_SHIFT만큼 당긴 것
const CS = CLAMP_SCALE;
const FORK_BACK = -0.62 * FS;
const FORK_TIP = 1.4 * CS - CLAMP_SHIFT;
const LOAD_TIP = FORK_REACH + BALE.d / 2;
const HALF_W = 0.43 * FS;
const BODY_FRONT = 0.56 * FS;
const JAW_OFFSET = 0.415 * CS;
const JAW_X0 = 0.61 * CS - CLAMP_SHIFT;
const JAW_X1 = 1.37 * CS - CLAMP_SHIFT;
const JAW_H0 = 0.12 * CS;
const JAW_H1 = 0.52 * CS;
const TOKEN_PATIENCE_SEC = 60;
const CLEAR = 0.02;
const TURN_R = 1.45 * FS;
/** 마당 차례 없이 쌓아도 되는 북서 열 (이 열부터 동쪽) */
const NW_FREE_FROM = 2;

const isSe = (s: number): boolean => s < SE_SLOTS;
const colOf = (s: number): number => (isSe(s) ? s % SE_COLS : (s - SE_SLOTS) % NW_COLS);
const levelOf = (s: number): number => (isSe(s) ? Math.floor(s / SE_COLS) : Math.floor((s - SE_SLOTS) / NW_COLS));
const seSlot = (col: number, level: number): number => level * SE_COLS + col;
const nwSlot = (col: number, level: number): number => SE_SLOTS + level * NW_COLS + col;

const tmpW = { x: 0, z: 0 };

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
  /** 받침대가 차서 압축기가 기다리기 시작했거나 다시 내보낼 수 있게 됐다 */
  onFull?: (full: boolean) => void;
}

interface LocalObstacle extends Obstacle {
  ref: Obstacle | null;
}

const { stand: STAND, scale: SCALE } = YARD;
const STAND_POCKET: P2 = [STAND.x, STAND.slots[0]! + FORK_REACH];
const SCALE_POCKET: P2 = [SCALE.x, SCALE.z + FORK_REACH];
const SE_POCKET_Z = YARD.slotZ - FORK_REACH;
/** 바탕 베일 칸 (마당 좌표, 겹침 점검용) */
const WALL_CELLS = [...staticBaleCells('se'), ...staticBaleCells('nw')];
const NW_POCKET_Z = YARD.nwSlotZ + FORK_REACH;

export class Yard {
  readonly bales: BaleSim[] = [];
  readonly forklifts: ForkliftSim[] = [];
  /** 받침대가 차서 압축기가 베일을 내보내지 못하고 기다린다 */
  yardFull = false;
  /** 막혀서 가장 오래 기다린 시간(초). 시험·점검용 */
  maxBlockedSec = 0;
  /** 저울에 잰 쌍, 남동에 쌓은 수, 북서로 옮긴 수, 북서에서 빠진(출하) 수, 이름표를 바꾼 수, 상차 차량에 실은 수 (시험·점검용) */
  readonly stats = { weighed: 0, stored: 0, transferred: 0, shipped: 0, swaps: 0, loadedOut: 0 };
  /** 북서로 옮긴 남동 열의 나이(쌓기 시작한 순서): 오래된 줄부터 옮기는지 시험이 본다 (최근 40개) */
  readonly transferAges: number[] = [];
  events: YardEvents = {};
  /** 마당 좌표계가 월드에서 돈 각도 (그리는 쪽·선택 상자가 더한다) */
  readonly frameRotY = YARD_FRAME.rotY;

  private readonly slotBale: (BaleSim | null)[] = Array.from({ length: SLOTS }, () => null);
  private readonly slotRes: (BaleSim | null)[] = Array.from({ length: SLOTS }, () => null);
  /** 열이 처음 차기 시작한 순서 (오래된 줄을 고른다) */
  private readonly seAge: number[] = Array.from({ length: SE_COLS }, () => 0);
  private readonly nwAge: number[] = Array.from({ length: NW_COLS }, () => 0);
  private ageSeq = 0;
  /** 서버는 만들었다고 했지만 압축기가 아직 내보내지 못한 베일 */
  private readonly pending: Array<{ id: string; seq: number }> = [];
  /** 이미 출하되어 다시 만들지 않을 베일 */
  private readonly done = new Set<string>();
  private laneHolder: ForkliftSim | null = null;
  private seq = 0;
  /** 받침대 밀기(배출) 진행 0~1, 움직이지 않으면 -1 */
  private standMove = -1;
  /** 내보낼 베일이 있는데 받침대가 막혀 기다린 시간(초) */
  private blockedEjectT = 0;
  /** 저울 위 한 쌍을 잰 시간 */
  private weighT = 0;
  private readonly boxA = newBox();
  private readonly boxB = newBox();
  private readonly obstacles: LocalObstacle[] = [];
  private readonly loader: LoaderState = { present: false, parked: false, id: '', x: 0, z: 0, heading: 0, loaded: 0, want: 0, loading: false };
  private loaderLink: LoaderState | null = null;
  private readonly loadClaimed: boolean[] = LOAD_ORDER.map(() => false);
  private readonly paths = new WeakMap<Path, Path>();
  private readonly tmp = { x: 0, y: 0, z: 0 };

  constructor(private readonly token: Token | null = null) {
    for (let i = 0; i < BALE_POOL; i += 1) this.bales.push({ active: false, id: '', state: 'gone', x: 0, y: 0, z: 0, rot: 0, slot: -1, t: 0, seq: 0, owner: 0, load: -1, pos: -1, fromZ: 0 });
    for (let i = 0; i < YARD_FLOW.forkliftCount; i += 1) {
      const home = YARD.homes[i]!;
      this.forklifts.push({ ...mover(home[0], home[1], FACE_MINUS_Z), id: i + 1, fork: LOW_FORK, clamp: 0, carrying: null, carrying2: null, legs: [], task: null, idleT: 0, home, blockedT: 0, forkGoal: null, waitT: 0, cross: false, wide: 0 });
    }
    // 바탕 재고: 남동·북서의 앞쪽 몇 열은 이미 차 있다 (이름 없음, 서버 베일이 아니다)
    for (let c = 0; c < Math.min(YARD_FLOW.seStartColumns, SE_COLS); c += 1) for (let l = 0; l < LEVELS; l += 1) this.stock(seSlot(c, l));
    for (let c = 0; c < Math.min(YARD_FLOW.nwStartColumns, NW_COLS); c += 1) for (let l = 0; l < LEVELS; l += 1) this.stock(nwSlot(c, l));
  }

  private stock(slot: number): void {
    const b = this.allocate();
    if (!b) return;
    this.reset(b, '', 0);
    this.placeInSlot(b, slot);
  }

  // ── 서버 값 반영 ────────────────────────────────────────────────────

  /** store 값이 바뀔 때 부른다. 끊긴 동안에는 부르지 않는다. */
  sync(input: readonly Bale[], nowMs: number): void {
    let fresh: Bale[] | null = null;
    // 서버가 목록에서 뺀 베일은 오래전에 출하된 것이다: 장면에 이름이 남아 있으면 출하된 것으로 본다
    if (input.length > 0) {
      const listed = new Set<string>();
      for (const b of input) listed.add(b.id);
      for (const b of this.bales) if (b.active && b.id && !listed.has(b.id)) this.ship(b, null);
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
        if (b.stage === 'shipped') this.ship(bale, b.vehicleId);
        continue;
      }
      const p = this.pending.findIndex((x) => x.id === b.id);
      if (p >= 0) {
        if (b.stage === 'shipped') {
          // 내보내기 전에 서버가 출하했다고 하면 장면에는 나오지 않는다 (북서 재고 하나가 빠지거나 상차 차량에 실린다)
          this.pending.splice(p, 1);
          this.done.add(b.id);
          if (!this.forLoader(b.vehicleId)) this.removeNwTop(null);
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
      // 처음 본 대상이 이미 오래됐으면 지나간 장면을 지어내지 않고 있어야 할 곳에 바로 놓는다:
      // 이름 없는 바탕 재고가 있으면 그 베일이 이 서버 베일이 된다(오래된 것부터 북서, S2q), 없으면 남동 빈 칸
      if (age >= FRESH_MS && this.pending.length === 0) {
        const stock = this.anonymousStock();
        if (stock) {
          stock.id = b.id;
          stock.seq = this.seq;
          continue;
        }
      }
      const slot = age >= FRESH_MS && this.pending.length === 0 ? this.nextSeSingle() : -1;
      const bale = slot >= 0 ? this.allocate() : null;
      if (bale) {
        this.reset(bale, b.id, this.seq);
        this.placeInSlot(bale, slot);
      } else {
        this.pending.push({ id: b.id, seq: this.seq });
      }
    }
  }

  /**
   * 서버 베일에 맡길 이름 없는 재고 하나: 북서의 오래된 열부터, 그다음 남동의 오래된 열부터, 열 안에서는 아래 단부터.
   * 칸에 쌓여 있고 지게차가 맡지 않은 것만. 없으면 null
   */
  private anonymousStock(): BaleSim | null {
    for (const se of [false, true]) {
      const cols = se ? SE_COLS : NW_COLS;
      const age = se ? this.seAge : this.nwAge;
      const order = Array.from({ length: cols }, (_, c) => c).sort((a, b) => age[a]! - age[b]!);
      for (const c of order) {
        for (let l = 0; l < LEVELS; l += 1) {
          const b = this.slotBale[se ? seSlot(c, l) : nwSlot(c, l)];
          if (b && b.active && !b.id && b.state === 'stack' && b.owner === 0) return b;
        }
      }
    }
    return null;
  }

  /** 이 출하 베일은 지금 상차 자리의 차에 실린다 (지게차가 북서에서 하나를 꺼내 싣는 것으로 보여 준다) */
  private forLoader(vehicleId: string | null | undefined): boolean {
    return Boolean(vehicleId) && this.loader.present && vehicleId === this.loader.id;
  }

  /** 서버가 출하했다고 한 베일: 북서에서 하나가 빠진다 (위 5번). 상차 자리의 차에 실린 것이면 지게차가 북서에서 꺼내 싣는다 (위 6번) */
  private ship(bale: BaleSim, vehicleId: string | null): void {
    const id = bale.id;
    if (!id) return;
    this.done.add(id);
    if (this.forLoader(vehicleId)) {
      // 실리는 베일: 이름 없는 재고가 되고, 지게차가 북서 맨 위를 하나 꺼내 싣는다 (실은 수 = 서버 baleIds 수)
      bale.id = '';
      return;
    }
    // (지게차가 베일을 놓으러 오는 열에서는 빼지 않는다: 그 아래가 비면 놓을 베일이 공중에 뜬다)
    if (bale.state === 'stack' && !isSe(bale.slot) && !this.columnReserved(false, colOf(bale.slot))) {
      const top = this.topOf(false, colOf(bale.slot));
      if (top && top !== bale && top.owner === 0) {
        // 깔린 베일: 맨 위 베일과 이름표를 바꿔 달고 맨 위를 뺀다
        [top.id, bale.id] = [bale.id, top.id];
        [top.seq, bale.seq] = [bale.seq, top.seq];
        this.stats.swaps += 1;
        this.vanish(top);
        return;
      }
      if (top === bale && bale.owner === 0) {
        this.vanish(bale);
        return;
      }
    }
    // 남동·받침대·저울·운반 중(또는 북서에서 지게차가 든 것): 그 베일은 이름 없는 재고가 되고 북서 맨 위 하나가 빠진다
    bale.id = '';
    this.removeNwTop(bale);
  }

  /** 북서 맨 위 베일 하나를 뺀다 (가장 오래된 열부터, 이름 없는 재고를 먼저). 이름 있는 베일을 빼면 그 이름은 heir에게 넘긴다 */
  private removeNwTop(heir: BaleSim | null): void {
    let pick: BaleSim | null = null;
    let pickAge = Infinity;
    let named: BaleSim | null = null;
    let namedAge = Infinity;
    for (let c = 0; c < NW_COLS; c += 1) {
      if (this.columnReserved(false, c)) continue;
      const top = this.topOf(false, c);
      if (!top || top.owner !== 0) continue;
      const age = this.nwAge[c]!;
      if (!top.id && age < pickAge) {
        pick = top;
        pickAge = age;
      } else if (top.id && age < namedAge) {
        named = top;
        namedAge = age;
      }
    }
    if (pick) {
      this.vanish(pick);
      return;
    }
    if (named && heir) {
      // 이름 있는 북서 베일이 빠지면 그 이름은 남동 쪽 베일(heir)이 이어받는다: 서버 값과 장면의 베일 수가 맞다
      heir.id = named.id;
      heir.seq = named.seq;
      named.id = '';
      this.stats.swaps += 1;
      this.vanish(named);
    }
  }

  private vanish(b: BaleSim): void {
    if (b.slot >= 0 && this.slotBale[b.slot] === b) this.slotBale[b.slot] = null;
    b.active = false;
    b.state = 'gone';
    b.slot = -1;
    b.owner = 0;
    b.id = '';
    this.stats.shipped += 1;
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
    bale.owner = 0;
    bale.slot = -1;
    bale.load = -1;
    bale.pos = -1;
  }

  baleById(id: string): BaleSim | undefined {
    if (!id) return undefined;
    for (const b of this.bales) if (b.active && b.id === id) return b;
    return undefined;
  }

  // ── 칸 ──────────────────────────────────────────────────────────────

  private slotPos(slot: number, out: { x: number; y: number; z: number }): void {
    const se = isSe(slot);
    out.x = (se ? YARD.seXs : YARD.nwXs)[colOf(slot)] ?? 0;
    out.y = levelOf(slot) * BALE.h;
    out.z = se ? YARD.slotZ : YARD.nwSlotZ;
  }

  private placeInSlot(bale: BaleSim, slot: number): void {
    this.slotPos(slot, this.tmp);
    this.slotRes[slot] = null;
    this.slotBale[slot] = bale;
    const se = isSe(slot);
    const col = colOf(slot);
    if (levelOf(slot) === 0 || this.count(se, col) === 1) {
      this.ageSeq += 1;
      (se ? this.seAge : this.nwAge)[col] = this.ageSeq;
    }
    bale.slot = slot;
    bale.state = 'stack';
    bale.pos = -1;
    bale.x = this.tmp.x;
    bale.y = this.tmp.y;
    bale.z = this.tmp.z;
    bale.rot = se ? FACE_PLUS_Z : FACE_MINUS_Z;
    bale.owner = 0;
  }

  private count(se: boolean, col: number): number {
    let n = 0;
    for (let l = 0; l < LEVELS; l += 1) if (this.slotBale[se ? seSlot(col, l) : nwSlot(col, l)]) n += 1;
    return n;
  }

  /** 쌓였거나 놓으러 가는(배정된) 베일 수 */
  private filled(se: boolean, col: number): number {
    let n = 0;
    for (let l = 0; l < LEVELS; l += 1) {
      const s = se ? seSlot(col, l) : nwSlot(col, l);
      if (this.slotBale[s] || this.slotRes[s]) n += 1;
    }
    return n;
  }

  private topOf(se: boolean, col: number): BaleSim | null {
    for (let l = LEVELS - 1; l >= 0; l -= 1) {
      const b = this.slotBale[se ? seSlot(col, l) : nwSlot(col, l)];
      if (b) return b;
    }
    return null;
  }

  private columnReserved(se: boolean, col: number): boolean {
    for (let l = 0; l < LEVELS; l += 1) if (this.slotRes[se ? seSlot(col, l) : nwSlot(col, l)]) return true;
    return false;
  }

  /** n개를 더 쌓을 열: 쌓기 시작한 열 중 가장 새것, 없으면 빈 열 중 첫 열. 없으면 -1 */
  private pickColumn(se: boolean, n: number): number {
    const cols = se ? SE_COLS : NW_COLS;
    const age = se ? this.seAge : this.nwAge;
    // 가장 최근에 쌓기 시작한 열에만 이어 쌓는다 (반쯤 옮긴 오래된 줄에 새 베일을 얹지 않는다)
    let newest = -1;
    let newestAge = -1;
    for (let c = 0; c < cols; c += 1) {
      if (this.filled(se, c) > 0 && age[c]! > newestAge) {
        newest = c;
        newestAge = age[c]!;
      }
    }
    if (newest >= 0 && this.filled(se, newest) + n <= LEVELS && !this.columnBusy(se, newest)) return newest;
    for (let c = 0; c < cols; c += 1) if (this.filled(se, c) === 0 && !this.columnBusy(se, c)) return c;
    return -1;
  }

  /** 이 열에서 다른 지게차가 꺼내 가는 중이다 */
  private columnBusy(se: boolean, col: number): boolean {
    for (let l = 0; l < LEVELS; l += 1) {
      const b = this.slotBale[se ? seSlot(col, l) : nwSlot(col, l)];
      if (b && b.owner !== 0) return true;
    }
    return false;
  }

  /** 오래된 베일 하나를 바로 놓을 남동 칸 (시작할 때·밀린 베일) */
  private nextSeSingle(): number {
    const col = this.pickColumn(true, 1);
    if (col < 0) return -1;
    return seSlot(col, this.filled(true, col));
  }

  private nwCount(): number {
    let n = 0;
    for (let s = SE_SLOTS; s < SLOTS; s += 1) if (this.slotBale[s]) n += 1;
    return n;
  }

  private fullColumns(se: boolean): number {
    let n = 0;
    const cols = se ? SE_COLS : NW_COLS;
    for (let c = 0; c < cols; c += 1) if (this.count(se, c) === LEVELS) n += 1;
    return n;
  }

  /**
   * 상차를 그 자리에서 끝낸다 (상차 차가 출차 단계에서 오래 기다렸는데 싣는 지게차가 길에서 막혀 끝나지 않을 때, S2j).
   * 든 베일·돌려 잡기 자리에 내려 둔 베일은 적재함의 다음 자리에 놓고(북서에서 이미 빠졌다), 지게차는 일을 내려놓아 대기 자리로 돌아간다.
   * 이렇게 해야 앞 차가 떠나고, 앞 차를 기다리는 다음 차와 길을 막은 쪽이 다시 움직인다
   */
  abortLoad(): void {
    for (const f of this.forklifts) {
      if (f.task?.kind !== 'load') continue;
      for (const b of this.bales) {
        if (!b.active || b.owner !== f.id || (b.state !== 'carried' && b.state !== 'ground')) continue;
        const i = this.loadedCount();
        if (i < LOAD_ORDER.length && this.loader.present) {
          b.state = 'loaded';
          b.load = i;
          this.loadClaimed[i] = true;
          this.stats.loadedOut += 1;
        } else {
          b.active = false;
          b.state = 'gone';
          b.id = '';
        }
        b.owner = 0;
      }
      f.carrying = null;
      f.carrying2 = null;
      f.cross = false;
      f.legs = [];
      f.task = null;
      f.path = null;
      f.speed = 0;
      f.forkGoal = null;
      f.blockedT = 0;
      f.idleT = 0;
      this.token?.release(`forklift:${f.id}`);
    }
  }

  /** 상차 차량에 싣는 지게차가 있다 */
  loadingBusy(): boolean {
    return this.forklifts.some((f) => f.task?.kind === 'load');
  }

  private emptyColumns(se: boolean): number {
    let n = 0;
    const cols = se ? SE_COLS : NW_COLS;
    for (let c = 0; c < cols; c += 1) if (this.filled(se, c) === 0) n += 1;
    return n;
  }

  // ── 시간 진행 ───────────────────────────────────────────────────────

  /** trucks·loader는 월드 좌표다 (Director의 트럭). 마당 좌표로 옮겨 쓴다 */
  step(dt: number, trucks: readonly Obstacle[], loader: LoaderState | null = null): void {
    this.localize(trucks, loader);
    this.stepStand(dt);
    this.tryEject();
    for (const f of this.forklifts) this.stepForklift(f, dt);
    this.stepBales();
    if (this.scaleCount() === 2 && !this.scaleBusy()) this.weighT += dt;
    this.dispatch();
    // 압축기가 기다리는 것(받침대가 차서 내보내지 못함)이 잠깐이 아니면 "가득 참"으로 알린다 (평소 받침대 끝 베일을 집으러 오는 동안은 세지 않는다)
    this.blockedEjectT = this.pending.length > 0 && !this.canEject() ? this.blockedEjectT + dt : 0;
    const full = this.blockedEjectT > FULL_AFTER_SEC;
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
      // 상차 차량(서버 kind outbound)은 싣는 지게차가 곁에 붙는다
      o.loader = t.loader ?? (t as { outbound?: boolean }).outbound ?? false;
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
      this.loader.want = Math.min(loader.want, LOAD_ORDER.length);
      this.loader.id = loader.id;
      this.loader.loading = loader.loading;
      this.loader.hurry = loader.hurry ?? false;
    } else {
      this.loader.present = false;
      this.loader.parked = false;
      this.loader.id = '';
    }
  }

  // ── 받침대·저울 ─────────────────────────────────────────────────────

  private standAt(pos: number): BaleSim | null {
    for (const b of this.bales) if (b.active && (b.state === 'stand' || b.state === 'ejecting') && b.pos === pos && b.owner === 0) return b;
    return null;
  }

  private standCount(): number {
    let n = 0;
    for (const b of this.bales) if (b.active && (b.state === 'stand' || b.state === 'ejecting')) n += 1;
    return n;
  }

  private scaleCount(): number {
    let n = 0;
    for (const b of this.bales) if (b.active && b.state === 'scale') n += 1;
    return n;
  }

  /** 저울로 가져가는 중인 베일이 있다 */
  private scaleBusy(): boolean {
    return this.forklifts.some((f) => f.task?.kind === 'scale');
  }

  /** 받침대 끝(0번)이 비어 있으면 밀어낼 수 있다 (집으러 오는 베일이 있으면 기다린다) */
  private canEject(): boolean {
    if (this.standMove >= 0) return false;
    for (const b of this.bales) if (b.active && b.state === 'stand' && (b.pos === 0 || b.owner !== 0)) return false;
    return this.standCount() < 3;
  }

  private tryEject(): void {
    const next = this.pending[0];
    if (!next || !this.canEject()) return;
    const bale = this.allocate();
    if (!bale) return;
    this.pending.shift();
    // 받침대의 베일을 한 칸씩 끝 쪽으로 민다
    for (const b of this.bales) {
      if (!b.active || b.state !== 'stand') continue;
      b.fromZ = b.z;
      b.pos -= 1;
    }
    this.reset(bale, next.id, next.seq);
    bale.state = 'ejecting';
    bale.pos = 2;
    bale.x = STAND.x;
    bale.y = STAND.y;
    bale.z = STAND.fromZ;
    bale.fromZ = STAND.fromZ;
    this.standMove = 0;
    this.events.onEject?.();
  }

  private stepStand(dt: number): void {
    if (this.standMove < 0) return;
    this.standMove = Math.min(1, this.standMove + dt / EJECT_SEC);
    const k = this.standMove;
    const ease = k * k * (3 - 2 * k);
    for (const b of this.bales) {
      if (!b.active || (b.state !== 'stand' && b.state !== 'ejecting')) continue;
      const to = STAND.slots[b.pos] ?? b.z;
      b.z = b.fromZ + (to - b.fromZ) * ease;
      if (k >= 1) {
        b.z = to;
        b.fromZ = to;
        b.state = 'stand';
      }
    }
    if (k >= 1) this.standMove = -1;
  }

  private stepBales(): void {
    for (const f of this.forklifts) {
      const pair = [f.carrying, f.carrying2];
      pair.forEach((b, i) => {
        if (!b) return;
        b.x = f.x + Math.cos(f.heading) * FORK_REACH;
        b.z = f.z - Math.sin(f.heading) * FORK_REACH;
        b.y = f.fork + i * BALE.h;
        b.rot = f.heading + (f.cross ? Math.PI / 2 : 0);
      });
    }
    for (const b of this.bales) {
      if (!b.active || b.state !== 'loaded') continue;
      // 상차 차량에 실린 베일은 차를 따라간다 (적재함 위 자리 LOAD_SLOTS, 긴 쪽이 차 길이 방향)
      const slot = LOAD_SLOTS[LOAD_ORDER[b.load] ?? -1];
      if (!slot) continue;
      this.slotOnTruck(slot, this.tmp);
      b.x = this.tmp.x;
      b.z = this.tmp.z;
      b.y = this.tmp.y;
      b.rot = this.loader.heading;
    }
  }

  // ── 상차 차량 ───────────────────────────────────────────────────────

  /** 상차 차량 적재함 위 자리의 마당 좌표 (베일 바닥 높이 y) */
  private slotOnTruck(slot: { along: number; across: number; level: number }, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const h = this.loader.heading;
    out.x = this.loader.x + Math.cos(h) * slot.along + Math.sin(h) * slot.across;
    out.z = this.loader.z - Math.sin(h) * slot.along + Math.cos(h) * slot.across;
    out.y = LOAD_BED_Y + slot.level * BALE.h;
    return out;
  }

  /** 실을 만큼 다 실었고 싣는 중인 지게차도 없다 */
  loadingDone(): boolean {
    const want = Math.min(this.loader.want, LOAD_ORDER.length);
    return this.loadedCount() >= want && !this.forklifts.some((f) => f.task?.kind === 'load');
  }

  /** 상차 자리에 선 차에 아직 맡지 않은 실을 자리가 있다 */
  private loaderNeeds(): boolean {
    if (!this.loader.parked || !this.loader.loading || !this.loaderLink) return false;
    const want = Math.min(this.loader.want, LOAD_ORDER.length);
    return LOAD_ORDER.some((_, i) => i < want && !this.loadClaimed[i]);
  }

  private loadedCount(): number {
    let n = 0;
    for (const b of this.bales) if (b.active && b.state === 'loaded') n += 1;
    return n;
  }

  /** 이미 상차 중인 차를 처음 봤다: 서버가 실었다고 한 만큼 지나간 장면 없이 바로 적재함에 놓는다 (북서에서 그만큼 빠진다) */
  preload(n: number): void {
    for (let i = this.loadedCount(); i < Math.min(n, LOAD_ORDER.length); i += 1) {
      const top = this.takeNwTop();
      const b = top ?? this.allocate();
      if (!b) return;
      if (!top) this.reset(b, '', 0);
      b.active = true;
      b.id = '';
      b.state = 'loaded';
      b.slot = -1;
      b.owner = 0;
      b.load = i;
      this.loadClaimed[i] = true;
    }
  }

  /** 북서 맨 위 베일 하나를 칸에서 뺀다 (가장 오래된 열부터). 없으면 null */
  private takeNwTop(): BaleSim | null {
    let best: BaleSim | null = null;
    let bestAge = Infinity;
    for (let c = 0; c < NW_COLS; c += 1) {
      const top = this.topOf(false, c);
      if (!top || top.owner !== 0 || this.columnReserved(false, c)) continue;
      if (this.nwAge[c]! < bestAge) {
        best = top;
        bestAge = this.nwAge[c]!;
      }
    }
    if (best && best.slot >= 0) this.slotBale[best.slot] = null;
    return best;
  }

  /** 상차 차량이 부지를 떠났다: 실린 베일을 지운다 */
  clearLoaded(want = 0): void {
    // 서버가 실었다고 했는데 장면에서 다 싣지 못한 만큼은 북서에서 빠진 것으로 본다 (서버 값과 베일 수가 맞게)
    for (let i = this.loadedCount(); i < Math.min(want, LOAD_ORDER.length); i += 1) this.removeNwTop(null);
    for (const b of this.bales) {
      if (b.active && b.state === 'loaded') {
        b.active = false;
        b.state = 'gone';
        b.load = -1;
        b.id = '';
      }
    }
    this.loadClaimed.fill(false);
      }

  // ── 일 나누기 ───────────────────────────────────────────────────────

  private idle(f: ForkliftSim): boolean {
    return f.legs.length === 0 && f.task === null;
  }

  /** 남동 쪽에 쉬는 지게차 중 x에 가장 가까운 것 (북서 쪽에서 상차를 기다리는 지게차는 고르지 않는다) */
  private nearestIdle(x: number): ForkliftSim | null {
    let best: ForkliftSim | null = null;
    let bestD = Infinity;
    for (const f of this.forklifts) {
      if (!this.idle(f) || this.inNw(f)) continue;
      const d = Math.abs(f.x - x);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  private busyWith(kind: TaskKind): boolean {
    return this.forklifts.some((f) => f.task?.kind === kind);
  }

  private dispatch(): void {
    // 1. 저울 위 한 쌍을 다 쟀으면 남동 칸에 쌓는다
    if (this.scaleCount() === 2 && this.weighT >= WEIGH_SEC && !this.busyWith('store') && !this.busyWith('scale')) {
      const col = this.pickColumn(true, 2);
      const f = col >= 0 ? this.nearestIdle(SCALE.x) : null;
      if (f) this.startStore(f, col);
    }
    // 2. 받침대 끝의 베일을 저울에 올린다 (저울에 자리가 있을 때)
    const end = this.standAt(0);
    if (end && end.state === 'stand' && this.standMove < 0 && this.scaleCount() < 2 && !this.busyWith('scale') && !this.busyWith('store')) {
      const f = this.nearestIdle(STAND.x);
      if (f) this.startScale(f, end);
    }
    // 3. 남동이 차 오르면 가장 오래된 줄부터 북서로 옮긴다
    // (북서가 거의 비어 상차할 베일이 없을 때도 남동의 꽉 찬 오래된 줄을 옮긴다)
    const needNw = this.nwCount() < 4 && this.fullColumns(true) > 0;
    // 상차 차량이 서서 실을 베일을 기다리면 줄 옮기기를 새로 시작하지 않는다 (싣기가 먼저: 차가 오래 서 있지 않게, S2j #12).
    // 북서에 꺼낼 베일이 없을 때만 옮긴다
    const loadWaiting = this.loaderNeeds() && this.nwTopCount() > 0;
    if ((this.emptyColumns(true) < YARD_FLOW.seFreeColumnsMin || needNw) && !loadWaiting && !this.busyWith('transfer') && !this.busyWith('load') && !this.forklifts.some((g) => this.inNw(g))) {
      const src = this.oldestSeColumn();
      if (src >= 0) {
        const n = Math.min(2, this.count(true, src));
        const dst = this.pickColumn(false, n);
        const f = dst >= 0 ? this.nearestIdle(YARD.laneEnd) : null;
        if (f) this.startTransfer(f, src, dst, n);
      }
    }
    // 4. 상차: 상차 차량이 서 있고 실을 자리가 남았으면 북서 맨 위 베일을 하나씩
    if (this.loader.parked && this.loader.loading && this.loaderLink && !this.busyWith('load') && !this.busyWith('transfer')) {
      const want = Math.min(this.loader.want, LOAD_ORDER.length);
      const slot = LOAD_ORDER.findIndex((_, i) => i < want && !this.loadClaimed[i]);
      if (slot >= 0 && this.nwTopCount() > 0) {
        const f = this.forklifts.find((g) => this.idle(g) && this.inNw(g)) ?? this.nearestIdle(YARD.laneEnd);
        if (f) this.startLoad(f, slot);
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
      // 저울에 첫 베일을 놓고 저울 앞에 남은 지게차: 받침대에서 곧 나올 베일이 있으면 잠시 그 자리에서 기다린다 (대기 자리로 왕복하지 않게)
      if (Math.hypot(f.x - SCALE_POCKET[0], f.z - SCALE_POCKET[1]) < 0.15 && this.scaleCount() === 1 && (this.standMove >= 0 || this.pending.length > 0) && f.idleT < SCALE_WAIT_SEC) continue;
      const legs: Leg[] = [];
      const cur = { x: f.x, z: f.z };
      if (this.inNw(f)) {
        // 북서 쪽에서 상차를 기다리던 지게차: 상차 차량이 서서 실을 것이 남았으면 기다리고, 아니면 가로지르는 길로 남동 대기 자리에 돌아간다
        // 상차 차량이 서서 서버가 아직 싣는 중(다음 베일이 올 수 있다)이거나 맡지 않은 자리가 남았으면 기다린다 (S2j: 상차 중에는 이 지게차가 맡는다.
        // 남동으로 돌아가면 남동에서 오는 다른 지게차와 북서 길 끝에서 서로 막힌다)
        const want = Math.min(this.loader.want, LOAD_ORDER.length);
        if (this.loader.parked && this.loader.loading && (!this.loader.hurry || LOAD_ORDER.some((_, i) => i < want && !this.loadClaimed[i]))) continue;
        legs.push({ kind: 'token', take: true });
        this.backToCrossing(legs, cur);
        this.homeFromCrossing(f, legs, cur);
        this.begin(f, { kind: 'home' }, legs);
        continue;
      }
      this.seGo(f, legs, cur, f.home[0], f.home[1], FACE_MINUS_Z);
      legs.push({ kind: 'fork', height: LOW_FORK }, { kind: 'lane', take: false });
      this.begin(f, { kind: 'home' }, legs);
    }
  }

  private oldestSeColumn(): number {
    let best = -1;
    let bestAge = Infinity;
    for (let c = 0; c < SE_COLS; c += 1) {
      if (this.count(true, c) === 0 || this.columnReserved(true, c) || this.columnBusy(true, c)) continue;
      if (this.seAge[c]! < bestAge) {
        best = c;
        bestAge = this.seAge[c]!;
      }
    }
    return best;
  }

  private nwTopCount(): number {
    let n = 0;
    for (let c = 0; c < NW_COLS; c += 1) if (this.topOf(false, c) && !this.columnReserved(false, c) && !this.columnBusy(false, c)) n += 1;
    return n;
  }

  private begin(f: ForkliftSim, task: Task, legs: Leg[]): void {
    f.task = task;
    f.legs = legs;
    f.idleT = 0;
  }

  /** 집기: 클램프를 닫고 든 것으로 적는다 */
  private grab(f: ForkliftSim, legs: Leg[], bales: () => BaleSim[], lift: number): void {
    legs.push(
      { kind: 'clamp', closed: true },
      {
        kind: 'call',
        fn: () => {
          const list = bales();
          list.forEach((b) => {
            if (b.slot >= 0 && this.slotBale[b.slot] === b) this.slotBale[b.slot] = null;
            b.slot = -1;
            b.pos = -1;
            b.state = 'carried';
            b.owner = f.id;
          });
          f.carrying = list[0] ?? null;
          f.carrying2 = list[1] ?? null;
        },
      },
      { kind: 'fork', height: lift },
    );
  }

  /**
   * 받침대 끝 베일 → 저울 (아래 단, 이미 하나 있으면 그 위).
   * 둘째 베일(위 단)이면 그 자리에서 집게만 벌려 내려 두고 무게를 재는 동안(WEIGH_SEC) 기다렸다가 두 개를 다시 집어 바로 남동 칸에 쌓는다
   * (S2j #14: 대기 자리에 돌아갔다 오지 않는다). 쌓을 열이 없으면 전처럼 저울에 두고 돌아간다(다 재면 dispatch가 쌓는다).
   * 첫 베일(아래 단)을 놓은 뒤에는 저울 앞에 남아 다음 베일을 기다린다(받침대에 곧 나올 베일이 있으면, 대기 자리로 왕복하지 않게)
   */
  private startScale(f: ForkliftSim, bale: BaleSim): void {
    bale.owner = f.id;
    const level = this.scaleCount();
    const below = level === 1 ? this.bales.find((b) => b.active && b.state === 'scale' && b.pos === 0) ?? null : null;
    const col = below ? this.pickColumn(true, 2) : -1;
    const legs: Leg[] = [];
    const cur = { x: f.x, z: f.z };
    this.seGo(f, legs, cur, STAND_POCKET[0], STAND_POCKET[1], FACE_MINUS_Z, STAND.y + 0.03);
    this.grab(f, legs, () => [bale], STAND.y + 0.16);
    // 저울 위 높이 + 이미 놓인 베일 위로 들어 옮긴다
    const placeY = SCALE.y + level * BALE.h + 0.03;
    this.seGo(f, legs, cur, SCALE_POCKET[0], SCALE_POCKET[1], FACE_MINUS_Z, placeY + 0.1);
    legs.push(
      { kind: 'fork', height: placeY },
      {
        kind: 'call',
        fn: () => {
          bale.state = 'scale';
          bale.pos = level;
          bale.owner = col >= 0 ? f.id : 0;
          bale.x = SCALE.x;
          bale.z = SCALE.z;
          bale.y = SCALE.y + level * BALE.h;
          bale.rot = FACE_MINUS_Z;
          f.carrying = null;
          if (level === 1) this.weighT = 0;
        },
      },
      { kind: 'clamp', closed: false },
    );
    if (below && col >= 0) {
      // 저울 위에서 잰다: 집게를 벌린 채 아래 단 높이로 내려 기다렸다가 두 개를 함께 집는다
      const at = this.filled(true, col);
      const lower = seSlot(col, at);
      const upper = seSlot(col, at + 1);
      this.slotRes[lower] = below;
      this.slotRes[upper] = bale;
      below.owner = f.id;
      legs.push({ kind: 'fork', height: SCALE.y + 0.03 }, { kind: 'wait', sec: WEIGH_SEC });
      this.grab(f, legs, () => [below, bale], SCALE.y + 0.16);
      legs.push({
        kind: 'call',
        fn: () => {
          this.stats.weighed += 1;
          this.weighT = 0;
          // 이제 저울은 비었다: 다음 베일을 저울에 올리는 일을 다른 지게차가 맡을 수 있다
          f.task = { kind: 'store' };
        },
      });
      this.storePair(f, legs, cur, col, at, below, bale);
      this.begin(f, { kind: 'scale' }, legs);
      return;
    }
    if (level === 0) {
      // 저울 앞에서 뒤로 빠져 다음 베일을 기다린다 (곧 나올 베일이 없으면 dispatch가 대기 자리로 보낸다)
      legs.push({ kind: 'forkTo', height: LOW_FORK });
      this.begin(f, { kind: 'scale' }, legs);
      return;
    }
    this.seGo(f, legs, cur, f.home[0], f.home[1], FACE_MINUS_Z, LOW_FORK);
    legs.push({ kind: 'lane', take: false });
    this.begin(f, { kind: 'scale' }, legs);
  }

  /** 든 한 쌍(저울에서 잰 것) → 남동 칸 col (두 단), 그 뒤 대기 자리 */
  private storePair(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }, col: number, level: number, bottom: BaleSim, top: BaleSim): void {
    const lower = seSlot(col, level);
    const upper = seSlot(col, level + 1);
    const y = level * BALE.h + 0.03;
    this.seGo(f, legs, cur, YARD.seXs[col]!, SE_POCKET_Z, FACE_PLUS_Z, y + 0.12);
    legs.push(
      { kind: 'fork', height: y },
      {
        kind: 'call',
        fn: () => {
          this.placeInSlot(bottom, lower);
          this.placeInSlot(top, upper);
          this.stats.stored += 2;
          f.carrying = null;
          f.carrying2 = null;
        },
      },
      { kind: 'clamp', closed: false },
    );
    this.seGo(f, legs, cur, f.home[0], f.home[1], FACE_MINUS_Z, LOW_FORK);
    legs.push({ kind: 'lane', take: false });
  }

  /** 저울 위의 잰 한 쌍 → 남동 칸 (두 단) */
  private startStore(f: ForkliftSim, col: number): void {
    const level = this.filled(true, col);
    const pair = this.bales.filter((b) => b.active && b.state === 'scale').sort((a, b) => a.pos - b.pos);
    const [bottom, top] = pair;
    if (!bottom || !top) return;
    this.slotRes[seSlot(col, level)] = bottom;
    this.slotRes[seSlot(col, level + 1)] = top;
    bottom.owner = f.id;
    top.owner = f.id;
    const legs: Leg[] = [];
    const cur = { x: f.x, z: f.z };
    this.seGo(f, legs, cur, SCALE_POCKET[0], SCALE_POCKET[1], FACE_MINUS_Z, SCALE.y + 0.03);
    this.grab(f, legs, () => [bottom, top], SCALE.y + 0.16);
    legs.push({
      kind: 'call',
      fn: () => {
        this.stats.weighed += 1;
        this.weighT = 0;
      },
    });
    this.storePair(f, legs, cur, col, level, bottom, top);
    this.begin(f, { kind: 'store' }, legs);
  }

  /** 남동의 오래된 열 맨 위 n개(한 쌍) → 북서 칸 */
  private startTransfer(f: ForkliftSim, src: number, dst: number, n: number): void {
    // 다른 비어 있지 않은 열 중 가장 오래된 것보다 새 열을 옮기면 안 된다 (시험이 본다)
    this.transferAges.push(this.seAge[src]! - Math.min(...this.seAge.filter((_, c) => this.count(true, c) > 0 && !this.columnReserved(true, c))));
    if (this.transferAges.length > 40) this.transferAges.shift();
    const have = this.count(true, src);
    const lift: BaleSim[] = [];
    for (let l = have - n; l < have; l += 1) lift.push(this.slotBale[seSlot(src, l)]!);
    const dstLevel = this.filled(false, dst);
    lift.forEach((b, i) => {
      b.owner = f.id;
      this.slotRes[nwSlot(dst, dstLevel + i)] = b;
    });
    const legs: Leg[] = [{ kind: 'token', take: true }];
    const cur = { x: f.x, z: f.z };
    const fromY = (have - n) * BALE.h + 0.03;
    this.seGo(f, legs, cur, YARD.seXs[src]!, SE_POCKET_Z, FACE_PLUS_Z, fromY);
    this.grab(f, legs, () => lift, fromY + 0.1);
    this.seGo(f, legs, cur, YARD.laneEnd, YARD.laneZ, 0, LOW_FORK + 0.1);
    legs.push({ kind: 'lane', take: false });
    this.crossToNw(legs, cur);
    // 북서 길의 동쪽 칸들은 트럭 길에서 떨어져 있다: 그 칸으로 갈 때는 마당 차례를 놓아 트럭(출차 계근 등)이 그동안 움직이게 하고,
    // 돌아갈 때 다시 잡는다. 서쪽 끝 칸(쏟는 자리 A로 가는 트럭 곁)은 차례를 쥔 채 쌓는다
    if (dst >= NW_FREE_FROM) legs.push({ kind: 'token', take: false });
    const toY = dstLevel * BALE.h + 0.03;
    // 북서 길에서 칸 쪽으로 돌기 전에 이웃 열보다 높이 들어 둔다 (돌 때 든 베일이 옆 줄 위를 지난다)
    this.nwGo(legs, cur, YARD.nwXs[dst]!, NW_POCKET_Z, LEVELS * BALE.h + 0.05, toY);
    legs.push(
      {
        kind: 'call',
        fn: () => {
          lift.forEach((b, i) => this.placeInSlot(b, nwSlot(dst, dstLevel + i)));
          this.stats.transferred += lift.length;
          f.carrying = null;
          f.carrying2 = null;
        },
      },
      { kind: 'clamp', closed: false },
    );
    this.nwBackToSe(f, legs, cur);
    this.begin(f, { kind: 'transfer' }, legs);
  }

  /**
   * 상차(S2j): 북서 맨 위 베일 하나를 꺼내 상차 차량의 차례 order(LOAD_ORDER 번호) 자리에 싣는다.
   *  1. (남동 대기 자리에서 왔으면 가로지르는 길로 북서 길 동쪽 끝까지) 북서 길 동쪽 끝에 가장 가까운 열의 맨 위 베일을 옆면으로 집는다
   *  2. 북서 길을 따라 돌려 잡기 자리(YARD.regrip) 앞으로 가 마당 쪽(+z)으로 내려놓고, 물러나 서쪽(−x)으로 돌아 클램프를 넓혀 끝면을 잡는다
   *     (베일 긴 쪽이 지게차 옆 방향이 되어, 차 곁에서 차를 보고 실으면 긴 쪽이 차 길이 방향이다)
   *  3. 그 자리의 곁(서쪽 곁은 바로, 동쪽 곁은 차 앞을 돌아)으로 가서 차를 보고 들어가 내려놓는다
   *  4. 왔던 길로 북서 길 동쪽 끝에 돌아와 마당 차례를 놓고 그대로 선다 (다음 베일은 여기서 곧장 칸으로)
   * 마당 차례는 처음부터 끝까지 쥔다(트럭 길을 건너므로). 단 북서 칸에서 베일을 집어 북서 길로 물러난 뒤 한 번 놓았다 다시 잡는다(트럭이 기다리면 양보, S2m).
   * 지게차 앞을 막는 것은 hits가 본다(상차 차량은 빼고)
   */
  private startLoad(f: ForkliftSim, order: number): void {
    const lo = this.loader;
    const loaderId = lo.id;
    const legs: Leg[] = [{ kind: 'token', take: true }];
    const cur = { x: f.x, z: f.z };
    if (!this.inNw(f)) {
      this.seGo(f, legs, cur, YARD.laneEnd, YARD.laneZ, 0, LOW_FORK);
      legs.push({ kind: 'lane', take: false });
      this.crossToNw(legs, cur);
    }
    // 고를 열은 그때 정한다 (그 사이 출하로 맨 위가 빠질 수 있다)
    legs.push({
      kind: 'call',
      fn: () => {
        // 북서 길 동쪽 끝에 가장 가까운 열의 맨 위 베일: 헛걸음 없이 짧게 오간다 (S2j #13)
        let best = -1;
        let bestD = Infinity;
        for (let c = 0; c < NW_COLS; c += 1) {
          const top = this.topOf(false, c);
          if (!top || top.owner !== 0 || this.columnReserved(false, c)) continue;
          const d = Math.abs(YARD.nwXs[c]! - YARD.nwLaneEnd);
          if (d < bestD) {
            best = c;
            bestD = d;
          }
        }
        const b = best >= 0 ? this.topOf(false, best) : null;
        const more: Leg[] = [];
        const at = { x: f.x, z: f.z };
        if (!b) {
          // 북서가 비었다: 이 자리는 다음에 다시 맡는다
          this.loadClaimed[order] = false;
          more.push({ kind: 'token', take: false });
          f.legs.splice(0, 0, ...more);
          return;
        }
        b.owner = f.id;
        const y = b.y + 0.03;
        this.nwGo(more, at, YARD.nwXs[best]!, NW_POCKET_Z, LEVELS * BALE.h + 0.05, y);
        this.grab(f, more, () => [b], y + 0.1);
        // 칸에서 곧게 뒤로 빠진 뒤(아래 베일에 닿지 않게) 달리면서 포크를 내린다
        more.push({ kind: 'drive', to: [YARD.nwXs[best]!, YARD.nwLaneZ], reverse: true }, { kind: 'forkTo', height: LOW_FORK });
        at.z = YARD.nwLaneZ;
        // 양보 자리(S2m): 북서 길은 트럭 길에서 떨어져 있다. 여기서 마당 차례를 한 번 놓았다가 다시 잡는다 — 입고 트럭이 계근대에서
        // 기다리면(차례를 원하면) 그 차가 섹터 앞에 들어설 때까지 베일을 든 채 기다린다. 전에는 상차 한 번(약 27초) 내내 쥐어
        // 인식된 트럭이 계근대에서 하역 단계를 놓쳤다
        more.push({ kind: 'token', take: false }, { kind: 'token', take: true });
        // 돌려 잡기: 자리 앞 길에서 마당 쪽(+z)으로 들어가 내려놓는다
        const [rx, rz] = YARD.regrip;
        this.nwLaneTo(more, at, rx);
        more.push(
          { kind: 'turn', heading: FACE_PLUS_Z },
          { kind: 'drive', to: [rx, rz - FORK_REACH], reverse: false },
          { kind: 'fork', height: 0.03 },
          {
            kind: 'call',
            fn: () => {
              f.carrying = null;
              b.state = 'ground';
              b.x = rx;
              b.z = rz;
              b.y = 0;
              b.rot = FACE_PLUS_Z;
            },
          },
          { kind: 'clamp', closed: false },
          { kind: 'drive', to: [rx, rz - FORK_REACH - REGRIP_BACK], reverse: true },
          { kind: 'jaws', wide: true },
        );
        // 서쪽(−x)으로 돌아 끝면 쪽에서 들어간다 (동쪽은 상차 차량 뒤 끝 쪽이라 비워 둔다)
        const q: P2 = [rx - FORK_REACH - REGRIP_BACK, rz];
        more.push(
          { kind: 'turn', heading: headingTo(rx, rz - FORK_REACH - REGRIP_BACK, q[0], q[1]) },
          { kind: 'drive', to: q, reverse: false },
          { kind: 'turn', heading: 0 },
          { kind: 'drive', to: [rx - FORK_REACH, rz], reverse: false },
          { kind: 'clamp', closed: true },
          {
            kind: 'call',
            fn: () => {
              b.state = 'carried';
              f.carrying = b;
              f.cross = true;
            },
          },
          { kind: 'fork', height: LOW_FORK + 0.1 },
        );
        // 실을 자리와 그 곁
        const slot = LOAD_SLOTS[LOAD_ORDER[order]!]!;
        const pos = this.slotOnTruck(slot, { x: 0, y: 0, z: 0 });
        const h = lo.heading;
        const side = Math.sign(slot.across) || 1;
        const nx = Math.sin(h) * side;
        const nz = Math.cos(h) * side;
        const grip: P2 = [pos.x + nx * FORK_REACH, pos.z + nz * FORK_REACH];
        const approach: P2 = [pos.x + nx * (FORK_REACH + LOAD_APPROACH), pos.z + nz * (FORK_REACH + LOAD_APPROACH)];
        const face = headingTo(grip[0], grip[1], pos.x, pos.z);
        const forkY = pos.y + 0.03;
        // 차 앞을 도는 점 (서쪽 곁 → 동쪽 곁): 차 앞 끝(북쪽)에서 조금 나간 곳, 양옆으로 차 폭 밖.
        // 차 뒤(남쪽)는 계근대 서쪽 길·대기 자리·출차 길과 가까워 돌지 않는다
        const around = (k: number): P2 => {
          const ahead = LOAD_TRUCK.length / 2 + FRONT_GAP;
          const off = LOAD_TRUCK.width / 2 + SIDE_GAP;
          return [lo.x + Math.cos(h) * ahead + Math.sin(h) * off * k, lo.z - Math.sin(h) * ahead + Math.cos(h) * off * k];
        };
        const route: P2[] = side > 0 ? [around(-1), around(1), approach] : [approach];
        let from: P2 = [rx - FORK_REACH, rz];
        for (const p of route) {
          more.push({ kind: 'turn', heading: headingTo(from[0], from[1], p[0], p[1]) }, { kind: 'drive', to: p, reverse: false });
          from = p;
        }
        more.push(
          { kind: 'turn', heading: face },
          // 놓을 자리 바로 위(바닥판·아래 단 베일 위)까지만 든다
          { kind: 'fork', height: forkY + 0.1 },
          { kind: 'drive', to: grip, reverse: false },
          { kind: 'fork', height: forkY },
          {
            kind: 'call',
            fn: () => {
              f.carrying = null;
              f.cross = false;
              // 싣는 사이 그 차가 떠났다(장면이 기다리다 넘겼다): 실을 차가 없으니 이 베일은 그 차에 실려 나간 것으로 보고 뺀다 (북서에서 이미 빠졌다)
              if (!this.loader.present || this.loader.id !== loaderId) {
                b.active = false;
                b.state = 'gone';
                b.owner = 0;
                b.id = '';
                return;
              }
              b.state = 'loaded';
              b.owner = 0;
              b.load = order;
              this.stats.loadedOut += 1;
            },
          },
          { kind: 'clamp', closed: false },
          { kind: 'drive', to: approach, reverse: true },
          { kind: 'forkTo', height: LOW_FORK },
          { kind: 'jaws', wide: false },
        );
        // 북서 길 동쪽 끝으로 돌아간다 (동쪽 곁이면 차 앞을 다시 돈다)
        from = approach;
        const back: P2[] = side > 0 ? [around(1), around(-1)] : [];
        for (const p of [...back, [YARD.nwLaneEnd, YARD.nwLaneZ] as P2]) {
          more.push({ kind: 'turn', heading: headingTo(from[0], from[1], p[0], p[1]) }, { kind: 'drive', to: p, reverse: false });
          from = p;
        }
        // 마당 차례를 놓고 그대로 선다 (다음 베일은 여기서 곧장 칸으로 간다: 제자리 돌기 없음)
        more.push({ kind: 'token', take: false });
        f.legs.splice(0, 0, ...more);
      },
    });
    this.loadClaimed[order] = true;
    this.begin(f, { kind: 'load' }, legs);
  }

  /** 북서 길 쪽에 서 있다 (상차를 마치고 기다리는 중) */
  private inNw(f: ForkliftSim): boolean {
    return f.z < (YARD.nwLaneZ + YARD.laneZ) / 2;
  }

  // ── 길 ──────────────────────────────────────────────────────────────

  /**
   * 남동 길에서 목표 자리(tx, tz)로: 지금 자리가 길 밖(칸 앞·받침대·저울·대기 자리)이면 길을 잡고 뒤로 빠져 길에 선 뒤,
   * 길을 따라 목표 x로 가서 heading으로 돌아 목표 자리로 들어간다. 길은 잡은 채로 둔다(이어지는 일을 하고 마지막에 놓는다).
   * fork: 길에 나온 뒤 맞출 포크 높이(돌기 전에), 들어가기 전 높이도 같다
   */
  private seGo(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }, tx: number, tz: number, heading: number, fork: number = LOW_FORK): void {
    legs.push({ kind: 'lane', take: true });
    if (Math.abs(cur.x - tx) < 0.05 && Math.abs(cur.z - tz) < 0.05) {
      legs.push({ kind: 'fork', height: fork });
      return;
    }
    if (Math.abs(cur.z - YARD.laneZ) > 0.05) {
      legs.push({ kind: 'drive', to: [cur.x, YARD.laneZ], reverse: true });
      cur.z = YARD.laneZ;
    }
    legs.push({ kind: 'fork', height: fork });
    if (Math.abs(cur.x - tx) > 0.05) {
      legs.push({ kind: 'turn', heading: tx > cur.x ? 0 : Math.PI }, { kind: 'drive', to: [tx, YARD.laneZ], reverse: false });
      cur.x = tx;
    }
    if (Math.abs(tz - YARD.laneZ) > 0.05) {
      legs.push({ kind: 'turn', heading }, { kind: 'drive', to: [tx, tz], reverse: false });
      cur.z = tz;
    } else {
      legs.push({ kind: 'turn', heading });
    }
    void f;
  }

  /** 남동 길 동쪽 끝 → 가로지르는 길 → 북서 길 동쪽 끝 (마당 차례는 잡았다) */
  private crossToNw(legs: Leg[], cur: { x: number; z: number }): void {
    let from: P2 = [cur.x, cur.z];
    for (const p of [...YARD.crossing, [YARD.nwLaneEnd, YARD.nwLaneZ] as P2]) {
      legs.push({ kind: 'turn', heading: headingTo(from[0], from[1], p[0], p[1]) }, { kind: 'drive', to: p, reverse: false });
      from = p;
    }
    cur.x = YARD.nwLaneEnd;
    cur.z = YARD.nwLaneZ;
  }

  private nwLaneTo(legs: Leg[], cur: { x: number; z: number }, tx: number): void {
    if (Math.abs(cur.x - tx) > 0.05) {
      legs.push({ kind: 'turn', heading: tx > cur.x ? 0 : Math.PI }, { kind: 'drive', to: [tx, YARD.nwLaneZ], reverse: false });
      cur.x = tx;
    }
  }

  /** 북서 길에서 칸 앞 자리로 들어간다: 돌기 전 포크 높이(liftY), 들어간 뒤 놓을 높이(placeY) */
  private nwGo(legs: Leg[], cur: { x: number; z: number }, tx: number, tz: number, liftY: number, placeY: number): void {
    this.nwLaneTo(legs, cur, tx);
    legs.push({ kind: 'fork', height: liftY }, { kind: 'turn', heading: FACE_MINUS_Z }, { kind: 'drive', to: [tx, tz], reverse: false }, { kind: 'fork', height: placeY });
    cur.z = tz;
  }

  /** 북서 칸 앞에서 뒤로 빠져 북서 길 → 동쪽 끝 → 가로지르는 길을 되짚어 남동 길 → 대기 자리 */
  private nwBackToSe(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }): void {
    legs.push({ kind: 'drive', to: [cur.x, YARD.nwLaneZ], reverse: true }, { kind: 'fork', height: LOW_FORK });
    cur.z = YARD.nwLaneZ;
    this.nwLaneTo(legs, cur, YARD.nwLaneEnd);
    legs.push({ kind: 'token', take: true });
    this.backToCrossing(legs, cur);
    this.homeFromCrossing(f, legs, cur);
  }

  /** 북서 길 동쪽 끝 → 가로지르는 길의 셋째·둘째 점 (마당 차례를 잡은 채: 트럭이 이 길을 쓰지 않는 동안) */
  private backToCrossing(legs: Leg[], cur: { x: number; z: number }): void {
    let from: P2 = [cur.x, cur.z];
    for (const p of [YARD.crossing[2]!, YARD.crossing[1]!]) {
      legs.push({ kind: 'turn', heading: headingTo(from[0], from[1], p[0], p[1]) }, { kind: 'drive', to: p, reverse: false });
      from = p;
    }
    cur.x = from[0];
    cur.z = from[1];
  }

  /**
   * 가로지르는 길 둘째 점(남동 길에서 멀리, 마당 차례를 잡은 채)에서 남동 길을 잡을 때까지 기다린 뒤, 첫 점을 지나 남동 길 동쪽 끝에 들어서서
   * 마당 차례를 놓고 대기 자리로. 남동 길에서 일하는 지게차가 도는 원에 닿지 않는 곳에서 기다리므로 서로 막히지 않는다
   */
  private homeFromCrossing(f: ForkliftSim, legs: Leg[], cur: { x: number; z: number }): void {
    const c0 = YARD.crossing[0]!;
    legs.push(
      { kind: 'lane', take: true },
      { kind: 'turn', heading: headingTo(cur.x, cur.z, c0[0], c0[1]) },
      { kind: 'drive', to: c0, reverse: false },
      { kind: 'turn', heading: headingTo(c0[0], c0[1], YARD.laneEnd, YARD.laneZ) },
      { kind: 'drive', to: [YARD.laneEnd, YARD.laneZ], reverse: false },
      { kind: 'token', take: false },
    );
    cur.x = YARD.laneEnd;
    cur.z = YARD.laneZ;
    this.seGo(f, legs, cur, f.home[0], f.home[1], FACE_MINUS_Z, LOW_FORK);
    legs.push({ kind: 'lane', take: false });
  }

  // ── 지게차 움직임 ───────────────────────────────────────────────────

  /** 이 자세의 지게차(또는 원: turnR > 0)가 다른 지게차·트럭에 닿는가 */
  private hits(f: ForkliftSim, x: number, z: number, heading: number, turnR: number): boolean {
    // 끝면을 잡은 베일(상차)은 긴 쪽이 옆으로 나와 폭이 넓다
    const a = f.cross && f.carrying ? setBox(this.boxA, x, z, heading, FORK_BACK, FORK_REACH + BALE.w / 2, BALE.d / 2 + CLEAR) : setBox(this.boxA, x, z, heading, FORK_BACK, f.carrying ? LOAD_TIP : FORK_TIP, HALF_W + CLEAR);
    const b = this.boxB;
    for (const g of this.forklifts) {
      if (g === f) continue;
      setBox(b, g.x, g.z, g.heading, FORK_BACK, g.carrying ? LOAD_TIP : FORK_TIP, HALF_W + CLEAR);
      if (turnR > 0 ? discHitsBox(b, x, z, turnR) : boxesOverlap(a, b)) return true;
    }
    for (const t of this.obstacles) {
      if (!t.active) continue;
      // 싣는 지게차는 상차 차량 곁에 붙는다(포크가 적재함 위로 간다)
      if (t.loader && f.task?.kind === 'load') continue;
      const size = truckSize(Boolean(t.loader));
      if (t.loader && this.loader.present) {
        // 상차 자리에 선 차(움직이지 않는다)는 실제 외곽선으로만 본다: 곁의 북서 길 동쪽 끝에서 도는 지게차를 막지 않게 (S2j)
        setBox(b, t.x, t.z, t.heading, -size.length / 2, size.length / 2, size.width / 2 + CLEAR);
        if (boxesOverlap(a, b)) return true;
        continue;
      }
      setBox(b, t.x, t.z, t.heading, -size.length / 2, size.length / 2, size.width / 2 + 0.35);
      if (turnR > 0 ? discHitsBox(b, x, z, turnR) : boxesOverlap(a, b)) return true;
    }
    return false;
  }

  private stepForklift(f: ForkliftSim, dtIn: number): void {
    // 서버가 앞서 간 상차는 빠르게 마저 싣는다 (움직임만 빨라진다, 차례·막힘 규칙은 그대로)
    const dt = f.task?.kind === 'load' && this.loader.hurry ? dtIn * HURRY : dtIn;
    const leg = f.legs[0];
    if (f.forkGoal !== null && leg?.kind !== 'fork') {
      const d = f.forkGoal - f.fork;
      f.fork += Math.max(-YARD_FLOW.liftMps * dt, Math.min(YARD_FLOW.liftMps * dt, d));
      if (Math.abs(f.forkGoal - f.fork) < 1e-3) {
        f.fork = f.forkGoal;
        f.forkGoal = null;
      }
    }
    if (!leg) {
      f.task = null;
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
        f.legs.shift();
        leg.fn();
        f.blockedT = 0;
        return;
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
      case 'jaws': {
        const target = leg.wide ? 1 : 0;
        f.wide += Math.max(-dt * 3, Math.min(dt * 3, target - f.wide));
        done = Math.abs(target - f.wide) < 1e-3;
        if (done) f.wide = target;
        break;
      }
      case 'forkTo':
        f.forkGoal = leg.height;
        done = true;
        break;
      case 'wait':
        f.waitT += dt;
        done = f.waitT >= leg.sec;
        if (done) f.waitT = 0;
        break;
      case 'fork': {
        f.forkGoal = null;
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
    const out: YardAudit = {
      active: 0,
      stacked: 0,
      seStacked: 0,
      nwStacked: 0,
      onStand: 0,
      onScale: 0,
      ejecting: 0,
      carried: 0,
      loaded: 0,
      waiting: this.pending.length,
      slotsUsed: 0,
      slots: SLOTS,
      yardFull: this.yardFull,
      slotErrors: [],
      baleOnBale: 0,
      forkOnBale: 0,
      forkOnWall: 0,
      forkOnFork: 0,
      forkOnTruck: 0,
      maxBlockedSec: this.maxBlockedSec,
    };
    const live = this.bales.filter((b) => b.active);
    out.active = live.filter((b) => b.id).length;
    for (const b of live) {
      if (b.state === 'stack') {
        if (b.id) out.stacked += 1;
        if (isSe(b.slot)) out.seStacked += 1;
        else out.nwStacked += 1;
      } else if (b.state === 'stand') out.onStand += 1;
      else if (b.state === 'scale') out.onScale += 1;
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
      const below = isSe(s) ? s - SE_COLS : s - NW_COLS;
      if (levelOf(s) > 0 && !this.slotBale[below]) out.slotErrors.push(`칸 ${s}의 베일이 공중에 있다`);
    }
    for (const b of live) if (b.state === 'stack' && this.slotBale[b.slot] !== b) out.slotErrors.push(`베일 ${b.id}이 칸 ${b.slot}에 등록되지 않았다`);

    const a = newBox();
    const c = newBox();
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
    for (const f of this.forklifts) {
      // 바탕 베일 벽: 본체, 그리고 벽 높이보다 낮게 든 베일
      setBox(a, f.x, f.z, f.heading, FORK_BACK, BODY_FRONT, HALF_W);
      for (const w of WALL_CELLS) {
        if (Math.abs(w.x - f.x) > 4 || Math.abs(w.z - f.z) > 4) continue;
        setBox(c, w.x, w.z, 0, -BALE.w / 2, BALE.w / 2, BALE.d / 2);
        if (boxesOverlap(a, c)) out.forkOnWall += 1;
        for (const b of [f.carrying, f.carrying2]) {
          if (!b || b.y > w.levels * BALE.h + 0.1) continue;
          setBox(c, b.x, b.z, b.rot, -BALE.d / 2, BALE.d / 2, BALE.w / 2);
          const d = newBox();
          setBox(d, w.x, w.z, 0, -BALE.w / 2, BALE.w / 2, BALE.d / 2);
          if (boxesOverlap(c, d)) out.forkOnWall += 1;
        }
      }
      setBox(a, f.x, f.z, f.heading, FORK_BACK, BODY_FRONT, HALF_W);
      for (const b of live) {
        // 지게차보다 높이 든 베일(포크 위)은 본체와 겹치지 않는다
        if (b.y > 2.0) continue;
        setBox(c, b.x, b.z, b.rot, -BALE.d / 2, BALE.d / 2, BALE.w / 2);
        if (boxesOverlap(a, c)) out.forkOnBale += 1;
      }
      for (const b of live) {
        if (b === f.carrying || b === f.carrying2 || b.owner === f.id) continue;
        const lat = Math.abs(-(b.x - f.x) * -Math.sin(f.heading) + (b.z - f.z) * Math.cos(f.heading));
        if (lat < 0.45 && (b.x - f.x) * Math.cos(f.heading) - (b.z - f.z) * Math.sin(f.heading) > 0) continue;
        if (f.fork + JAW_H1 <= b.y + 0.03 || f.fork + JAW_H0 >= b.y + 0.03 + BALE.h) continue;
        setBox(c, b.x, b.z, b.rot, -BALE.d / 2, BALE.d / 2, BALE.w / 2);
        for (const sideK of [-1, 1]) {
          const offset = sideK * (JAW_OFFSET - f.clamp * 0.025 * CS);
          setBox(a, f.x + Math.sin(f.heading) * offset, f.z + Math.cos(f.heading) * offset, f.heading, JAW_X0, JAW_X1, 0.015);
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
        if (t.loader) setBox(a, f.x, f.z, f.heading, FORK_BACK, BODY_FRONT, HALF_W);
        else setBox(a, f.x, f.z, f.heading, FORK_BACK, f.carrying ? LOAD_TIP : FORK_TIP, HALF_W);
        const size = truckSize(Boolean(t.loader));
        setBox(c, t.x, t.z, t.heading, -size.length / 2, size.length / 2, size.width / 2);
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
    const list: number[] = [];
    const w = { x: 0, z: 0 };
    for (let i = 0; i < path.pts.length; i += 2) {
      yardToWorld(path.pts[i]!, path.pts[i + 1]!, w);
      list.push(w.x, w.z);
    }
    const out: Path = { pts: list, dist: path.dist, total: path.total };
    this.paths.set(path, out);
    return out;
  }
}
