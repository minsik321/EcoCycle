import { TANK_IDS } from '@ecocycle/shared';
import type { Bale, Batch, DeviceId, DeviceState, TankId, Vehicle, VehicleStage } from '@ecocycle/shared';
import {
  BALE,
  CONVEYOR,
  GATE,
  ROAD,
  SCALE,
  TRUCK,
  TRUCK_IN,
  TRUCK_OUT,
  TRUCK_SCALE_TO_EXIT,
  bayCenterZ,
  deviceCenter,
  devicePin,
  truckReverse,
  truckToBay,
  truckToExit,
} from '../world/layout';
import { FRESH_MS, advance, follow, mover } from './mover';
import type { Mover } from './mover';
import { angleDelta, roundedPath, samplePath } from './paths';
import type { P2, Path, Pose } from './paths';
import { Yard } from './yard';
import type { BaleSim, ForkliftSim } from './yard';

export type { BaleSim, BaleState, ForkliftSim } from './yard';

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
const WORKER_SPEED = 0.75;
export const BELT_SPEED = 0.7;
const TILT_RATE = 0.42;
const UNLOAD_SEC = 6.5;

const TRUCK_POOL = 4;
const LUMP_POOL = 12;

const PATH_IN = roundedPath(TRUCK_IN);
const PATH_OUT = roundedPath(TRUCK_OUT);
const PATH_SCALE_EXIT = roundedPath(TRUCK_SCALE_TO_EXIT, 1.5);

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

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
  { at: [3.6, -4.7], heading: Math.PI, pose: 'tablet' },
  // 하역 마당 유도원
  { at: [5.3, -4.55], heading: 0.3, pose: 'wave' },
  // 사무동 앞
  { route: [[6.6, 5.05], [9.4, 5.05]], pose: 'walk' },
];

export class Director {
  /** 출하 마당의 베일·지게차 (그리는 쪽이 읽는다) */
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
  readonly trucks: TruckSim[] = [];
  /** 출하 마당: 베일·지게차·칸 */
  readonly yard = new Yard();
  readonly lumps: LumpSim[] = [];
  readonly workers: WorkerSim[] = [];
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
  private readonly tmp: Pose = { x: 0, z: 0, heading: 0 };

  constructor() {
    for (let i = 0; i < TRUCK_POOL; i += 1) {
      this.trucks.push({ ...mover(0, 0, 0), active: false, id: '', seq: 0, phase: 'toScale', stage: 'arrived', bay: null, bedTilt: 0, load: 1, pouring: false, pourT: 0, variant: i, company: null });
    }
    for (let i = 0; i < LUMP_POOL; i += 1) this.lumps.push({ active: false, x: 0, drop: 0, seed: i });
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
        truck.company = v.companyName;
      } else if (v.stage !== 'departed') {
        this.spawnTruck(v, nowMs);
      }
    }

    this.yard.sync(input.bales, nowMs);
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
    truck.company = v.companyName;
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
    this.yard.step(dt, this.trucks);
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
      if (l.active) k += (l.x + l.drop * 3) * (i + 31);
    });
    this.workers.forEach((w, i) => {
      if (w.moving) k += (w.x * 1.7 + w.z * 2.1 + w.heading) * (i + 51);
    });
    return k;
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
    for (const f of this.yard.forklifts) if (!f.away && Math.hypot(px - f.x, pz - f.z) < 1.7) return true;
    return false;
  }

  // ── 트럭 ────────────────────────────────────────────────────────────

  private stepTrucks(dt: number): void {
    for (const t of this.trucks) {
      if (!t.active) continue;
      t.pouring = false;
      switch (t.phase) {
        case 'toScale':
          if (advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atScale';
            t.path = null;
          }
          break;
        case 'atScale':
          if (t.stage === 'departed') {
            t.phase = 'toExit';
            follow(t, PATH_SCALE_EXIT);
          } else if (t.stage !== 'arrived' && t.bay) {
            t.phase = 'toBay';
            follow(t, truckToBay(t.bay));
          }
          break;
        case 'toBay':
          if (advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t)) && t.bay) {
            t.phase = 'reversing';
            follow(t, truckReverse(t.bay), true);
          }
          break;
        case 'reversing':
          if (advance(t, dt, TRUCK_REVERSE, TRUCK_ACCEL, this.truckBlocked(t))) {
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
            follow(t, truckToExit(t.bay));
          }
          break;
        }
        case 'toExit':
          if (advance(t, dt, TRUCK_SPEED, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.phase = 'atExit';
            t.path = null;
          }
          break;
        case 'atExit':
          if (t.stage === 'departed') {
            t.phase = 'leaving';
            follow(t, PATH_OUT);
          }
          break;
        case 'leaving':
          if (advance(t, dt, TRUCK_SPEED * 1.15, TRUCK_ACCEL, this.truckBlocked(t))) {
            t.active = false;
            t.path = null;
            t.id = '';
          }
          break;
      }
    }
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
      const b = this.yard.baleById(id);
      if (!b) return false;
      out.x = b.x;
      out.y = b.y + (kind === 'pin' ? BALE.h + 0.55 : BALE.h / 2);
      out.z = b.z;
      return true;
    }
    if (type === 'forklift') {
      const f = this.yard.forklift(key);
      if (!f || f.away) return false;
      out.x = f.x;
      out.y = kind === 'pin' ? 2.0 : 0.6;
      out.z = f.z;
      return true;
    }
    return false;
  }

  /** 선택 상자용: 대상이 바라보는 방향(라디안). 방향이 없는 대상(기기)은 0 */
  heading(key: string): number {
    if (key.startsWith('forklift')) return this.yard.forklift(key)?.heading ?? 0;
    if (key.startsWith('veh:')) return this.trucks.find((x) => x.active && x.id === key.slice(4))?.heading ?? 0;
    if (key.startsWith('bale:')) return this.yard.baleById(key.slice(5))?.rot ?? 0;
    return 0;
  }

  /** 경로 표시용: 이 대상이 지금 따라가는 경로와 남은 구간의 시작 거리 */
  route(key: string): { path: Path; from: number } | null {
    if (key.startsWith('forklift')) {
      const f = this.yard.forklift(key);
      return f?.path && !f.away ? { path: f.path, from: f.s } : null;
    }
    if (!key.startsWith('veh:')) return null;
    const t = this.trucks.find((x) => x.active && x.id === key.slice(4));
    return t?.path ? { path: t.path, from: t.s } : null;
  }
}
