import { TANK_IDS } from '@ecocycle/shared';
import type { Bale, Batch, DeviceId, DeviceState, TankId, Vehicle, VehicleStage } from '@ecocycle/shared';
import {
  BALE,
  HOLD_TO_SCALE,
  EAST_OUT_CLEAR_PX_Y,
  OUT_CLEAR_PX_Y,
  QUEUE,
  RAIL,
  RAIL_FRAME,
  ROAD_HOLD,
  ROAD_TO_SCALE,
  SCALE,
  SCALE_CLEAR,
  SCALE_EAST_OUT,
  SCALE_STOP,
  SCALE_WEST_PX,
  SCALE_TO_HOLD,
  SCALE_TO_OUT,
  SCALE_TO_QUEUE,
  STOCK_PIN,
  STRIP_CLEAR_PX,
  TIP,
  TRUCK,
  TRUCK_IN,
  deviceCenter,
  devicePin,
  railAt,
  sitePx,
  truckQueueToTip,
  truckReverse,
  truckTipToScale,
  truckToTip,
  worldToPx,
  yardToWorld,
} from '../world/layout';
import { FRESH_MS, advance, follow, mover } from './mover';
import type { Mover } from './mover';
import { angleDelta, roundedPath, samplePath } from './paths';
import type { P2, Path, Pose } from './paths';
import { Token } from './token';
import { Yard } from './yard';
import type { BaleSim, ForkliftSim, LoaderState } from './yard';

export type { BaleSim, BaleState, ForkliftSim } from './yard';

// 스튜디오의 "연출 감독" (three 미사용, 테스트 가능).
// 서버가 준 단계(stage)·기기 상태를 받아 트럭·지게차·베일·작업자의 움직임으로 옮긴다.
//  - 업무 값(회사·배정 섹터·배합비·압력)은 만들지 않는다. 받은 값이 "어디로 가야 하는가"만 정한다.
//  - step(dt)를 부르지 않으면 아무것도 움직이지 않는다. 연결이 끊기면 화면은 step을 부르지 않는다 (추측으로 움직이지 않는다).
//  - 서로 비켜 간다: 가려는 자리 앞에 다른 것이 있으면 기다리고, 서로 막으면 먼저 온 쪽이 간다.
//  - 길을 나눠 쓴다: 계근대·입구·도는 길은 "계근대" 차례(`scaleToken`), 마당 안쪽 길(계근대 ↔ 섹터 더미 ↔ 출구로 도는 길)과
//    지게차가 남동 → 북서로 가로지르는 길은 "마당" 차례(`yardToken`)를 잡은 하나만 움직인다. 서 있는 자리(도로 대기, 계근대,
//    쏟는 자리, 상차 자리)는 어느 길에도 걸치지 않게 놓았다(world/layout). 그래서 서로 마주 오거나 길 한가운데에서 막히지 않는다.
//
// 입고 트럭(서버 값): 도로(북쪽) → 입구 북쪽 차로 → 계근대(서버가 인식 단계를 줄 때까지 기다림) → 배정 섹터 더미 앞에서 후진해 쏟는다
//   (하역 단계가 와야 적재함을 든다) → 남쪽 길 → 입구 안쪽으로 돌아 계근대(다시 잼, 출차 단계가 올 때까지) → 서쪽으로 돌아 입구 남쪽 차로 → 도로.
// 상차 차량("예시", 서버 값 없음): 같은 입구로 들어와 빈 차를 재고 → 남동 구역 곁 상차 자리 → 지게차가 북서 고정 재고에서 베일을 실어 준다
//   → 다시 재고 → 같은 입구로 나간다. 번호판·회사·무게를 지어내지 않는다(핀·패널은 "예시"만 적는다).

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
  | 'atScale'
  | 'toQueue'
  | 'queued'
  | 'toTip'
  | 'reversing'
  | 'atTip'
  | 'toScale2'
  | 'toLoad'
  | 'loading'
  | 'atScale2'
  | 'leaving';

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
  /** 서버가 번호판으로 정한 회사 이름 (인식 전 null). 트럭 띠 색에만 쓴다 */
  company: string | null;
  /** 상차 차량("예시"): 서버 값이 없는 3D 연출 */
  example: boolean;
  /** 계근대 위에서 머문 시간(초) */
  weighT: number;
  /** 다시 재러 가는 길에서 마당 안쪽 길을 벗어나는 거리 (마당 차례를 놓는 곳) */
  clearS: number;
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

