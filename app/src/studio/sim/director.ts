import { TANK_IDS } from '@ecocycle/shared';
import type { Bale, Batch, DeviceId, DeviceState, TankId, Vehicle, VehicleStage } from '@ecocycle/shared';
import {
  BALE,
  BALE_REST,
  BALER,
  CONVEYOR,
  GATE,
  ROAD,
  SCALE,
  TRUCK,
  TRUCK_IN,
  TRUCK_OUT,
  TRUCK_SCALE_TO_EXIT,
  YARD,
  bayCenterZ,
  deviceCenter,
  devicePin,
  truckReverse,
  truckToBay,
  truckToExit,
} from '../world/layout';
import { angleDelta, roundedPath, samplePath } from './paths';
import type { P2, Path, Pose } from './paths';

// 스튜디오의 "연출 감독" (three 미사용, 테스트 가능).
// 서버가 준 단계(stage)·기기 상태를 받아 트럭·지게차·베일·작업자의 움직임으로 옮긴다.
//  - 업무 값(회사·배정 섹터·배합비·압력)은 만들지 않는다. 받은 값이 "어디로 가야 하는가"만 정한다.
//  - step(dt)를 부르지 않으면 아무것도 움직이지 않는다. 연결이 끊기면 화면은 step을 부르지 않는다 (추측으로 움직이지 않는다).
//  - 서로 비켜 간다: 가려는 자리 앞에 다른 것이 있으면 기다리고, 서로 막으면 먼저 온 쪽이 간다.

export interface SimInput {
  devices: Partial<Record<DeviceId, DeviceState>>;
  vehicles: readonly Vehicle[];
  batches: readonly Batch[];
  bales: readonly Bale[];
}

export type TruckPhase = 'toScale' | 'atScale' | 'toBay' | 'reversing' | 'atBay' | 'toExit' | 'atExit' | 'leaving';

interface Mover extends Pose {
  path: Path | null;
  s: number;
  reverse: boolean;
  speed: number;
  waiting: boolean;
  /** 바퀴 굴림(라디안 누적) */
  wheel: number;
}

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
}

export type BaleState = 'ejecting' | 'chute' | 'carried' | 'stack' | 'gone';

export interface BaleSim {
  active: boolean;
  id: string;
  state: BaleState;
  x: number;
  y: number;
  z: number;
  rot: number;
  slot: number;
  t: number;
}

type Leg =
  | { kind: 'drive'; to: P2; reverse: boolean }
  | { kind: 'turn'; heading: number }
  | { kind: 'fork'; height: number }
  | { kind: 'call'; fn: () => void };

interface Task {
  kind: 'store' | 'ship' | 'home';
  baleId: string;
}

export interface ForkliftSim extends Mover {
  fork: number;
  carrying: string | null;
  legs: Leg[];
  task: Task | null;
  queue: Task[];
  idleT: number;
  /** 화면 밖에 나가 있다 */
  away: boolean;
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
  x: number;
  /** 0이면 벨트 위, 0~1이면 투입구로 떨어지는 중 */
  drop: number;
  seed: number;
}

const TRUCK_SPEED = 2.6;
const TRUCK_REVERSE = 1.25;
const TRUCK_ACCEL = 2.2;
const FORK_SPEED = 2.3;
const FORK_REVERSE = 1.3;
const FORK_TURN = 2.6;
const FORK_LIFT = 0.55;
const WORKER_SPEED = 0.75;
export const BELT_SPEED = 0.7;
const TILT_RATE = 0.42;
const UNLOAD_SEC = 6.5;
const EJECT_SEC = 3.2;
const WHEEL_R = 0.26;
/** 처음 본 단계가 이 시간 안에 시작됐으면 들어오는 모습부터 보여 준다 (그보다 오래됐으면 있어야 할 자리에 바로 놓는다) */
const FRESH_MS = 8000;

const TRUCK_POOL = 4;
const BALE_POOL = 14;
const LUMP_POOL = 12;

const PATH_IN = roundedPath(TRUCK_IN);
const PATH_OUT = roundedPath(TRUCK_OUT);
const PATH_SCALE_EXIT = roundedPath(TRUCK_SCALE_TO_EXIT, 1.5);

