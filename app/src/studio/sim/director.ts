import { TANK_IDS } from '@ecocycle/shared';
import type { Bale, Batch, DeviceId, DeviceState, TankId, Vehicle, VehicleStage } from '@ecocycle/shared';
import {
  BALE,
  EXIT_LEAVE,
  EXIT_RAMP_CLEAR_PX,
  HOLD,
  HOLD_REVERSE,
  HOLD_TO_SCALE,
  QUEUE,
  RAIL,
  RAIL_FRAME,
  ROAD_TO_SCALE,
  SCALE,
  SCALE_CLEAR,
  SCALE_REVERSE_IN,
  SCALE_REVERSE_OUT,
  SCALE_STOP,
  SCALE_TO_HOLD,
  SCALE_TO_EXIT,
  SCALE_TO_QUEUE,
  SCALE_WEST_PX,
  TIP,
  TRUCK,
  TRUCK_IN,
  deviceCenter,
  devicePin,
  groundY,
  railAt,
  sitePx,
  truckQueueToTip,
  truckReverse,
  TRUCK_REVERSE_RADIUS,
  truckSize,
  truckTipToScale,
  truckToTip,
  yardToWorld,
} from '../world/layout';
import { FRESH_MS, advance, follow, followOn, mover } from './mover';
import type { Mover } from './mover';
import { angleDelta, roundedPath, samplePath } from './paths';
import type { P2, Path, Pose } from './paths';
import { Token } from './token';
import { UNLOAD_EXPECTED_SEC } from '../../config/yard';
import { grappleKey, grappleMidUnload, grappleSim, grappleStowed, inboundBody, resetGrapple, stepGrapple } from './grapple';
import type { GrappleSim } from './grapple';
import { Yard } from './yard';
import type { BaleSim, ForkliftSim, LoaderState } from './yard';

export type { BaleSim, BaleState, ForkliftSim } from './yard';

// 스튜디오의 "연출 감독" (three 미사용, 테스트 가능).
// 서버가 준 단계(stage)·기기 상태를 받아 트럭·지게차·베일·작업자의 움직임으로 옮긴다.
//  - 업무 값(회사·배정 섹터·배합비·압력·번호판)은 만들지 않는다. 받은 값이 "어디로 가야 하는가"만 정한다.
//  - step(dt)를 부르지 않으면 아무것도 움직이지 않는다. 연결이 끊기면 화면은 step을 부르지 않는다 (추측으로 움직이지 않는다).
//  - 서로 비켜 간다: 가려는 자리 앞에 다른 것이 있으면 기다리고, 서로 막으면 먼저 온 쪽이 간다.
//  - 길을 나눠 쓴다: 입구 경사로·계근대와 그 서쪽 앞마당은 "계근대" 차례(`scaleToken`), 마당 안쪽 길(계근대 ↔ 섹터 더미)과
//    지게차가 가로지르는 길은 "마당" 차례(`yardToken`)를 잡은 하나만 움직인다. 서 있는 자리(도로 대기, 계근대, 쏟는 자리, 대기 자리)는
//    어느 길에도 걸치지 않게 놓았다(world/layout). 그래서 서로 마주 오거나 길 한가운데에서 막히지 않는다.
//
// 입고 트럭(서버 값): 도로(북쪽, 낮은 곳) → 입구 경사로로 올라 → 계근대 서쪽 앞에서 서쪽을 보고 선 뒤 후진으로 계근대에 오른다
//   (계근대 동쪽 끝은 옹벽이라 도로로 바로 나갈 수 없다) → 번호판 인식 장면(서버가 인식 단계를 줄 때까지 기다림) → 앞으로 내려가
//   배정 섹터 더미 앞에서 후진해 쏟는다(하역 단계가 와야 적재함을 든다) → 출차 단계가 오면 앞으로 계근대에 올라(동쪽을 봄) 다시 재고
//   번호판 인식 장면 → 후진으로 서쪽에 내려와 → 같은 경사로로 도로(남쪽)로 나간다.
// 상차 차량(서버 값이 오면, S2f): 같은 입구로 들어와 빈 차를 재고 → 남동 구역 곁 상차 자리 → 지게차가 북서 재고에서 하나씩 싣는다
//   → 앞으로 계근대에 올라 다시 재고 → 같은 경사로로 나간다. 지금 데이터에는 상차 차량이 없어 상차 자리는 비어 있다.

export interface SimInput {
  devices: Partial<Record<DeviceId, DeviceState>>;
  vehicles: readonly Vehicle[];
  batches: readonly Batch[];
  bales: readonly Bale[];
}

export type TruckPhase =
  | 'road'
  | 'roadHold'
  | 'toScale'
  | 'reverseIn'
  | 'atScale'
  | 'toQueue'
  | 'queued'
  | 'toTip'
  | 'reversing'
  | 'atTip'
  | 'toScale2'
  | 'toLoad'
  | 'loading'
  | 'loadBack'
  | 'atScale2'
  | 'reverseOut'
  | 'toExit'
  | 'exitHold'
  | 'leave';

export interface TruckSim extends Mover {
  active: boolean;
  id: string;
  seq: number;
  phase: TruckPhase;
  stage: VehicleStage;
  bay: TankId | null;
  /** 적재함 기울기 0~1 */
  bedTilt: number;
  /** 적재함에 남은 파지 0~1 */
  load: number;
  pouring: boolean;
  pourT: number;
  variant: number;
  /** 장면에 보이는 회사 이름: 서버 값이되 계근대에 서서 읽기 전에는 null (revealIdentity). 트럭 띠 색에만 쓴다 */
  company: string | null;
  /** 장면에 보이는 번호판: 서버 값이되 계근대에 서서 읽기 전에는 null (revealIdentity). 번호판 인식 장면에 그대로 적는다 */
  plate: string | null;
  /** 서버가 준 번호판·회사 (인식 전 null). 도로·경사로에 있는 동안에는 보이지 않게 들고만 있는다 */
  serverPlate: string | null;
  serverCompany: string | null;
  /** 상차 차량(낮은 카고, 서버 kind outbound): 베일을 실으러 온다 */
  outbound: boolean;
  /** 서버가 이 차에 실었다고 한 베일 수 (baleIds) */
  want: number;
  /** 카고 옆판 내림 0~1 (상차 자리에서 내린다) */
  sides: number;
  /** 상차 자리에서 서버가 출차 계근을 준 뒤 마지막 베일을 기다린 시간(초) */
  leaveWaitT: number;
  /** 계근대 위에서 머문 시간(초) */
  weighT: number;
  /** 계근대 위에서 번호판(서버 값)이 보인 시간(초): 인식 장면을 잠깐 보여 준 뒤에 내려간다 */
  plateT: number;
  /** 다시 재러 가는 길에서 마당 안쪽 길을 벗어나는 거리 (마당 차례를 놓는 곳) */
  clearS: number;
  /** 바닥 높이 (도로·경사로) */
  y: number;
  /** 서버가 출차(departed)를 줬다: 회사 밖이다. 하던 동선을 마치고 경사로·도로로 달려 나간 뒤 빠진다 (표의 "차량 N"에 세지 않는다) */
  leaving: boolean;
  /** 나가는 차가 길에서 막혀 서 있은 시간(초): 드물게 서로 막히면(하역 없이 출차한 차 등) 오래 기다리지 않고 뺀다 */
  stuckT: number;
  /** 입고 집게차(S2m): 차량 ID로 정한 모양(덤프 1 : 집게차 2, sim/grapple의 inboundBody). 상차 차량은 늘 false */
  grapple: boolean;
  /** 집게차의 받침다리·크레인·집게 (덤프·상차 차량은 쓰지 않는다) */
  crane: GrappleSim;
  /** 하역 단계에서 남았으리라 보는 시간(초): 서버 하역 시작 시각 + UNLOAD_EXPECTED_SEC까지. 하역 단계가 아니면 Infinity */
  unloadLeft: number;
}