/** 트럭 속도(m/s, 연출). 부지가 넓어져 예전(2.6·1.25)보다 빠르게 잡았다: 서버 단계 사이(인식 → 하역 17초)에 더미 앞까지 가도록 */
const TRUCK_SPEED = 4.0;
const TRUCK_REVERSE = 2.0;
const TRUCK_ACCEL = 2.2;
const WORKER_SPEED = 0.75;
export const BELT_SPEED = 0.7;
const TILT_RATE = 0.42;
const UNLOAD_SEC = 6.5;
/** 계근대에서 무게를 재는 동안 서 있는 최소 시간(초, 연출) */
const WEIGH_SEC = 1.6;
/** 상차 차량("예시")이 들어오는 간격(월드 시계 초, 연출) */
export const LOADER_EVERY_SEC = 300;
const LOADER_FIRST_SEC = 25;

const TRUCK_POOL = 4;
const LUMP_POOL = 12;
/** 상차 차량의 아이디(서버 값이 아니다) */
export const LOADER_ID = 'example-loader';

const PATH_ROAD = roundedPath(TRUCK_IN.slice(0, 3));
const PATH_ROAD_TO_SCALE = roundedPath(ROAD_TO_SCALE, 1.1);
const PATH_OUT = roundedPath(SCALE_TO_OUT, 1.7);
const PATH_EAST_OUT = roundedPath(SCALE_EAST_OUT, 1.4);
const PATH_TO_LOAD = roundedPath(SCALE_TO_HOLD, 1.7);
const PATH_LOAD_TO_SCALE = roundedPath(HOLD_TO_SCALE, 1.6);
const PATH_TO_QUEUE = roundedPath(SCALE_TO_QUEUE, 1.0);
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
const LOAD_STRIP_CLEAR = distanceTo(PATH_LOAD_TO_SCALE, STRIP_CLEAR_PX[0], STRIP_CLEAR_PX[1]);

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
  // 계근대 곁 검수원
  { at: px(470, 226), heading: -Math.PI / 2, pose: 'tablet' },
  // 사무실 앞 보도
  { route: [px(422, 216), px(494, 216)], pose: 'walk' },
  // 압축기 조작반
  { at: railAt(7.6, -1.2), heading: Math.PI, pose: 'tablet' },
  // 남동 적치 구역 곁 검수
  { at: px(452, 404), heading: Math.PI, pose: 'tablet' },
  // 섹터 더미 사이 유도원
  { at: px(240, 322), heading: 0.3, pose: 'wave' },
];

export class Director {
  /** 출하 마당의 베일·지게차 (그리는 쪽이 읽는다. 좌표는 마당 좌표계: world/layout의 YARD_FRAME) */
  get bales(): readonly BaleSim[] {
    return this.yard.bales;
  }

  get forklifts(): readonly ForkliftSim[] {
    return this.yard.forklifts;
  }

  /** 칸이 다 차서 압축기가 베일을 내보내지 못하고 기다린다 */
  get yardFull(): boolean {
    return this.yard.yardFull;
  }

  /** 월드 시계(초). 끊긴 동안에는 흐르지 않는다 */
  t = 0;
  /** 입고 트럭(서버 값) 몇 대 + 마지막 한 칸은 상차 차량("예시") */
  readonly trucks: TruckSim[] = [];
  /** 계근대·입구·도는 길 차례, 마당 안쪽 길·가로지르는 길 차례 */
  readonly scaleToken = new Token();
  readonly yardToken = new Token();
  /** 출하 마당: 베일·지게차·칸 */
  readonly yard = new Yard(this.yardToken);
  readonly lumps: LumpSim[] = [];
  readonly workers: WorkerSim[] = [];
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
  gateIn = 0;
  gateOut = 0;
  conveyorRunning = false;
  private seq = 0;
  private lumpSeed = 0;
  private nextLoaderT = LOADER_FIRST_SEC;
  private readonly tmp: Pose = { x: 0, z: 0, heading: 0 };
  private readonly loader: LoaderState = { present: false, parked: false, x: 0, z: 0, heading: 0, loaded: 0 };
  private readonly wpos = { x: 0, z: 0 };