const FACE_PLUS_Z = -Math.PI / 2;
export const FORK_REACH = 0.8;
const SLOT_STOP_Z = YARD.slotZ - FORK_REACH;
const CHUTE_STOP_Z = BALE_REST[2] - FORK_REACH;
/** 배출이 시작되는 자리(결속부 안) */
const EJECT_FROM_Z = BALER.strapZ + 0.3;

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

function mover(x: number, z: number, heading: number): Mover {
  return { x, z, heading, path: null, s: 0, reverse: false, speed: 0, waiting: false, wheel: 0 };
}

interface WorkerSpec {
  route?: P2[];
  at?: P2;
  heading?: number;
  pose: WorkerPose;
}

// 작업자의 자리와 순회 길. 차량이 다니는 길과 겹치지 않게 잡았다 (연출용, 서버 값이 아니다)
const WORKERS: WorkerSpec[] = [
  // 계중대 옆 검수원
  { at: [16.9, -7.0], heading: Math.PI * 0.75, pose: 'tablet' },
  // 정문 경비
  { at: [GATE.houseX - 0.9, GATE.houseZ - 0.1], heading: -Math.PI / 2 + 0.5, pose: 'stand' },
  // 본관 안 통로 순회
  { route: [[-0.6, -3.2], [-5.2, -3.2]], pose: 'walk' },
  // 압축기 조작반
  { at: [-5.75, -2.75], heading: Math.PI * 0.75, pose: 'tablet' },
  // 주차장 쪽 보도 → 사무동
  { route: [[13.75, -4.6], [13.75, 5.05], [10.2, 5.05]], pose: 'walk' },
  // 출하 마당 검수
  { at: [0.75, -4.7], heading: Math.PI, pose: 'tablet' },
  // 하역 마당 유도원
  { at: [5.3, -4.55], heading: 0.3, pose: 'wave' },
  // 사무동 앞
  { route: [[6.6, 5.05], [9.4, 5.05]], pose: 'walk' },
];

export class Director {
  /** 월드 시계(초). 끊긴 동안에는 흐르지 않는다 */
  t = 0;
  readonly trucks: TruckSim[] = [];
  readonly bales: BaleSim[] = [];
  readonly lumps: LumpSim[] = [];
  readonly workers: WorkerSim[] = [];
  readonly forklift: ForkliftSim;
  /** 섹터별 화면에 그릴 적재율 (서버 값으로 부드럽게 따라간다) */
  readonly fill: Record<TankId, number> = { 'tank-a1': 0, 'tank-a2': 0, 'tank-b1': 0, 'tank-b2': 0 };
  private readonly fillTarget: Record<TankId, number> = { 'tank-a1': 0, 'tank-a2': 0, 'tank-b1': 0, 'tank-b2': 0 };
  private fillSeen = false;
  beltOffset = 0;
  /** 램 위치 0(뒤)~1(끝까지 밂) */
  ram = 0;
  private ramPhase = 0;
  pressing = false;
  /** 투입구에 쌓인 정도 0~1 (컨베이어에서 떨어진 뭉치 수) */
  hopper = 0;
  gateIn = 0;
  gateOut = 0;
  conveyorRunning = false;
  private seq = 0;
  private lumpSeed = 0;
  private readonly slots: (string | null)[] = Array.from({ length: YARD.slotXs.length * 2 }, () => null);
  /** 이미 출하되어 다시 만들지 않을 베일 */
  private readonly shipped = new Set<string>();
  private readonly tmp: Pose = { x: 0, z: 0, heading: 0 };

  constructor() {
    for (let i = 0; i < TRUCK_POOL; i += 1) {
      this.trucks.push({ ...mover(0, 0, 0), active: false, id: '', seq: 0, phase: 'toScale', stage: 'arrived', bay: null, bedTilt: 0, load: 1, pouring: false, pourT: 0, variant: i });
    }
    for (let i = 0; i < BALE_POOL; i += 1) this.bales.push({ active: false, id: '', state: 'gone', x: 0, y: 0, z: 0, rot: 0, slot: -1, t: 0 });
    for (let i = 0; i < LUMP_POOL; i += 1) this.lumps.push({ active: false, x: 0, drop: 0, seed: i });
    this.forklift = { ...mover(YARD.home[0], YARD.home[1], Math.PI), fork: 0.3, carrying: null, legs: [], task: null, queue: [], idleT: 0, away: false };
    WORKERS.forEach((spec, i) => {
      const start = spec.route?.[0] ?? spec.at ?? [0, 0];
      const w: WorkerSim = { ...mover(start[0], start[1], spec.heading ?? 0), pose: spec.pose, dir: 1, pause: 1 + i * 0.7, stride: i, moving: false, look: 0 };
      if (spec.route) w.path = roundedPath(spec.route, 0.5);
      this.workers.push(w);
    });
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
      const truck = this.trucks.find((t) => t.active && t.id === v.id);
      if (truck) {
        truck.stage = v.stage;
        truck.bay = v.sectorId;
      } else if (v.stage !== 'departed') {
        this.spawnTruck(v, nowMs);
      }
    }