export type WorkerPose = 'walk' | 'stand' | 'tablet' | 'wave';

export interface WorkerSim extends Mover {
  pose: WorkerPose;
  dir: 1 | -1;
  pause: number;
  /** 걸음 주기(라디안 누적) */
  stride: number;
  moving: boolean;
  look: number;
}

export interface LumpSim {
  active: boolean;
  /** 레일 위 수평 거리(레일 좌표계 u) */
  u: number;
  /** 0이면 벨트 위, 0~1이면 투입구로 떨어지는 중 */
  drop: number;
  seed: number;
}

/** 번호판 인식 장면: 계근대 위의 차를 카메라가 비춘다. plate는 서버 값(인식 전 null) */
export interface PlateScan {
  active: boolean;
  truckId: string;
  plate: string | null;
  /** 장면이 켜진 뒤 흐른 시간(월드 시계, 초) */
  t: number;
  /** 출차 계근 (아니면 입차 계근) */
  out: boolean;
  /** 비추는 곳(번호판, 월드) */
  x: number;
  z: number;
}

/** 트럭 속도(m/s, 연출) */
const TRUCK_SPEED = 4.6;
const TRUCK_REVERSE = 2.4;
/** 도로(부지 밖)에서는 더 빨리 */
const ROAD_SPEED = 6.5;
const TRUCK_ACCEL = 2.2;
const WORKER_SPEED = 0.75;
export const BELT_SPEED = 0.7;
const TILT_RATE = 0.42;

/** 하역 단계에서 남았으리라 보는 시간(초). 하역 단계가 아니면 Infinity */
function unloadLeft(v: Vehicle, nowMs: number): number {
  const start = v.stage === 'unloading' ? v.stageTimes.unloading : undefined;
  return start ? UNLOAD_EXPECTED_SEC - (nowMs - Date.parse(start)) / 1000 : Infinity;
}
const UNLOAD_SEC = 6.5;
/** 계근대에서 무게를 재는 동안 서 있는 최소 시간(초, 연출) */
const WEIGH_SEC = 2.0;
/** 번호판 인식 장면: 인식된 번호판을 계근대 위에서 보여 주는 시간(초, 연출). 1.4초는 너무 짧아 보이지 않았다 (S2i #4) */
export const PLATE_SHOW_SEC = 3.2;
/** 상차 자리에서 서버가 출차 계근을 준 뒤 마지막 베일을 기다리는 최대 시간(초). 넘으면 새로 싣지 않고 떠난다 */
const LOAD_WAIT_SEC = 150;
/** 그 뒤에도 싣는 지게차가 끝나지 않으면 상차를 그 자리에서 끝내기까지 더 기다리는 시간(초) */
const LOAD_STUCK_SEC = 30;
/** 계근대에 선 뒤 번호판을 읽는 데 걸리는 최소 시간(초, 연출): 서버 값이 먼저 와 있어도 이만큼은 "인식 중"을 보인다 */
export const PLATE_READ_SEC = 1.0;
/** 계근대에 오르기 전(도로·경사로·후진 중): 번호판·회사를 보이지 않는다 (S2l) */
const BEFORE_SCALE: ReadonlySet<TruckPhase> = new Set<TruckPhase>(['road', 'roadHold', 'toScale', 'reverseIn']);

/** 처음 만들어 두는 트럭 칸 수. 회사 안 차량이 더 많으면 늘린다(상한 없음: 서버의 회사 안 차량은 모두 그린다) */
const TRUCK_POOL = 8;
/** 출차해 나가는 차가 길에서 이만큼(초) 막혀 있으면 뺀다 */
const LEAVE_STUCK_SEC = 6;
/**
 * 출차 계근을 마친 차는 서버의 출차(departed)를 계근대 위에서 기다린다(출차 계근 중 = 계근대 위): 출입문 앞 대기 자리에 서서
 * 기다리지 않고 계근대에서 도로 끝까지 한 번에 나가게 (S2p). 출차가 이만큼 넘게 안 오면 예전처럼 대기 자리로 내려가 기다린다
 */
const EXIT_WAIT_ON_SCALE_SEC = 40;
const LUMP_POOL = 12;

/** 경로 위에서 사진의 한 점(px)에 가장 가까운 곳까지의 거리 */
function distanceTo(path: Path, x: number, y: number): number {
  const [tx, tz] = sitePx(x, y);
  let best = 0;
  let d = Infinity;
  for (let i = 0; i < path.dist.length; i += 1) {
    const e = Math.hypot(path.pts[i * 2]! - tx, path.pts[i * 2 + 1]! - tz);
    if (e < d) {
      d = e;
      best = path.dist[i]!;
    }
  }
  return best;
}
const PATH_ROAD = roundedPath(TRUCK_IN, 1.4);
/** PATH_ROAD에서 사진 위 끝(북쪽 가장자리)까지의 거리: 막 들어오는 차는 여기서 나타난다 */
const ROAD_EDGE_S = distanceTo(PATH_ROAD, 595, -10);
const PATH_ROAD_TO_SCALE = roundedPath(ROAD_TO_SCALE, 1.3);
const PATH_REVERSE_IN = roundedPath(SCALE_REVERSE_IN, 1.0);
const PATH_REVERSE_OUT = roundedPath(SCALE_REVERSE_OUT, 1.0);
const PATH_EXIT = roundedPath(SCALE_TO_EXIT, 1.5);
const PATH_LEAVE = roundedPath(EXIT_LEAVE, 1.4);
/** PATH_LEAVE에서 경사로를 다 내려가 도로에 선 거리: 여기서 계근대 차례(경사로)를 놓는다 */
const LEAVE_CLEAR_S = distanceTo(PATH_LEAVE, EXIT_RAMP_CLEAR_PX[0], EXIT_RAMP_CLEAR_PX[1]);
// 상차 자리로 드는 길·물러나는 길은 원호로 이미 이어 두었다(layout): 조각 사이만 다듬는다
const PATH_TO_LOAD = roundedPath(SCALE_TO_HOLD, 0.3);
const PATH_LOAD_BACK = roundedPath(HOLD_REVERSE, 0.3);
const PATH_LOAD_TO_SCALE = roundedPath(HOLD_TO_SCALE, 1.4);
const PATH_TO_QUEUE = roundedPath(SCALE_TO_QUEUE, 1.0);
const LOAD_SCALE_CLEAR = distanceTo(PATH_LOAD_TO_SCALE, SCALE_WEST_PX[0], SCALE_WEST_PX[1]);

/** 상차 자리를 떠나 베일을 실은 채 움직이는 단계 */
const CARRY_PHASES: ReadonlySet<TruckPhase> = new Set<TruckPhase>(['loadBack', 'toScale2', 'atScale2', 'reverseOut', 'toExit', 'exitHold', 'leave']);

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

interface WorkerSpec {
  route?: P2[];
  at?: P2;
  heading?: number;
  pose: WorkerPose;
}