  constructor() {
    for (let i = 0; i <= TRUCK_POOL; i += 1) {
      this.trucks.push({ ...mover(0, 0, 0), active: false, id: '', seq: 0, phase: 'road', stage: 'arrived', bay: null, bedTilt: 0, load: 1, pouring: false, pourT: 0, variant: i, company: null, example: i === TRUCK_POOL, weighT: 0, clearS: 0 });
    }
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

  /** 상차 차량("예시") */
  get loaderTruck(): TruckSim {
    return this.trucks[TRUCK_POOL]!;
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

    for (const v of input.vehicles) {
      const truck = this.trucks.find((t) => t.active && !t.example && t.id === v.id);
      if (truck) {
        truck.stage = v.stage;
        truck.bay = v.sectorId;
        truck.company = v.companyName;
      } else if (v.stage !== 'departed') {
        this.spawnTruck(v, nowMs);
      }
    }

    this.yard.sync(input.bales, nowMs);
  }

  private place(t: TruckSim, x: number, z: number, heading: number): void {
    Object.assign(t, mover(x, z, heading));
  }

  /** 도로 들머리(북쪽 밖)가 비었는가 */
  private spawnClear(): boolean {
    samplePath(PATH_ROAD, 0, this.tmp);
    return !this.trucks.some((t) => t.active && Math.hypot(t.x - this.tmp.x, t.z - this.tmp.z) < TRUCK.length * 2);
  }

  private spawnTruck(v: Vehicle, nowMs: number): void {
    const truck = this.trucks.find((t) => !t.active && !t.example);
    if (!truck) return;
    // 막 들어오는 차인데 도로 들머리에 다른 차가 있으면 다음 값에서 들여보낸다
    if (v.stage === 'arrived' && nowMs - ms(v.stageTimes.arrived) < FRESH_MS && !this.spawnClear()) return;
    this.seq += 1;
    truck.active = true;
    truck.id = v.id;
    truck.seq = this.seq;
    truck.stage = v.stage;
    truck.bay = v.sectorId;
    truck.company = v.companyName;
    truck.bedTilt = 0;
    truck.load = 1;
    truck.pouring = false;
    truck.pourT = 0;
    truck.weighT = 0;
    if (v.stage === 'arrived' && nowMs - ms(v.stageTimes.arrived) < FRESH_MS) {
      // 막 들어온 차: 도로에서부터 들어오는 모습을 보여 준다
      this.place(truck, 0, 0, 0);
      truck.phase = 'road';
      truck.path = PATH_ROAD;
      samplePath(PATH_ROAD, 0, truck);
    } else if ((v.stage === 'unloading' || v.stage === 'unloaded') && v.sectorId && !this.tipBusy(truck, v.sectorId)) {
      // 이미 하역 중이거나 끝난 차: 있어야 할 자리(배정 더미 앞)에 바로 놓는다
      const tip = TIP[v.sectorId];
      this.place(truck, tip.x, tip.z, tip.heading);
      truck.phase = 'atTip';
      truck.bedTilt = v.stage === 'unloading' ? 1 : 0;
      truck.load = v.stage === 'unloading' ? 0.5 : 0;
    } else if (v.sectorId && this.tipBusy(truck, v.sectorId) && !this.queueBusy(truck)) {
      // 인식됐지만 배정 더미 앞이 차 있다: 기다리는 자리에
      this.place(truck, QUEUE.x, QUEUE.z, QUEUE.heading);
      truck.phase = 'queued';
    } else if (this.scaleToken.take(truck.id)) {
      // 계근대에 있어야 할 차: 계근대가 비어 있으면 그 위에, 아니면 도로 대기 자리에
      this.place(truck, SCALE_STOP.x, SCALE_STOP.z, SCALE_STOP.heading);
      truck.phase = 'atScale';
    } else {
      this.place(truck, ROAD_HOLD.x, ROAD_HOLD.z, ROAD_HOLD.heading);
      truck.phase = 'roadHold';
    }
  }

  private spawnLoader(): void {
    const t = this.loaderTruck;
    this.seq += 1;
    this.place(t, 0, 0, 0);
    t.active = true;
    t.id = LOADER_ID;
    t.seq = this.seq;
    t.stage = 'arrived';
    t.bay = null;
    t.company = null;
    t.bedTilt = 0;
    t.load = 0;
    t.pouring = false;
    t.pourT = 0;
    t.weighT = 0;
    t.phase = 'road';
    t.path = PATH_ROAD;
    samplePath(PATH_ROAD, 0, t);
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

    if (!this.loaderTruck.active && this.t >= this.nextLoaderT) {
      // 도로 들머리에 다른 차가 있으면 조금 뒤에 들여보낸다 (겹쳐 나타나지 않게)
      if (this.spawnClear()) this.spawnLoader();
      else this.nextLoaderT = this.t + 3;
    }

    this.stepTrucks(dt);
    this.syncLoader();
    this.yard.step(dt, this.trucks, this.loader);
    this.stepWorkers(dt);

    let wantIn = 0;
    let wantOut = 0;
    const [gx, gz] = sitePx(512, 300);
    for (const t of this.trucks) {
      if (!t.active || Math.hypot(t.x - gx, t.z - gz) > 4.6) continue;
      if (t.phase === 'toScale') wantIn = 1;
      if (t.phase === 'leaving') wantOut = 1;
    }
    this.gateIn += (wantIn - this.gateIn) * Math.min(1, dt * 3.5);
    this.gateOut += (wantOut - this.gateOut) * Math.min(1, dt * 3.5);
  }

  /** 상차 차량의 자리·실린 수를 마당에 알린다 (지게차가 싣는다) */
  private syncLoader(): void {
    const t = this.loaderTruck;
    this.loader.present = t.active;
    this.loader.parked = t.active && t.phase === 'loading';
    this.loader.x = t.x;
    this.loader.z = t.z;
    this.loader.heading = t.heading;
  }

  /**
   * 지금 장면에서 실제로 움직이는 것들의 위치를 하나의 수로 묶는다. 앞 값과 같으면 아무것도 움직이지 않은 것이다
   * (화면은 이때 그리기를 쉰다: 필요할 때만 그리기). 작업자의 제자리 몸짓처럼 시계만 따르는 장식은 넣지 않는다.
   */
  motionKey(): number {
    let k = this.beltOffset * 1.7 + this.ram * 3.1 + this.gateIn * 5.3 + this.gateOut * 7.9 + this.hopper * 2.3;
    for (const id of TANK_IDS) k += this.fill[id] * 0.013;
    this.trucks.forEach((t, i) => {
      if (t.active) k += (t.x * 1.3 + t.z * 2.9 + t.heading * 4.1 + t.bedTilt * 6.7 + t.load * 8.3 + (t.pouring ? t.pourT : 0)) * (i + 1);
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

  private probeHits(a: Mover, aHalf: number, aR: number, b: Pose, bHalf: number, bR: number): boolean {
    const dir = a.reverse ? -1 : 1;
    const px0 = a.x + Math.cos(a.heading) * dir * (aHalf + 0.95);
    const pz0 = a.z - Math.sin(a.heading) * dir * (aHalf + 0.95);
    const min = aR + bR + 0.12;
    for (let k = -1; k <= 1; k += 1) {
      const bx = b.x + Math.cos(b.heading) * bHalf * 0.8 * k;
      const bz = b.z - Math.sin(b.heading) * bHalf * 0.8 * k;
      if (Math.hypot(px0 - bx, pz0 - bz) < min) return true;
    }
    return false;
  }

  private truckBlocked(a: TruckSim): boolean {
    const half = TRUCK.length / 2;
    for (const b of this.trucks) {
      if (b === a || !b.active) continue;
      if (!this.probeHits(a, half, 0.6, b, half, 0.6)) continue;
      // 서로 막고 있으면 먼저 온 쪽이 간다
      const mutual = b.path !== null && this.probeHits(b, half, 0.6, a, half, 0.6);
      if (mutual && a.seq < b.seq) continue;
      return true;
    }
    // 지게차는 마당 차례를 잡고 있을 때만 트럭 길을 건넌다. 그래도 앞에 있으면 기다린다
    for (const f of this.yard.forklifts) {
      yardToWorld(f.x, f.z, this.wpos);
      const dir = a.reverse ? -1 : 1;
      const px0 = a.x + Math.cos(a.heading) * dir * (half + 0.8);
      const pz0 = a.z - Math.sin(a.heading) * dir * (half + 0.8);
      if (Math.hypot(px0 - this.wpos.x, pz0 - this.wpos.z) < 1.6) return true;
    }
    return false;
  }

  private nearVehicle(w: WorkerSim): boolean {
    const px0 = w.x + Math.cos(w.heading) * 0.7;
    const pz0 = w.z - Math.sin(w.heading) * 0.7;
    for (const t of this.trucks) if (t.active && Math.hypot(px0 - t.x, pz0 - t.z) < 2.3) return true;
    for (const f of this.yard.forklifts) {
      yardToWorld(f.x, f.z, this.wpos);
      if (Math.hypot(px0 - this.wpos.x, pz0 - this.wpos.z) < 1.7) return true;
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
    if (t.example) {
      this.yard.clearLoaded();
      this.nextLoaderT = this.t + LOADER_EVERY_SEC;
    }
    t.active = false;
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

  /** 기다리는 자리에 다른 트럭이 있거나 가는 중인가 */
  private queueBusy(self: TruckSim): boolean {
    return this.trucks.some((t) => t !== self && t.active && (t.phase === 'toQueue' || t.phase === 'queued'));
  }

  private stepTrucks(dt: number): void {
    // 트럭이 차례를 기다리는지는 걸음마다 새로 센다 (지게차는 트럭이 기다리지 않을 때만 마당 차례를 잡는다)
    this.yardToken.wanted = false;
    this.scaleToken.wanted = false;
    // 먼저 온 차부터 차례를 잡는다
    const order = this.trucks.filter((t) => t.active).sort((a, b) => a.seq - b.seq);
    for (const t of order) {
      t.pouring = false;
      switch (t.phase) {
        case 'road':
          if (advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'roadHold';
            t.path = null;
          }
          break;
        case 'roadHold':
          if (this.scaleToken.take(t.id)) {
            t.phase = 'toScale';
            follow(t, PATH_ROAD_TO_SCALE);
          }
          break;
        case 'toScale':
          // 곧 계근대에 서고 인식되면 마당 안쪽 길로 간다: 지게차가 새로 길을 건너지 않게 미리 알린다
          this.yardToken.wanted = true;
          if (advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atScale';
            t.path = null;
            t.weighT = 0;
          }
          break;
        case 'atScale':
          t.weighT += dt;
          // 인식되면 곧 마당 안쪽 길로 간다: 지게차가 새로 길을 건너지 않게 미리 알린다
          if (t.example || t.stage !== 'arrived') this.yardToken.wanted = true;
          if (t.example) {
            if (t.weighT >= WEIGH_SEC && this.yardToken.take(t.id)) {
              t.phase = 'toLoad';
              follow(t, PATH_TO_LOAD);
            }
          } else if (t.stage === 'departed') {
            if (this.yardToken.take(t.id)) {
              t.phase = 'leaving';
              follow(t, PATH_OUT);
            }
          } else if (t.stage !== 'arrived' && t.bay && t.weighT >= WEIGH_SEC) {
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
            follow(t, truckReverse(t.bay), true, 1.2);
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
          const want = t.stage === 'unloading' ? 1 : 0;
          t.bedTilt += Math.max(-TILT_RATE * dt, Math.min(TILT_RATE * dt, want - t.bedTilt));
          if (t.stage === 'unloading' && t.bedTilt > 0.55 && t.load > 0) {
            t.pouring = true;
            t.pourT += dt;
            t.load = Math.max(0, t.load - dt / UNLOAD_SEC);
          }
          if (t.stage === 'unloaded') t.load = 0;
          // 출차 단계가 오면 다시 재러 간다(재고 나간다). 그 전에는 더미 앞에서 기다려 계근대를 다음 트럭에 비워 준다.
          // 마당 안쪽 길과 계근대를 함께 잡아야 떠난다
          if (t.stage === 'departed' && t.bedTilt < 0.02 && t.bay) {
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
            t.phase = 'loading';
            t.path = null;
            this.scaleToken.release(t.id);
            this.yardToken.release(t.id);
            this.loader.loaded = 0;
          }
          break;
        case 'loading':
          if (this.yard.loadingDone() && this.bothTokens(t.id)) {
            t.phase = 'toScale2';
            follow(t, PATH_LOAD_TO_SCALE);
            t.clearS = LOAD_STRIP_CLEAR;
          }
          break;
        case 'toScale2': {
          if (t.s > t.clearS) this.yardToken.release(t.id);
          if (advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atScale2';
            t.path = null;
            t.weighT = 0;
            this.yardToken.release(t.id);
          }
          break;
        }
        case 'atScale2':
          t.weighT += dt;
          if (t.weighT < WEIGH_SEC) break;
          if (t.example) {
            // 상차 차량은 서쪽을 보고 쟀다: 서쪽으로 나가 남쪽 길로 돌아 나간다 (마당 안쪽 길을 쓴다)
            if (this.yardToken.take(t.id)) {
              t.phase = 'leaving';
              follow(t, PATH_OUT);
            }
          } else if (t.stage === 'departed') {
            // 동쪽을 보고 잰 트럭: 계근대 동쪽 끝에서 바로 입구로 나간다
            t.phase = 'leaving';
            follow(t, PATH_EAST_OUT);
          }
          break;
        case 'leaving': {
          // 나가는 길은 입구 안쪽에서 들어오는 차로·다시 재러 오는 길과 만난다: 그곳을 지나면 차례를 놓는다.
          // 동쪽으로 잰 트럭은 입구 북쪽 차로 아래로 내려서면(EAST_OUT_CLEAR_PX_Y) 되고, 서쪽으로 돌아 나가는 차는 도로에 올라야 한다
          const [, py] = worldToPx(t.x, t.z);
          if (py > (t.path === PATH_EAST_OUT ? EAST_OUT_CLEAR_PX_Y : OUT_CLEAR_PX_Y)) {
            this.scaleToken.release(t.id);
            this.yardToken.release(t.id);
          }
          if (advance(t, dt, TRUCK_SPEED * 1.15, TRUCK_ACCEL, this.truckBlocked(t))) this.finish(t);
          break;
        }
      }
    }
  }

  /** 계근대·마당 차례를 함께 잡는다 (둘 다 비었을 때만) */
  private bothTokens(id: string): boolean {
    if (!this.scaleToken.free(id) || !this.yardToken.free(id)) {
      this.scaleToken.wanted = true;
      this.yardToken.wanted = true;
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
        if (rectsOverlap(live[i]!, live[j]!, TRUCK.length / 2, TRUCK.width / 2)) n += 1;
      }
    }
    return n;
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
    if (type === 'veh' || type === 'example') {
      const t = type === 'example' ? (this.loaderTruck.active ? this.loaderTruck : undefined) : this.trucks.find((x) => x.active && !x.example && x.id === id);
      if (!t) return false;
      out.x = t.x;
      out.y = kind === 'pin' ? 2.0 + t.bedTilt * 0.9 : 0.6;
      out.z = t.z;
      return true;
    }
    if (type === 'stock') {
      out.x = STOCK_PIN[0];
      out.y = kind === 'pin' ? STOCK_PIN[1] : 0.6;
      out.z = STOCK_PIN[2];
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
      out.y = kind === 'pin' ? 2.0 : 0.6;
      return true;
    }
    return false;
  }

  /** 선택 상자용: 대상이 바라보는 방향(라디안, 월드). 방향이 없는 대상(기기)은 0 */
  heading(key: string): number {
    if (key.startsWith('forklift')) return (this.yard.forklift(key)?.heading ?? 0) + this.yard.frameRotY;
    if (key.startsWith('veh:')) return this.trucks.find((x) => x.active && !x.example && x.id === key.slice(4))?.heading ?? 0;
    if (key.startsWith('example:')) return this.loaderTruck.heading;
    if (key.startsWith('bale:')) return (this.yard.baleById(key.slice(5))?.rot ?? 0) + this.yard.frameRotY;
    // 레일·압축기는 레일 방향으로 놓였다
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
    const t = this.trucks.find((x) => x.active && !x.example && x.id === key.slice(4));
    return t?.path ? { path: t.path, from: t.s } : null;
  }
}

/** 두 차량(가운데·방향·반길이·반폭)의 바닥 직사각형이 겹치는가 */
function rectsOverlap(a: Pose, b: Pose, hl: number, hw: number): boolean {
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
    const rb = hl * Math.abs(Math.cos(b.heading) * ax - Math.sin(b.heading) * az) + hw * Math.abs(Math.sin(b.heading) * ax + Math.cos(b.heading) * az);
    if (d > ra + rb) return false;
  }
  return true;
}