    for (const b of input.bales) {
      if (this.shipped.has(b.id)) continue;
      const bale = this.bales.find((x) => x.active && x.id === b.id);
      if (!bale) {
        if (b.stage === 'created') this.spawnBale(b, nowMs);
        else this.shipped.add(b.id);
      } else if (b.stage === 'shipped' && !this.hasTask('ship', b.id)) {
        this.forklift.queue.push({ kind: 'ship', baleId: b.id });
      }
    }
  }

  private spawnTruck(v: Vehicle, nowMs: number): void {
    const truck = this.trucks.find((t) => !t.active);
    if (!truck) return;
    this.seq += 1;
    Object.assign(truck, mover(SCALE.stopX, ROAD.inZ, Math.PI));
    truck.active = true;
    truck.id = v.id;
    truck.seq = this.seq;
    truck.stage = v.stage;
    truck.bay = v.sectorId;
    truck.bedTilt = 0;
    truck.load = 1;
    truck.pouring = false;
    truck.pourT = 0;
    truck.phase = 'atScale';
    if (v.stage === 'arrived' && nowMs - ms(v.stageTimes.arrived) < FRESH_MS) {
      truck.phase = 'toScale';
      truck.path = PATH_IN;
      samplePath(PATH_IN, 0, truck);
    } else if ((v.stage === 'unloading' || v.stage === 'unloaded') && v.sectorId) {
      truck.phase = 'atBay';
      truck.x = TRUCK.parkX;
      truck.z = bayCenterZ(v.sectorId);
      truck.heading = 0;
      truck.bedTilt = v.stage === 'unloading' ? 1 : 0;
      truck.load = v.stage === 'unloading' ? 0.5 : 0;
    }
  }

  private spawnBale(b: Bale, nowMs: number): void {
    const bale = this.bales.find((x) => !x.active);
    if (!bale) return;
    bale.active = true;
    bale.id = b.id;
    bale.t = 0;
    bale.rot = FACE_PLUS_Z;
    if (nowMs - ms(b.stageTimes.created) < FRESH_MS) {
      bale.state = 'ejecting';
      bale.slot = -1;
      bale.x = BALE_REST[0];
      bale.y = BALE_REST[1];
      bale.z = EJECT_FROM_Z;
      this.hopper = 0;
      this.forklift.queue.push({ kind: 'store', baleId: b.id });
    } else {
      this.placeInSlot(bale, this.freeSlot());
    }
  }

  private freeSlot(): number {
    const i = this.slots.indexOf(null);
    return i < 0 ? 0 : i;
  }

  private slotPos(slot: number): [number, number, number] {
    const n = YARD.slotXs.length;
    return [YARD.slotXs[slot % n] ?? 0, slot >= n ? BALE.h : 0, YARD.slotZ];
  }

  private placeInSlot(bale: BaleSim, slot: number): void {
    const [x, y, z] = this.slotPos(slot);
    this.slots[slot] = bale.id;
    bale.slot = slot;
    bale.state = 'stack';
    bale.x = x;
    bale.y = y;
    bale.z = z;
    bale.rot = FACE_PLUS_Z;
  }

  private hasTask(kind: Task['kind'], baleId: string): boolean {
    const f = this.forklift;
    return (f.task?.kind === kind && f.task.baleId === baleId) || f.queue.some((t) => t.kind === kind && t.baleId === baleId);
  }

  /** 로봇이 컨베이어 위에서 집게를 놓았다 (관절 값 스트림에서 알아낸 사실) */
  robotReleased(): void {
    const lump = this.lumps.find((l) => !l.active);
    if (!lump) return;
    this.lumpSeed += 1;
    lump.active = true;
    lump.x = CONVEYOR.startX - 0.45;
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
        lump.x -= BELT_SPEED * dt;
        if (lump.x <= CONVEYOR.endX + 0.05) lump.drop = 0.001;
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
    this.stepBales(dt);
    this.stepForklift(dt);
    this.stepWorkers(dt);

    let wantIn = 0;
    let wantOut = 0;
    for (const t of this.trucks) {
      if (!t.active || Math.abs(t.x - GATE.x) > 4.6) continue;
      if (t.phase === 'toScale') wantIn = 1;
      if (t.phase === 'leaving') wantOut = 1;
    }
    this.gateIn += (wantIn - this.gateIn) * Math.min(1, dt * 3.5);
    this.gateOut += (wantOut - this.gateOut) * Math.min(1, dt * 3.5);
  }

  // ── 비켜 가기 ───────────────────────────────────────────────────────

  private probeHits(a: Mover, aHalf: number, aR: number, b: Pose, bHalf: number, bR: number): boolean {
    const dir = a.reverse ? -1 : 1;
    const px = a.x + Math.cos(a.heading) * dir * (aHalf + 0.95);
    const pz = a.z - Math.sin(a.heading) * dir * (aHalf + 0.95);
    const min = aR + bR + 0.12;
    for (let k = -1; k <= 1; k += 2) {
      const bx = b.x + Math.cos(b.heading) * bHalf * 0.6 * k;
      const bz = b.z - Math.sin(b.heading) * bHalf * 0.6 * k;
      if (Math.hypot(px - bx, pz - bz) < min) return true;
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
    return false;
  }

  private nearVehicle(w: WorkerSim): boolean {
    const px = w.x + Math.cos(w.heading) * 0.7;
    const pz = w.z - Math.sin(w.heading) * 0.7;
    for (const t of this.trucks) if (t.active && Math.hypot(px - t.x, pz - t.z) < 2.3) return true;
    return Math.hypot(px - this.forklift.x, pz - this.forklift.z) < 1.7;
  }

  /** 경로를 따라 나아간다. 끝에 닿으면 true */
  private advance(m: Mover, dt: number, vmax: number, accel: number, blocked: boolean): boolean {
    const path = m.path;
    if (!path) return true;
    const remaining = path.total - m.s;
    const target = blocked ? 0 : Math.min(vmax, Math.sqrt(2 * accel * Math.max(remaining, 0)) + 0.1);
    const dv = target - m.speed;
    m.speed += Math.max(-accel * 2.2 * dt, Math.min(accel * dt, dv));
    m.waiting = blocked;
    const ds = Math.min(remaining, m.speed * dt);
    m.s += ds;
    m.wheel += (ds / WHEEL_R) * (m.reverse ? -1 : 1);
    samplePath(path, m.s, m, m.reverse);
    if (remaining - ds > 1e-3) return false;
    m.speed = 0;
    return true;
  }

  private follow(m: Mover, points: readonly P2[] | Path, reverse = false, radius = 1.7): void {
    m.path = 'pts' in points ? points : roundedPath(points, radius);
    m.s = 0;
    m.reverse = reverse;
  }

  // ── 트럭 ────────────────────────────────────────────────────────────

  private stepTrucks(dt: number): void {
    for (const t of this.trucks) {
      if (!t.active) continue;
      t.pouring = false;
      switch (t.phase) {
        case 'toScale':
          if (this.advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atScale';
            t.path = null;
          }
          break;
        case 'atScale':
          if (t.stage === 'departed') {
            t.phase = 'toExit';
            this.follow(t, PATH_SCALE_EXIT);
          } else if (t.stage !== 'arrived' && t.bay) {
            t.phase = 'toBay';
            this.follow(t, truckToBay(t.bay));
          }
          break;
        case 'toBay':
          if (this.advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t)) && t.bay) {
            t.phase = 'reversing';
            this.follow(t, truckReverse(t.bay), true);
          }
          break;
        case 'reversing':
          if (this.advance(t, dt, TRUCK_REVERSE, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atBay';
            t.path = null;
          }
          break;
        case 'atBay': {
          const want = t.stage === 'unloading' ? 1 : 0;
          t.bedTilt += Math.max(-TILT_RATE * dt, Math.min(TILT_RATE * dt, want - t.bedTilt));
          if (t.stage === 'unloading' && t.bedTilt > 0.55 && t.load > 0) {
            t.pouring = true;
            t.pourT += dt;
            t.load = Math.max(0, t.load - dt / UNLOAD_SEC);
          }
          if ((t.stage === 'unloaded' || t.stage === 'departed') && t.bedTilt < 0.02 && t.bay) {
            t.bedTilt = 0;
            t.load = 0;
            t.phase = 'toExit';
            this.follow(t, truckToExit(t.bay));
          }
          break;
        }
        case 'toExit':
          if (this.advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atExit';
            t.path = null;
          }
          break;
        case 'atExit':
          if (t.stage === 'departed') {
            t.phase = 'leaving';
            this.follow(t, PATH_OUT);
          }
          break;
        case 'leaving':
          if (this.advance(t, dt, TRUCK_SPEED * 1.15, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.active = false;
            t.path = null;
            t.id = '';
          }
          break;
      }
    }
  }

  // ── 베일 ────────────────────────────────────────────────────────────

  private stepBales(dt: number): void {
    const f = this.forklift;
    for (const b of this.bales) {
      if (!b.active) continue;
      if (b.state === 'ejecting') {
        b.t += dt / EJECT_SEC;
        const k = Math.min(1, b.t);
        const ease = k * k * (3 - 2 * k);
        b.z = EJECT_FROM_Z + (BALE_REST[2] - EJECT_FROM_Z) * ease;
        if (k >= 1) b.state = 'chute';
      } else if (b.state === 'carried') {
        b.x = f.x + Math.cos(f.heading) * FORK_REACH;
        b.z = f.z - Math.sin(f.heading) * FORK_REACH;
        b.y = f.fork;
        b.rot = f.heading;
      }
    }
  }

  // ── 지게차 ──────────────────────────────────────────────────────────

  private baleById(id: string): BaleSim | undefined {
    return this.bales.find((b) => b.active && b.id === id);
  }

  private approachLegs(x: number, stopZ: number): Leg[] {
    const f = this.forklift;
    const legs: Leg[] = [];
    if (Math.abs(f.x - x) > 0.05) {
      legs.push({ kind: 'turn', heading: x > f.x ? 0 : Math.PI }, { kind: 'drive', to: [x, YARD.laneZ], reverse: false });
    }
    legs.push({ kind: 'turn', heading: FACE_PLUS_Z }, { kind: 'drive', to: [x, stopZ], reverse: false });
    return legs;
  }

  /** 할 일을 동작 목록으로 푼다. 아직 시작할 수 없으면 null (기다린다), 할 것이 없으면 빈 목록 */
  private planTask(task: Task): Leg[] | null {
    const f = this.forklift;
    if (task.kind === 'home') {
      return [{ kind: 'turn', heading: YARD.home[0] > f.x ? 0 : Math.PI }, { kind: 'drive', to: YARD.home, reverse: false }, { kind: 'turn', heading: Math.PI }, { kind: 'fork', height: 0.3 }];
    }
    const bale = this.baleById(task.baleId);
    if (!bale) return [];
    if (task.kind === 'store') {
      if (bale.state !== 'chute') return bale.state === 'ejecting' ? null : [];
      const slot = this.freeSlot();
      const [sx, sy] = this.slotPos(slot);
      this.slots[slot] = bale.id;
      return [
        { kind: 'fork', height: BALE_REST[1] },
        ...this.approachLegs(BALE_REST[0], CHUTE_STOP_Z),
        {
          kind: 'call',
          fn: () => {
            bale.state = 'carried';
            f.carrying = bale.id;
          },
        },
        { kind: 'fork', height: BALE_REST[1] + 0.14 },
        { kind: 'drive', to: [BALE_REST[0], YARD.laneZ], reverse: true },
        { kind: 'fork', height: Math.max(0.3, sy + 0.12) },
        { kind: 'turn', heading: 0 },
        { kind: 'drive', to: [sx, YARD.laneZ], reverse: false },
        { kind: 'turn', heading: FACE_PLUS_Z },
        { kind: 'drive', to: [sx, SLOT_STOP_Z], reverse: false },
        { kind: 'fork', height: sy + 0.03 },
        {
          kind: 'call',
          fn: () => {
            this.placeInSlot(bale, slot);
            f.carrying = null;
          },
        },
        { kind: 'drive', to: [sx, YARD.laneZ], reverse: true },
        { kind: 'fork', height: 0.3 },
      ];
    }
    // 출하: 적치한 자리에서 꺼내 화면 밖으로 싣고 나간다
    if (bale.state !== 'stack') return bale.state === 'gone' ? [] : null;
    const [sx, sy] = this.slotPos(bale.slot);
    return [
      { kind: 'fork', height: sy + 0.03 },
      ...this.approachLegs(sx, SLOT_STOP_Z),
      {
        kind: 'call',
        fn: () => {
          this.slots[bale.slot] = null;
          bale.slot = -1;
          bale.state = 'carried';
          f.carrying = bale.id;
        },
      },
      { kind: 'fork', height: sy + 0.16 },
      { kind: 'drive', to: [sx, YARD.laneZ], reverse: true },
      { kind: 'fork', height: 0.3 },
      { kind: 'turn', heading: Math.PI },
      { kind: 'drive', to: [YARD.exitX, YARD.laneZ], reverse: false },
      {
        kind: 'call',
        fn: () => {
          bale.active = false;
          bale.state = 'gone';
          this.shipped.add(bale.id);
          f.carrying = null;
          f.away = true;
          f.heading = 0;
        },
      },
      { kind: 'drive', to: [YARD.minX + 3.2, YARD.laneZ], reverse: false },
      {
        kind: 'call',
        fn: () => {
          f.away = false;
        },
      },
    ];
  }

  private stepForklift(dt: number): void {
    const f = this.forklift;
    if (f.legs.length === 0) {
      f.task = null;
      const next = f.queue[0];
      if (next) {
        const legs = this.planTask(next);
        if (legs) {
          f.queue.shift();
          f.task = next;
          f.legs = legs;
          f.idleT = 0;
        }
      } else {
        f.idleT += dt;
        if (f.idleT > 2.5 && Math.hypot(f.x - YARD.home[0], f.z - YARD.home[1]) > 0.2) {
          f.task = { kind: 'home', baleId: '' };
          f.legs = this.planTask(f.task) ?? [];
        }
      }
    }
    const leg = f.legs[0];
    if (!leg) return;
    let done = false;
    switch (leg.kind) {
      case 'call':
        leg.fn();
        done = true;
        break;
      case 'fork': {
        const d = leg.height - f.fork;
        f.fork += Math.max(-FORK_LIFT * dt, Math.min(FORK_LIFT * dt, d));
        done = Math.abs(leg.height - f.fork) < 1e-3;
        break;
      }
      case 'turn': {
        const d = angleDelta(f.heading, leg.heading);
        const stepA = Math.max(-FORK_TURN * dt, Math.min(FORK_TURN * dt, d));
        f.heading += stepA;
        f.wheel += stepA * 0.6;
        done = Math.abs(d - stepA) < 1e-3;
        if (done) f.heading = leg.heading;
        break;
      }
      case 'drive':
        if (!f.path) this.follow(f, [[f.x, f.z], leg.to], leg.reverse, 0);
        if (this.advance(f, dt, leg.reverse ? FORK_REVERSE : FORK_SPEED, 2.4, false)) {
          f.path = null;
          done = true;
        }
        break;
    }
    if (done) f.legs.shift();
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
      out.y = kind === 'pin' ? 2.0 + t.bedTilt * 0.9 : 0.6;
      out.z = t.z;
      return true;
    }
    if (type === 'bale') {
      const b = this.baleById(id);
      if (!b) return false;
      out.x = b.x;
      out.y = b.y + (kind === 'pin' ? BALE.h + 0.55 : BALE.h / 2);
      out.z = b.z;
      return true;
    }
    if (type === 'forklift') {
      const f = this.forklift;
      if (f.away) return false;
      out.x = f.x;
      out.y = kind === 'pin' ? 2.0 : 0.6;
      out.z = f.z;
      return true;
    }
    return false;
  }

  /** 경로 표시용: 이 대상이 지금 따라가는 경로와 남은 구간의 시작 거리 */
  route(key: string): { path: Path; from: number } | null {
    if (key === 'forklift') return this.forklift.path && !this.forklift.away ? { path: this.forklift.path, from: this.forklift.s } : null;
    if (!key.startsWith('veh:')) return null;
    const t = this.trucks.find((x) => x.active && x.id === key.slice(4));
    return t?.path ? { path: t.path, from: t.s } : null;
  }
}