// 작업자의 자리와 순회 길 (사진 px → 월드). 차량·지게차가 다니는 길과 겹치지 않게 잡았다 (연출용, 서버 값이 아니다)
const px = (x: number, y: number): P2 => sitePx(x, y);
const WORKERS: WorkerSpec[] = [
  // 계근대 곁 검수원 (사무실 앞 단)
  { at: px(478, 226), heading: -Math.PI / 2, pose: 'tablet' },
  // 사무실 서쪽 차양 아래
  { route: [px(410, 122), px(410, 196)], pose: 'walk' },
  // 압축기 조작반
  { at: railAt(7.6, -1.2), heading: Math.PI, pose: 'tablet' },
  // 남동 적치 구역 북동 날개 곁 검수
  { at: px(452, 380), heading: Math.PI, pose: 'tablet' },
  // 섹터 더미 사이 유도원 (레일 북동쪽)
  { at: px(232, 352), heading: 0.3, pose: 'wave' },
];

export class Director {
  /** 베일·지게차 (그리는 쪽이 읽는다. 좌표는 마당 좌표계: world/layout의 YARD_FRAME) */
  get bales(): readonly BaleSim[] {
    return this.yard.bales;
  }

  get forklifts(): readonly ForkliftSim[] {
    return this.yard.forklifts;
  }

  /** 받침대가 차서 압축기가 베일을 내보내지 못하고 기다린다 */
  get yardFull(): boolean {
    return this.yard.yardFull;
  }

  /** 월드 시계(초). 끊긴 동안에는 흐르지 않는다 */
  t = 0;
  /** 트럭 (입고 트럭·상차 차량 모두 서버 값) */
  readonly trucks: TruckSim[] = [];
  /** 계근대·입구 차례, 마당 안쪽 길·가로지르는 길 차례 */
  readonly scaleToken = new Token();
  readonly yardToken = new Token();
  /** 베일 적치: 베일·지게차·칸 */
  readonly yard = new Yard(this.yardToken);
  readonly lumps: LumpSim[] = [];
  readonly workers: WorkerSim[] = [];
  /** 번호판 인식 장면 (계근대 위의 차) */
  readonly plateScan: PlateScan = { active: false, truckId: '', plate: null, out: false, t: 0, x: 0, z: 0 };
  /** 섹터별 화면에 그릴 적재율 (서버 값으로 부드럽게 따라간다) */
  readonly fill: Record<TankId, number> = { 'sector-a': 0, 'sector-c': 0 };
  private readonly fillTarget: Record<TankId, number> = { 'sector-a': 0, 'sector-c': 0 };
  private fillSeen = false;
  beltOffset = 0;
  /** 램 위치 0(뒤)~1(끝까지 밂) */
  ram = 0;
  private ramPhase = 0;
  pressing = false;
  /** 투입구에 쌓인 정도 0~1 (레일에서 떨어진 뭉치 수) */
  hopper = 0;
  conveyorRunning = false;
  private seq = 0;
  private lumpSeed = 0;
  private readonly tmp: Pose = { x: 0, z: 0, heading: 0 };
  private readonly probeA: Pose = { x: 0, z: 0, heading: 0 };
  private readonly probeB: Pose = { x: 0, z: 0, heading: 0 };
  private readonly loader: LoaderState = { present: false, parked: false, id: '', x: 0, z: 0, heading: 0, loaded: 0, want: 0, loading: false, hurry: false };
  private readonly wpos = { x: 0, z: 0 };

  constructor() {
    for (let i = 0; i < TRUCK_POOL; i += 1) this.addTruckSlot();
    for (let i = 0; i < LUMP_POOL; i += 1) this.lumps.push({ active: false, u: 0, drop: 0, seed: i });
    this.yard.events.onEject = () => {
      this.hopper = 0;
    };
    WORKERS.forEach((spec, i) => {
      const start = spec.route?.[0] ?? spec.at ?? [0, 0];
      const w: WorkerSim = { ...mover(start[0], start[1], spec.heading ?? 0), pose: spec.pose, dir: 1, pause: 1 + i * 0.7, stride: i, moving: false, look: 0 };
      if (spec.route) w.path = roundedPath(spec.route, 0.5);
      this.workers.push(w);
    });
  }

  private addTruckSlot(): TruckSim {
    const t: TruckSim = { ...mover(0, 0, 0), active: false, id: '', seq: 0, phase: 'road', stage: 'arrived', bay: null, bedTilt: 0, load: 1, pouring: false, pourT: 0, variant: this.trucks.length, company: null, plate: null, serverPlate: null, serverCompany: null, outbound: false, want: 0, sides: 0, leaveWaitT: 0, weighT: 0, plateT: 0, clearS: 0, y: 0, leaving: false, stuckT: 0, grapple: false, crane: grappleSim(), unloadLeft: Infinity };
    this.trucks.push(t);
    return t;
  }

  // ── 서버 값 반영 ────────────────────────────────────────────────────

  /** store 값이 바뀔 때 부른다. 끊긴 동안에는 부르지 않는다. */
  sync(input: SimInput, nowMs: number): void {
    const { devices } = input;
    for (const id of TANK_IDS) {
      const d = devices[id];
      if (d?.type === 'tank') this.fillTarget[id] = d.fillPercent;
    }
    if (!this.fillSeen && TANK_IDS.some((id) => devices[id])) {
      // 처음 받은 값은 바로 보여 준다 (0에서 차오르는 것처럼 보이면 거짓 연출이다)
      for (const id of TANK_IDS) this.fill[id] = this.fillTarget[id];
      this.fillSeen = true;
    }
    const conveyor = devices['conveyor-z'];
    const compressor = devices['compressor-1'];
    this.conveyorRunning = conveyor?.type === 'conveyor' && conveyor.running;
    this.pressing = compressor?.type === 'compressor' && compressor.running && input.batches.some((b: Batch) => b.stage === 'compressing');

    // 출차(departed)한 차는 회사 밖이다: 그 자리에서 지우지 않고(S2i #6·#7: 순간이동·사라짐) 하던 동선(출차 계근까지)을 마친 뒤
    // 경사로를 내려가 도로를 따라 사진 밖까지 달려 나가고 빠진다. 서버 목록에서 빠진 차도 같다.
    // 나가는 차(leaving)는 표의 "차량 N"에 세지 않는다: truckCount() = 서버의 회사 안 차량 수.
    // 아직 도로에서 들어오지도 않은 차(부지 밖)는 바로 뺀다
    const listed = new Map<string, Vehicle>();
    for (const v of input.vehicles) listed.set(v.id, v);
    for (const t of this.trucks) {
      if (!t.active || t.leaving) continue;
      const v = listed.get(t.id);
      if (v && v.stage !== 'departed') continue;
      if (t.phase === 'road' || t.phase === 'roadHold') this.finish(t);
      else {
        t.leaving = true;
        t.stage = 'departed';
      }
    }
    for (const v of input.vehicles) {
      if (v.stage === 'departed') continue;
      const truck = this.trucks.find((t) => t.active && t.id === v.id);
      if (truck?.leaving) continue;
      if (truck) {
        if (truck.stage !== v.stage || v.stage === 'unloading') truck.unloadLeft = unloadLeft(v, nowMs);
        truck.stage = v.stage;
        truck.bay = v.sectorId;
        truck.serverCompany = v.companyName;
        truck.serverPlate = v.plate;
        this.revealIdentity(truck);
        truck.want = v.baleIds.length;
      } else {
        this.spawnTruck(v, nowMs);
      }
    }

    this.yard.sync(input.bales, nowMs);
  }

  private place(t: TruckSim, x: number, z: number, heading: number): void {
    Object.assign(t, mover(x, z, heading));
  }

  private spawnTruck(v: Vehicle, nowMs: number): void {
    const truck = this.trucks.find((t) => !t.active) ?? this.addTruckSlot();
    const fresh = v.stage === 'arrived' && nowMs - ms(v.stageTimes.arrived) < FRESH_MS;
    this.seq += 1;
    truck.active = true;
    truck.id = v.id;
    truck.seq = this.seq;
    truck.stage = v.stage;
    truck.bay = v.sectorId;
    truck.serverCompany = v.companyName;
    truck.serverPlate = v.plate;
    truck.outbound = v.kind === 'outbound';
    truck.want = v.baleIds.length;
    truck.grapple = !truck.outbound && inboundBody(v.id) === 'grapple';
    truck.unloadLeft = unloadLeft(v, nowMs);
    resetGrapple(truck.crane);
    truck.bedTilt = 0;
    truck.load = 1;
    truck.pouring = false;
    truck.pourT = 0;
    truck.weighT = 0;
    truck.leaveWaitT = 0;
    truck.leaving = false;
    truck.stuckT = 0;
    if (fresh) {
      // 막 들어온 차: 도로에서부터 들어오는 모습을 보여 준다
      this.fromRoad(truck);
    } else if (truck.outbound && (v.stage === 'loading' || v.stage === 'loaded') && !this.holdBusy(truck)) {
      // 이미 상차 중인 상차 차량: 상차 자리에 바로 놓는다
      this.place(truck, HOLD.x, HOLD.z, HOLD.heading);
      truck.phase = 'loading';
      truck.sides = 1;
      this.yard.preload(v.baleIds.length);
    } else if ((v.stage === 'unloading' || v.stage === 'unloaded' || v.stage === 'weighing_out') && v.sectorId && !this.tipBusy(truck, v.sectorId)) {
      // 이미 하역 중이거나 끝난 차: 있어야 할 자리(배정 더미 앞)에 바로 놓는다
      const tip = TIP[v.sectorId];
      this.place(truck, tip.x, tip.z, tip.heading);
      truck.phase = 'atTip';
      truck.bedTilt = v.stage === 'unloading' && !truck.grapple ? 1 : 0;
      truck.load = v.stage === 'unloading' ? 0.5 : 0;
      if (truck.grapple && v.stage === 'unloading') grappleMidUnload(truck.crane);
      else if (truck.grapple) resetGrapple(truck.crane, 0);
    } else if (v.sectorId && v.stage !== 'arrived' && this.tipBusy(truck, v.sectorId) && !this.queueBusy(truck)) {
      // 인식됐지만 배정 더미 앞이 차 있다: 기다리는 자리에
      this.place(truck, QUEUE.x, QUEUE.z, QUEUE.heading);
      truck.phase = 'queued';
    } else if (this.scaleToken.take(truck.id)) {
      // 계근대에 있어야 할 차: 계근대가 비어 있으면 그 위에 (후진으로 올라와 서쪽을 본다)
      this.place(truck, SCALE_STOP.x, SCALE_STOP.z, SCALE_STOP.heading);
      truck.phase = 'atScale';
    } else {
      // 계근대가 차 있으면 도로에서부터 들어와 차례를 기다린다 (서버의 회사 안 차량은 빠짐없이 장면에 둔다)
      this.fromRoad(truck);
    }
    this.revealIdentity(truck);
  }

  /**
   * 번호판·회사는 계근대에서 인식한다(명세 "계근대(arrived, 번호판 인식 장면, identified까지 대기)"):
   * 도로·경사로에 있는 동안, 그리고 계근대에 막 선 뒤 PLATE_READ_SEC 동안은 서버 값이 와 있어도 보이지 않는다.
   * 한 번 보인 번호판은 그 뒤 다시 감추지 않는다.
   */
  private revealIdentity(t: TruckSim): void {
    const hidden = BEFORE_SCALE.has(t.phase) || (t.phase === 'atScale' && t.plate === null && t.weighT < PLATE_READ_SEC);
    t.plate = hidden ? null : t.serverPlate;
    t.company = hidden ? null : t.serverCompany;
  }

  /** 도로(북쪽 밖)에서 들어온다: 이미 도로 위에 줄 선 차가 있으면 그 뒤에 선다 */
  private fromRoad(t: TruckSim): void {
    let s = PATH_ROAD.total;
    for (const o of this.trucks) {
      if (o === t || !o.active) continue;
      if (o.phase === 'road') s = Math.min(s, o.s);
      else if (o.phase === 'roadHold') s = Math.min(s, PATH_ROAD.total);
    }
    const queued = this.trucks.some((o) => o !== t && o.active && (o.phase === 'road' || o.phase === 'roadHold'));
    // 줄이 없으면 사진 위 끝(도로가 부지에 닿는 곳)에서 들어오고, 줄이 있으면 그 뒤(사진 밖 도로)에 선다
    const start = queued ? Math.max(0, Math.min(ROAD_EDGE_S, s - truckSize(t.outbound).length - 1.2)) : ROAD_EDGE_S;
    this.place(t, 0, 0, 0);
    t.phase = 'road';
    t.path = PATH_ROAD;
    t.s = start;
    samplePath(PATH_ROAD, start, t);
  }

  /** 로봇이 레일 위에서 집게를 놓았다 (관절 값 스트림에서 알아낸 사실) */
  robotReleased(): void {
    const lump = this.lumps.find((l) => !l.active);
    if (!lump) return;
    this.lumpSeed += 1;
    lump.active = true;
    lump.u = RAIL.startU + 0.45;
    lump.drop = 0;
    lump.seed = this.lumpSeed;
  }

  // ── 시간 진행 ───────────────────────────────────────────────────────

  step(dtRaw: number): void {
    const dt = Math.min(Math.max(dtRaw, 0), 0.1);
    if (dt === 0) return;
    this.t += dt;

    for (const id of TANK_IDS) this.fill[id] += (this.fillTarget[id] - this.fill[id]) * Math.min(1, dt * 1.2);

    if (this.conveyorRunning) this.beltOffset += BELT_SPEED * dt;
    for (const lump of this.lumps) {
      if (!lump.active) continue;
      if (lump.drop > 0) {
        lump.drop += dt * 2.2;
        if (lump.drop >= 1) {
          lump.active = false;
          this.hopper = Math.min(1, this.hopper + 0.2);
        }
      } else if (this.conveyorRunning) {
        lump.u += BELT_SPEED * dt;
        if (lump.u >= RAIL.endU - 0.05) lump.drop = 0.001;
      }
    }

    if (this.pressing) {
      this.ramPhase += dt * 1.6;
      this.ram = 0.5 - 0.5 * Math.cos(this.ramPhase);
    } else {
      this.ramPhase = 0;
      this.ram += (0 - this.ram) * Math.min(1, dt * 2.5);
    }

    this.stepTrucks(dt);
    this.syncLoader();
    this.yard.step(dt, this.trucks, this.loader);
    this.stepWorkers(dt);
    this.stepPlateScan(dt);
  }

  /** 상차 차량의 자리를 마당에 알린다 (지게차가 싣는다) */
  private syncLoader(): void {
    // 상차 자리로 가거나 서 있는 동안만 싣는다. 서버가 출차 계근을 줘도 서버가 실었다고 한 베일을 다 싣기 전에는 떠나지 않으므로 계속 싣는다 (S2j #12).
    // 지게차는 차가 상차 자리에 서서 옆판을 다 내린 뒤에야 다가간다(parked)
    const t = this.trucks.find((x) => x.active && x.outbound && (x.phase === 'toLoad' || x.phase === 'loading'));
    this.loader.present = Boolean(t);
    this.loader.parked = Boolean(t && t.phase === 'loading' && t.sides >= 1);
    this.loader.id = t?.id ?? '';
    this.loader.want = t?.want ?? 0;
    this.loader.loading = Boolean(t && t.stage !== 'arrived' && t.leaveWaitT < LOAD_WAIT_SEC);
    this.loader.hurry = Boolean(t && t.stage !== 'arrived' && t.stage !== 'identified' && t.stage !== 'loading');
    // 상차 자리를 떠난 차도 실린 베일이 따라가게 자리만 알린다 (실은 채 계근대·도로로 나간다, S2i: 나가는 길이 길어졌다)
    const carrier = t ?? this.trucks.find((x) => x.active && x.outbound && CARRY_PHASES.has(x.phase));
    if (!carrier) return;
    this.loader.x = carrier.x;
    this.loader.z = carrier.z;
    this.loader.heading = carrier.heading;
    if (!t) return;
    this.loader.x = t.x;
    this.loader.z = t.z;
    this.loader.heading = t.heading;
  }

  /** 상차 자리에 다른 상차 차량이 있거나 가는 중인가 */
  private holdBusy(self: TruckSim): boolean {
    return this.trucks.some((t) => t !== self && t.active && t.outbound && (t.phase === 'toLoad' || t.phase === 'loading'));
  }

  /** 계근대 위에 서 있는(재는 중인) 차를 번호판 카메라가 비춘다 */
  private stepPlateScan(dt: number): void {
    const s = this.plateScan;
    const t = this.trucks.find((x) => x.active && (x.phase === 'atScale' || x.phase === 'atScale2'));
    if (!t) {
      s.active = false;
      s.truckId = '';
      s.t = 0;
      return;
    }
    if (s.truckId !== t.id) s.t = 0;
    s.active = true;
    s.truckId = t.id;
    s.plate = t.plate;
    s.out = t.phase === 'atScale2';
    s.t += dt;
    // 카메라에 가까운 쪽(서쪽 끝)의 번호판: 서쪽을 보면 앞, 동쪽을 보면 뒤
    const half = truckSize(t.outbound).length / 2;
    const toWest = Math.cos(t.heading - SCALE.heading) > 0 ? 1 : -1;
    s.x = t.x + Math.cos(t.heading) * half * toWest;
    s.z = t.z - Math.sin(t.heading) * half * toWest;
  }

  /**
   * 지금 장면에서 실제로 움직이는 것들의 위치를 하나의 수로 묶는다. 앞 값과 같으면 아무것도 움직이지 않은 것이다
   * (화면은 이때 그리기를 쉰다: 필요할 때만 그리기). 작업자의 제자리 몸짓처럼 시계만 따르는 장식은 넣지 않는다.
   */
  motionKey(): number {
    let k = this.beltOffset * 1.7 + this.ram * 3.1 + this.hopper * 2.3;
    if (this.plateScan.active) k += Math.min(this.plateScan.t, 3) * 4.9 + (this.plateScan.plate ? 7.7 : 0);
    for (const id of TANK_IDS) k += this.fill[id] * 0.013;
    this.trucks.forEach((t, i) => {
      if (t.active) k += (t.x * 1.3 + t.z * 2.9 + t.heading * 4.1 + t.bedTilt * 6.7 + t.load * 8.3 + t.sides * 5.3 + (t.pouring ? t.pourT : 0) + (t.grapple ? grappleKey(t.crane) : 0)) * (i + 1);
    });
    k += this.yard.motionKey();
    this.lumps.forEach((l, i) => {
      if (l.active) k += (l.u + l.drop * 3) * (i + 31);
    });
    this.workers.forEach((w, i) => {
      if (w.moving) k += (w.x * 1.7 + w.z * 2.1 + w.heading) * (i + 51);
    });
    return k;
  }

  // ── 비켜 가기 ───────────────────────────────────────────────────────

  /** a가 경로를 따라 조금 앞(후진이면 뒤)으로 갔을 때의 자세 */
  private ahead(a: TruckSim, out: Pose, look: number): Pose {
    if (!a.path) {
      out.x = a.x;
      out.z = a.z;
      out.heading = a.heading;
      return out;
    }
    return samplePath(a.path, Math.min(a.path.total, a.s + look), out, a.reverse);
  }

  /**
   * 트럭 a가 가던 길로 조금 더 가면 다른 트럭(바닥 직사각형, 여유를 둔)이나 지게차에 닿는가.
   * 서 있는 자리와 경로는 서로 닿지 않게 놓았으니(world/layout) 실제 외곽선으로 견준다. 서로 막으면 먼저 온 쪽이 간다
   */
  private truckBlocked(a: TruckSim): boolean {
    const size = truckSize(a.outbound);
    const half = size.length / 2 + 0.12;
    const hw = size.width / 2 + 0.1;
    // 멈추는 데 드는 거리(advance의 감속 2.2배 가속)만큼 더 살핀다
    const look = 0.8 + (a.speed * a.speed) / (2 * TRUCK_ACCEL * 2.2);
    const p = this.ahead(a, this.probeA, look);
    for (const b of this.trucks) {
      if (b === a || !b.active) continue;
      const bs = truckSize(b.outbound);
      const bhl = bs.length / 2 + 0.12;
      const bhw = bs.width / 2 + 0.1;
      if (Math.hypot(b.x - p.x, b.z - p.z) > half + bhl + 1) continue;
      if (!rectsOverlap(p, b, half, hw, bhl, bhw)) continue;
      // 지금 이미 겹쳐 있으면(처음 놓일 때 등) 벗어나는 쪽은 막지 않는다
      if (rectsOverlap(a, b, half, hw, bhl, bhw) && !this.closer(p, a, b)) continue;
      // 서로 막고 있으면 먼저 온 쪽이 간다
      const mutual = b.path !== null && rectsOverlap(this.ahead(b, this.probeB, 0.8 + (b.speed * b.speed) / (2 * TRUCK_ACCEL * 2.2)), a, bhl, bhw, half, hw);
      if (mutual && a.seq < b.seq) continue;
      return true;
    }
    // 지게차는 마당 차례를 잡고 있을 때만 트럭 길을 건넌다. 그래도 앞에 있으면 기다린다
    for (const f of this.yard.forklifts) {
      yardToWorld(f.x, f.z, this.wpos);
      const dir = a.reverse ? -1 : 1;
      const px0 = a.x + Math.cos(a.heading) * dir * (size.length / 2 + 0.8);
      const pz0 = a.z - Math.sin(a.heading) * dir * (size.length / 2 + 0.8);
      if (Math.hypot(px0 - this.wpos.x, pz0 - this.wpos.z) < 1.8) return true;
    }
    return false;
  }

  /** p(앞으로 간 자세)가 a(지금)보다 b에 가까워지는가 */
  private closer(p: Pose, a: Pose, b: Pose): boolean {
    return Math.hypot(p.x - b.x, p.z - b.z) < Math.hypot(a.x - b.x, a.z - b.z);
  }

  private nearVehicle(w: WorkerSim): boolean {
    const px0 = w.x + Math.cos(w.heading) * 0.7;
    const pz0 = w.z - Math.sin(w.heading) * 0.7;
    for (const t of this.trucks) if (t.active && Math.hypot(px0 - t.x, pz0 - t.z) < 2.8) return true;
    for (const f of this.yard.forklifts) {
      yardToWorld(f.x, f.z, this.wpos);
      if (Math.hypot(px0 - this.wpos.x, pz0 - this.wpos.z) < 1.9) return true;
    }
    return false;
  }

  // ── 트럭 ────────────────────────────────────────────────────────────

  /** 계근대 가운데에서 떨어진 거리 */
  private fromScale(t: TruckSim): number {
    return Math.hypot(t.x - SCALE.center[0], t.z - SCALE.center[1]);
  }

  private finish(t: TruckSim): void {
    this.scaleToken.release(t.id);
    this.yardToken.release(t.id);
    if (t.outbound) this.yard.clearLoaded(t.want);
    t.active = false;
    t.leaving = false;
    t.path = null;
    t.id = '';
  }

  /** 이 섹터 더미 앞(쏟는 자리)을 다른 트럭이 쓰고 있거나 가는 중인가 */
  private tipBusy(self: TruckSim, bay: TankId): boolean {
    const tip = TIP[bay];
    return this.trucks.some(
      (t) =>
        t !== self &&
        t.active &&
        t.bay === bay &&
        (t.phase === 'toTip' || t.phase === 'reversing' || t.phase === 'atTip' || (t.phase === 'toScale2' && Math.hypot(t.x - tip.x, t.z - tip.z) < TRUCK.length * 1.6)),
    );
  }

  /**
   * 도로에서 경사로로 들어와도 되는가: 계근대에 오른 뒤 갈 곳이 있어야 한다(계근대에 선 채 막히지 않게).
   * 더미 앞에서 출차 계근을 기다리는 차가 있으면 먼저 보내고, 입고 차는 대기 자리가, 상차 차는 상차 자리가 비어 있어야 한다
   */
  private canEnter(self: TruckSim): boolean {
    if (this.trucks.some((t) => t !== self && t.active && ((t.phase === 'atTip' && (t.stage === 'weighing_out' || t.stage === 'departed')) || (t.phase === 'loading' && (t.stage === 'weighing_out' || t.stage === 'departed'))))) return false;
    // 경사로 위 출차 대기 자리에 차가 있으면(곧 나간다) 경사로가 막혀 있다
    if (this.trucks.some((t) => t !== self && t.active && (t.phase === 'toExit' || t.phase === 'exitHold' || (t.phase === 'leave' && t.s < LEAVE_CLEAR_S)))) return false;
    if (self.outbound) return !this.holdBusy(self);
    return (self.bay !== null && !this.tipBusy(self, self.bay)) || !this.queueBusy(self);
  }

  /** 기다리는 자리에 다른 트럭이 있거나 가는 중인가 */
  private queueBusy(self: TruckSim): boolean {
    return this.trucks.some((t) => t !== self && t.active && (t.phase === 'toQueue' || t.phase === 'queued' || (!t.outbound && Math.hypot(t.x - QUEUE.x, t.z - QUEUE.z) < TRUCK.length * 1.4)));
  }

  private stepTrucks(dt: number): void {
    // 트럭이 차례를 기다리는지는 걸음마다 새로 센다 (지게차는 트럭이 기다리지 않을 때만 마당 차례를 잡는다)
    this.yardToken.wanted = false;
    this.scaleToken.wanted = false;
    const order = this.trucks.filter((t) => t.active).sort((a, b) => a.seq - b.seq);
    for (const t of order) {
      t.pouring = false;
      t.unloadLeft -= dt;
      switch (t.phase) {
        case 'road':
          if (advance(t, dt, ROAD_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'roadHold';
            t.path = null;
          }
          break;
        case 'roadHold':
          if (this.canEnter(t) && this.scaleToken.take(t.id)) {
            t.phase = 'toScale';
            follow(t, PATH_ROAD_TO_SCALE);
          }
          break;
        case 'toScale':
          // 입고 트럭은 곧 계근대에서 인식되고 마당 안쪽 길로 간다: 경사로에 들어설 때부터 알려, 상차 중인 지게차가 양보 자리에서
          // 기다리게 한다 (S2m: 트럭이 계근대에서 기다리다 하역 단계를 놓치던 문제)
          if (!t.outbound) this.yardToken.wanted = true;
          if (advance(t, dt, TRUCK_SPEED * 0.8, TRUCK_ACCEL, this.truckBlocked(t))) {
            // 계근대 서쪽 끝 앞에서 서쪽을 보고 섰다: 후진으로 계근대에 오른다
            t.phase = 'reverseIn';
            follow(t, PATH_REVERSE_IN, true);
          }
          break;
        case 'reverseIn':
          // 곧 계근대에 서고 인식되면 마당 안쪽 길로 간다: 지게차가 새로 길을 건너지 않게 미리 알린다
          this.yardToken.wanted = true;
          if (advance(t, dt, TRUCK_REVERSE, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atScale';
            t.path = null;
            t.weighT = 0;
            t.plateT = 0;
          }
          break;
        case 'atScale':
          t.weighT += dt;
          this.revealIdentity(t);
          if (t.plate) t.plateT += dt;
          // 갈 수 있을 때만 마당 차례를 바란다. 상차 차량은 상차 자리가 비었을 때만: 앞 상차 차가 아직 서 있는데 바라면
          // 지게차가 마지막 베일을 실으러 마당 차례를 잡지 못하고, 앞 차는 싣는 지게차를 기다려 떠나지 못해 서로 멈춘다 (S2j)
          const canGo = t.outbound ? !this.holdBusy(t) : !t.bay || !this.tipBusy(t, t.bay) || !this.queueBusy(t);
          if (t.stage !== 'arrived' && canGo) this.yardToken.wanted = true;
          if (t.weighT < WEIGH_SEC || (t.plate !== null && t.plateT < PLATE_SHOW_SEC)) break;
          if (t.outbound) {
            if (t.stage !== 'arrived' && !this.holdBusy(t) && this.yardToken.take(t.id)) {
              t.phase = 'toLoad';
              follow(t, PATH_TO_LOAD);
            }
          } else if (t.stage !== 'arrived' && t.bay) {
            if (!this.tipBusy(t, t.bay)) {
              if (this.yardToken.take(t.id)) {
                t.phase = 'toTip';
                follow(t, truckToTip(t.bay));
              }
            } else if (!this.queueBusy(t) && this.yardToken.take(t.id)) {
              // 배정 더미 앞에 다른 트럭이 있다: 계근대를 비우고 곁에서 기다린다
              t.phase = 'toQueue';
              follow(t, PATH_TO_QUEUE);
            }
          } else if (t.stage === 'departed') {
            // 하역 없이 출차한 드문 차: 상차 자리 쪽으로 돌아 계근대에 앞으로 올라 다시 재고 나간다
            if (this.yardToken.take(t.id)) {
              t.phase = 'toLoad';
              follow(t, PATH_TO_LOAD);
            }
          }
          break;
        case 'toQueue':
          if (this.fromScale(t) > SCALE_CLEAR) this.scaleToken.release(t.id);
          if (advance(t, dt, TRUCK_SPEED * 0.8, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'queued';
            t.path = null;
            this.scaleToken.release(t.id);
            this.yardToken.release(t.id);
          }
          break;
        case 'queued':
          if (t.bay && !this.tipBusy(t, t.bay) && this.yardToken.take(t.id)) {
            t.phase = 'toTip';
            follow(t, truckQueueToTip(t.bay), false, 1.3);
          }
          break;
        case 'toTip':
          if (this.fromScale(t) > SCALE_CLEAR) this.scaleToken.release(t.id);
          if (advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t)) && t.bay) {
            t.phase = 'reversing';
            follow(t, truckReverse(t.bay), true, TRUCK_REVERSE_RADIUS);
          }
          break;
        case 'reversing':
          if (advance(t, dt, TRUCK_REVERSE, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atTip';
            t.path = null;
            this.scaleToken.release(t.id);
            this.yardToken.release(t.id);
          }
          break;
        case 'atTip': {
          const want = t.stage === 'unloading' && !t.grapple ? 1 : 0;
          t.bedTilt += Math.max(-TILT_RATE * dt, Math.min(TILT_RATE * dt, want - t.bedTilt));
          if (t.grapple) {
            // 집게차: 받침다리 → 크레인으로 여러 번 옮김 → 접기 (sim/grapple, 하역 단계 안에서 끝난다)
            stepGrapple(t.crane, dt, t.stage, t.unloadLeft);
            t.load = t.crane.load;
            t.pouring = t.crane.dropT < 0.6;
            if (t.pouring) t.pourT = t.crane.dropT;
          } else if (t.stage === 'unloading' && t.bedTilt > 0.55 && t.load > 0) {
            t.pouring = true;
            t.pourT += dt;
            // 늦게 섰으면 남은 하역 시간(적재함을 내리는 시간을 빼고) 안에 다 쏟는다
            t.load = Math.max(0, t.load - dt / Math.max(1.5, Math.min(UNLOAD_SEC, t.unloadLeft - 1 / TILT_RATE)));
          }
          if (t.stage === 'unloaded' || t.stage === 'weighing_out' || t.stage === 'departed') t.load = 0;
          // 출차 단계가 오면 다시 재러 간다. 마당 안쪽 길과 계근대를 함께 잡아야 떠난다
          if ((t.stage === 'weighing_out' || t.stage === 'departed') && t.bedTilt < 0.02 && (!t.grapple || grappleStowed(t.crane)) && t.bay) {
            t.bedTilt = 0;
            t.load = 0;
            if (this.bothTokens(t.id)) {
              t.phase = 'toScale2';
              follow(t, truckTipToScale(t.bay), false, 1.5);
              t.clearS = distanceTo(t.path!, SCALE_WEST_PX[0], SCALE_WEST_PX[1]);
            }
          }
          break;
        }
        case 'toLoad':
          if (this.fromScale(t) > SCALE_CLEAR) this.scaleToken.release(t.id);
          if (advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.path = null;
            this.scaleToken.release(t.id);
            if (t.outbound) {
              t.phase = 'loading';
              this.yardToken.release(t.id);
            } else {
              t.phase = 'loadBack';
              follow(t, PATH_LOAD_BACK, true);
            }
          }
          break;
        case 'loading': {
          // 서버가 출차 계근 단계를 주고, 서버가 실었다고 한 베일을 지게차가 다 실어 놓은 뒤에 옆판을 올리고 떠난다 (S2j #12).
          // 장면이 오래 못 따라가면(LOAD_WAIT_SEC) 새로 싣기를 멈추고, 들고 오던 베일만 놓은 뒤 떠난다 (덜 실은 만큼은 떠날 때 clearLoaded가 서버 수에 맞춘다)
          const leaveStage = t.stage === 'weighing_out' || t.stage === 'departed';
          if (leaveStage) t.leaveWaitT += dt;
          // 싣는 지게차가 길에서 막혀 끝나지 않으면(다른 차·지게차가 비키지 않음) 더 기다리지 않고 그 자리에서 상차를 끝낸다: 서로 기다려 멈추지 않게 (S2j)
          if (leaveStage && t.leaveWaitT >= LOAD_WAIT_SEC + LOAD_STUCK_SEC && this.yard.loadingBusy()) this.yard.abortLoad();
          const leave = leaveStage && !this.yard.loadingBusy() && (this.yard.loadingDone() || t.leaveWaitT >= LOAD_WAIT_SEC);
          // 오래 기다려도 다 못 실었으면(북서 재고가 비는 등) 남은 베일을 적재함에 바로 놓고 떠난다: 실린 수가 서버 값과 같게
          if (leave && !this.yard.loadingDone()) this.yard.preload(t.want);
          if (leave) t.sides = Math.max(0, t.sides - dt * 1.6);
          else t.sides = Math.min(1, t.sides + dt * 0.8);
          // 계근대와 마당 안쪽 길을 함께 잡아야 떠난다 (물렸다가 돌아 계근대에 오르는 동안 다른 차와 서로 막히지 않게)
          if (leave && t.sides <= 0 && this.bothTokens(t.id)) {
            t.phase = 'loadBack';
            follow(t, PATH_LOAD_BACK, true);
          }
          break;
        }
        case 'loadBack':
          if (advance(t, dt, TRUCK_REVERSE, TRUCK_ACCEL, this.truckBlocked(t))) {
            if (this.bothTokens(t.id)) {
              t.phase = 'toScale2';
              follow(t, PATH_LOAD_TO_SCALE);
              t.clearS = LOAD_SCALE_CLEAR;
            }
          }
          break;
        case 'toScale2': {
          if (t.s > t.clearS) this.yardToken.release(t.id);
          if (advance(t, dt, TRUCK_SPEED * 0.8, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atScale2';
            t.path = null;
            t.weighT = 0;
            t.plateT = 0;
            this.yardToken.release(t.id);
          }
          break;
        }
        case 'atScale2':
          t.weighT += dt;
          if (t.plate) t.plateT += dt;
          if (t.weighT < WEIGH_SEC || (t.plate !== null && t.plateT < PLATE_SHOW_SEC)) break;
          // 출차(departed)를 계근대 위에서 기다린다: 받으면 계근대에서 도로 끝까지 한 번에 나간다 (S2p)
          if (!t.leaving && t.weighT < EXIT_WAIT_ON_SCALE_SEC) break;
          // 동쪽을 보고 쟀다: 후진으로 서쪽에 내려와 경사로 위에서 나갈 채비를 한다 (계근대 동쪽 끝은 옹벽).
          // 서버가 출차(departed)를 주면 그때 회사 밖으로 빠진다(sync)
          t.phase = 'reverseOut';
          follow(t, PATH_REVERSE_OUT, true);
          break;
        case 'reverseOut':
          if (advance(t, dt, TRUCK_REVERSE, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'toExit';
            follow(t, PATH_EXIT);
          }
          break;
        case 'toExit':
          // 이미 출차했으면 대기 자리에서 서지 않고 그대로 경사로를 내려간다 (S2p: 출입문 앞 멈칫 없음)
          if (advance(t, dt, TRUCK_SPEED * 0.8, TRUCK_ACCEL, this.truckBlocked(t), t.leaving)) {
            this.yardToken.release(t.id);
            this.scaleToken.release(t.id);
            if (t.leaving) {
              t.phase = 'leave';
              followOn(t, PATH_LEAVE);
              break;
            }
            // 계근대는 비웠다(위): 다음 차가 출차 계근을 할 수 있다 (경사로는 이 차가 막고 있어 들어오는 차는 canEnter가 기다리게 한다)
            t.phase = 'exitHold';
            t.path = null;
          }
          break;
        case 'exitHold':
          // 서버가 출차를 주면 앞으로 경사로를 내려가 도로로 나간다 (방향·자리가 이어진다: 대기 자리에서 보던 동쪽 그대로)
          if (t.leaving) {
            t.phase = 'leave';
            follow(t, PATH_LEAVE);
          }
          break;
        case 'leave':
          // 경사로를 내려가는 동안은 계근대 속도, 도로에 서면 도로 속도. 길 끝(사진 남서쪽 밖)에 닿으면 서지 않고 달리던 채로 빠진다
          if (advance(t, dt, t.s < LEAVE_CLEAR_S ? TRUCK_SPEED * 0.8 : ROAD_SPEED, TRUCK_ACCEL, this.truckBlocked(t), true)) this.finish(t);
          break;
      }
      // 나가는 차가 길에서 오래 막혔다(서로 막힘): 회사 밖 차라 기다리게 두지 않고 뺀다 (드문 경우의 안전판, LEAVE_STUCK_SEC)
      if (t.active && t.leaving) {
        t.stuckT = t.path && t.waiting ? t.stuckT + dt : 0;
        if (t.stuckT > LEAVE_STUCK_SEC) this.finish(t);
      }
      t.y = t.active ? groundY(t.x, t.z) : 0;
    }
  }

  /** 계근대·마당 차례를 함께 잡는다 (둘 다 비었을 때만) */
  private bothTokens(id: string): boolean {
    if (!this.scaleToken.available(id) || !this.yardToken.available(id)) {
      if (this.scaleToken.available(id)) this.yardToken.wanted = true;
      if (this.yardToken.available(id)) this.scaleToken.wanted = true;
      return false;
    }
    this.scaleToken.take(id);
    this.yardToken.take(id);
    return true;
  }

  // ── 작업자 ──────────────────────────────────────────────────────────

  private stepWorkers(dt: number): void {
    this.workers.forEach((w, i) => {
      w.look = Math.sin(this.t * 0.6 + i * 1.7) * 0.5;
      if (!w.path) return;
      if (w.pause > 0) {
        w.pause -= dt;
        w.moving = false;
        return;
      }
      if (this.nearVehicle(w)) {
        w.moving = false;
        return;
      }
      w.moving = true;
      w.s += WORKER_SPEED * dt * w.dir;
      w.stride += dt * 7.5;
      const heading = w.heading;
      samplePath(w.path, w.s, this.tmp, w.dir < 0);
      w.x = this.tmp.x;
      w.z = this.tmp.z;
      w.heading = heading + angleDelta(heading, this.tmp.heading) * Math.min(1, dt * 6);
      if (w.s <= 0 || w.s >= w.path.total) {
        w.s = Math.min(Math.max(w.s, 0), w.path.total);
        w.dir = w.dir > 0 ? -1 : 1;
        w.pause = 2.5 + ((i * 37) % 30) / 10;
      }
    });
  }

  // ── 점검 (시험·점검용) ──────────────────────────────────────────────

  /** 트럭끼리 바닥 위 직사각형이 겹치는 쌍의 수 (시험·점검용, 그리기 중에는 부르지 않는다) */
  truckOverlaps(): number {
    let n = 0;
    const live = this.trucks.filter((t) => t.active);
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = truckSize(live[i]!.outbound);
        const b = truckSize(live[j]!.outbound);
        if (rectsOverlap(live[i]!, live[j]!, a.length / 2, a.width / 2, b.length / 2, b.width / 2)) n += 1;
      }
    }
    return n;
  }

  /**
   * 장면에 그리는 트럭 대수 (시험·점검용: 표의 "차량 N"과 견준다). 트럭 모형은 active인 칸만 보이고(actors/Actors.tsx),
   * 출차(departed)해 도로로 나가는 차(leaving)는 세지 않는다: 이 수가 곧 부지 안에 보이는 트럭 수다
   */
  truckCount(): number {
    return this.trucks.filter((t) => t.active && !t.leaving).length;
  }

  /** 출차해 도로로 달려 나가는 중인 트럭 수 (시험·점검용: 회사 밖이라 truckCount에 세지 않는다) */
  leavingCount(): number {
    return this.trucks.filter((t) => t.active && t.leaving).length;
  }

  // ── 기준점 (핀·카메라·선택) ─────────────────────────────────────────

  /** key의 대상이 지금 어디 있는지. 없으면 false. kind 'pin'은 핀이 붙는 높이, 'focus'는 카메라가 볼 곳 */
  anchor(key: string, out: { x: number; y: number; z: number }, kind: 'pin' | 'focus' = 'pin'): boolean {
    const sep = key.indexOf(':');
    const type = sep < 0 ? key : key.slice(0, sep);
    const id = sep < 0 ? '' : key.slice(sep + 1);
    if (type === 'dev') {
      const p = kind === 'pin' ? devicePin(id as DeviceId) : deviceCenter(id as DeviceId);
      out.x = p[0];
      out.y = p[1];
      out.z = p[2];
      return true;
    }
    if (type === 'veh') {
      const t = this.trucks.find((x) => x.active && x.id === id);
      if (!t) return false;
      out.x = t.x;
      out.y = t.y + (kind === 'pin' ? 2.7 + t.bedTilt * 1.1 : 0.8);
      out.z = t.z;
      return true;
    }
    if (type === 'bale') {
      const b = this.yard.baleById(id);
      if (!b) return false;
      yardToWorld(b.x, b.z, out);
      out.y = b.y + (kind === 'pin' ? BALE.h + 0.55 : BALE.h / 2);
      return true;
    }
    if (type === 'forklift') {
      const f = this.yard.forklift(key);
      if (!f) return false;
      yardToWorld(f.x, f.z, out);
      out.y = kind === 'pin' ? 2.3 : 0.7;
      return true;
    }
    return false;
  }

  /** 선택 상자용: 대상이 바라보는 방향(라디안, 월드). 방향이 없는 대상(기기)은 0 */
  heading(key: string): number {
    if (key.startsWith('forklift')) return (this.yard.forklift(key)?.heading ?? 0) + this.yard.frameRotY;
    if (key.startsWith('veh:')) return this.trucks.find((x) => x.active && x.id === key.slice(4))?.heading ?? 0;
    if (key.startsWith('bale:')) return (this.yard.baleById(key.slice(5))?.rot ?? 0) + this.yard.frameRotY;
    if (key === 'dev:conveyor-z' || key === 'dev:compressor-1') return RAIL_FRAME.heading;
    return 0;
  }

  /** 경로 표시용: 이 대상이 지금 따라가는 경로(월드)와 남은 구간의 시작 거리 */
  route(key: string): { path: Path; from: number } | null {
    if (key.startsWith('forklift')) {
      const f = this.yard.forklift(key);
      return f?.path ? { path: this.yard.worldPath(f.path), from: f.s } : null;
    }
    if (!key.startsWith('veh:')) return null;
    const t = this.trucks.find((x) => x.active && x.id === key.slice(4));
    return t?.path ? { path: t.path, from: t.s } : null;
  }
}

/** 두 차량(가운데·방향·반길이·반폭)의 바닥 직사각형이 겹치는가 */
/** 두 직사각형(가운데·방향, 반길이·반폭)이 겹치는가. b의 크기를 주지 않으면 a와 같다 */
function rectsOverlap(a: Pose, b: Pose, hl: number, hw: number, bhl = hl, bhw = hw): boolean {
  const axes: Array<[number, number]> = [
    [Math.cos(a.heading), -Math.sin(a.heading)],
    [Math.sin(a.heading), Math.cos(a.heading)],
    [Math.cos(b.heading), -Math.sin(b.heading)],
    [Math.sin(b.heading), Math.cos(b.heading)],
  ];
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const d = Math.abs(dx * ax + dz * az);
    const ra = hl * Math.abs(Math.cos(a.heading) * ax - Math.sin(a.heading) * az) + hw * Math.abs(Math.sin(a.heading) * ax + Math.cos(a.heading) * az);
    const rb = bhl * Math.abs(Math.cos(b.heading) * ax - Math.sin(b.heading) * az) + bhw * Math.abs(Math.sin(b.heading) * ax + Math.cos(b.heading) * az);
    if (d > ra + rb) return false;
  }
  return true;
}
