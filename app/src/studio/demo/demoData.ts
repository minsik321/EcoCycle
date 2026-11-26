import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bale, Batch, DeviceId, DeviceState, TankId, TankSection, Vehicle } from '@ecocycle/shared';
import { demoPose } from '../robot/jointSource';
import type { StudioData } from '../types';

// /scene-demo 용 예시 원본. 서버·로그인 없이 스튜디오를 보여 주고 프레임을 재기 위한 것이다.
// 여기서 나오는 회사·번호판·배합비·압력·수분은 전부 "예시 데이터"이고 화면에 그렇게 표시한다.
// 실제 화면(홈)은 이 파일을 쓰지 않고 store 값만 쓴다.

const iso = (ms: number) => new Date(ms).toISOString();
const round1 = (n: number) => Math.round(n * 10) / 10;

const COMPANIES: Array<{ name: string; sectorId: TankId; plate: string }> = [
  { name: '예시자원', sectorId: 'sector-a', plate: '12가 3456' },
  { name: '예시페이퍼', sectorId: 'sector-c', plate: '34다 7781' },
  { name: '예시리싸이클', sectorId: 'sector-a', plate: '56마 2098' },
  { name: '예시환경', sectorId: 'sector-c', plate: '78사 5127' },
];
const MIXES: Array<[TankId, number, TankId, number]> = [
  ['sector-a', 40, 'sector-c', 60],
  ['sector-a', 50, 'sector-c', 50],
  ['sector-c', 30, 'sector-a', 70],
];

const BUYERS: Array<{ name: string; plate: string }> = [
  { name: '예시제지', plate: '82바 1047' },
  { name: '예시판지', plate: '64사 5512' },
];

const VEHICLE_EVERY = 80;
/** 입고: 하역 뒤 바로 나가지 않고 출차 계근(weighing_out)을 거친다 */
const VEHICLE_STEPS: Array<[Vehicle['stage'], number]> = [
  ['arrived', 0],
  ['identified', 6],
  ['unloading', 32],
  ['unloaded', 42],
  ['weighing_out', 48],
  ['departed', 80],
];
/** 상차 차량: 네 번째 차마다. 상차 자리에서 LOAD_EACH초마다 적치 베일 하나를 싣는다(최대 LOAD_MAX) */
const OUTBOUND_EVERY = 4;
const LOAD_START = 34;
const LOAD_EACH = 14;
const LOAD_MAX = 4;
const OUTBOUND_STEPS: Array<[Vehicle['stage'], number]> = [
  ['arrived', 0],
  ['identified', 6],
  ['loading', LOAD_START],
  ['loaded', LOAD_START + LOAD_EACH * LOAD_MAX],
  ['weighing_out', LOAD_START + LOAD_EACH * LOAD_MAX + 16],
  ['departed', LOAD_START + LOAD_EACH * LOAD_MAX + 56],
];
const isOutbound = (n: number): boolean => ((n % OUTBOUND_EVERY) + OUTBOUND_EVERY) % OUTBOUND_EVERY === OUTBOUND_EVERY - 1;
const BATCH_EVERY = 52;
const BATCH_STEPS: Array<[Batch['stage'], number]> = [
  ['planned', 0],
  ['mixing', 3],
  ['compressing', 40],
  ['completed', 49],
];
const KEEP = 12;
const FIRST_BATCH = -4;

/**
 * 상차 일정: 상차 차량이 실은 베일 (시각만으로 정해진다). 상차 시각마다 그때 적치된(만들어진) 가장 오래된 베일을 하나 싣는다.
 * 돌려주는 값: 베일 번호 → [차량 번호, 실은 시각(초)]
 */
function loadSchedule(tSec: number): Map<number, [number, number]> {
  const out = new Map<number, [number, number]>();
  let bale = FIRST_BATCH;
  const lastVehicle = Math.floor((tSec - 2) / VEHICLE_EVERY);
  for (let n = -3; n <= lastVehicle; n += 1) {
    if (!isOutbound(n)) continue;
    for (let i = 0; i < LOAD_MAX; i += 1) {
      const at = 2 + n * VEHICLE_EVERY + LOAD_START + i * LOAD_EACH;
      if (at > tSec) break;
      if (bale * BATCH_EVERY + 49 <= at) {
        out.set(bale, [n, at]);
        bale += 1;
      }
    }
  }
  return out;
}

/** 시작 뒤 tSec초의 예시 상태 (시각만으로 정해진다) */
export function demoData(startMs: number, tSec: number): StudioData {
  const now = startMs + tSec * 1000;

  const schedule = loadSchedule(tSec);
  const loadedBy = new Map<number, string[]>();
  for (const [b, [n, at]] of schedule) {
    if (at > tSec) continue;
    const list = loadedBy.get(n) ?? [];
    list.push(`ex-BL-${String(b + 500).padStart(4, '0')}`);
    loadedBy.set(n, list);
  }
  const vehicleId = (n: number) => `ex-veh-${String(n + 100).padStart(3, '0')}`;

  const vehicles: Vehicle[] = [];
  const firstVehicle = Math.max(-3, Math.floor(tSec / VEHICLE_EVERY) - KEEP);
  for (let n = firstVehicle; ; n += 1) {
    const age = tSec - 2 - n * VEHICLE_EVERY;
    if (age < 0) break;
    const outbound = isOutbound(n);
    const company = COMPANIES[((n % COMPANIES.length) + COMPANIES.length) % COMPANIES.length]!;
    const buyer = BUYERS[((Math.floor(n / OUTBOUND_EVERY) % BUYERS.length) + BUYERS.length) % BUYERS.length]!;
    const born = now - age * 1000;
    const stageTimes: Vehicle['stageTimes'] = {};
    let stage: Vehicle['stage'] = 'arrived';
    let lastAt = 0;
    for (const [name, at] of outbound ? OUTBOUND_STEPS : VEHICLE_STEPS) {
      if (age >= at) {
        stage = name;
        lastAt = at;
        stageTimes[name] = iso(born + at * 1000);
      }
    }
    const known = stage !== 'arrived';
    vehicles.push({
      id: vehicleId(n),
      kind: outbound ? 'outbound' : 'inbound',
      baleIds: outbound ? (loadedBy.get(n) ?? []) : [],
      stage,
      plate: known ? (outbound ? buyer.plate : company.plate) : null,
      companyName: known ? (outbound ? buyer.name : company.name) : null,
      sectorId: known && !outbound ? company.sectorId : null,
      stageTimes,
      updatedAt: iso(born + lastAt * 1000),
    });
  }

  const batches: Batch[] = [];
  const bales: Bale[] = [];
  let pressing: Batch | null = null;
  let pressAge = 0;
  const firstBatch = Math.max(FIRST_BATCH, Math.floor(tSec / BATCH_EVERY) - KEEP);
  for (let n = firstBatch; ; n += 1) {
    const age = tSec - n * BATCH_EVERY;
    if (age < 0) break;
    const mix = MIXES[((n % MIXES.length) + MIXES.length) % MIXES.length]!;
    const born = now - age * 1000;
    const stageTimes: Batch['stageTimes'] = {};
    let stage: Batch['stage'] = 'planned';
    let lastAt = 0;
    for (const [name, at] of BATCH_STEPS) {
      if (age >= at) {
        stage = name;
        lastAt = at;
        stageTimes[name] = iso(born + at * 1000);
      }
    }
    const seq = String(n + 500).padStart(4, '0');
    const batch: Batch = {
      id: `ex-batch-${seq}`,
      stage,
      mix: [
        { sectorId: mix[0], percent: mix[1] },
        { sectorId: mix[2], percent: mix[3] },
      ],
      actualMix: null,
      pinning: null,
      pinChanges: [],
      avgMoisturePercent: round1(10.6 + (((n % 5) + 5) % 5) * 0.4),
      targetPressureMpa: round1(27.4 + (((n % 4) + 4) % 4) * 0.7),
      stageTimes,
      updatedAt: iso(born + lastAt * 1000),
    };
    batches.push(batch);
    if (stage === 'compressing') {
      pressing = batch;
      pressAge = age - 40;
    }
    if (stage === 'completed') {
      const created = born + 49_000;
      // 출하는 상차 차량에 실린 때다 (상차 일정)
      const load = schedule.get(n);
      const shippedAt = load ? startMs + load[1] * 1000 : null;
      bales.push({
        id: `ex-BL-${seq}`,
        batchId: batch.id,
        stage: shippedAt !== null ? 'shipped' : 'created',
        vehicleId: load ? vehicleId(load[0]) : null,
        stageTimes: shippedAt !== null ? { created: iso(created), shipped: iso(shippedAt) } : { created: iso(created) },
        updatedAt: iso(shippedAt ?? created),
      });
    }
  }

  const tank = (id: TankId, section: TankSection, base: number, speed: number): DeviceState => {
    const fill = round1(base + 20 * Math.sin(tSec / speed));
    return {
      id,
      type: 'tank',
      section,
      grade: section.startsWith('A') ? 'A' : 'C',
      status: fill >= 95 ? 'alarm' : fill >= 80 ? 'caution' : 'normal',
      fillPercent: fill,
      volumeM3: round1(fill * 0.08),
      capacityM3: 8,
      moisturePercent: round1(11 + (id.charCodeAt(7) % 4) * 0.5),
      cautionThresholdPercent: 80,
      updatedAt: iso(now),
    };
  };
  const pose = demoPose(tSec);
  const devices: Partial<Record<DeviceId, DeviceState>> = {
    'sector-a': tank('sector-a', 'A', 62, 37),
    'sector-c': tank('sector-c', 'C', 48, 53),
    'robot-1': { id: 'robot-1', type: 'robot', status: 'running', mode: 'auto', pinnedSectors: [], pickRecordsRevision: 0, phase: pose.phase, targetTankId: pose.targetTankId, heldSectorId: pose.gripper.holding ? pose.targetTankId : null, gripper: pose.gripper, updatedAt: iso(now) },
    'conveyor-z': { id: 'conveyor-z', type: 'conveyor', status: 'normal', running: true, loadPercent: 50, itemsToBaler: 2, updatedAt: iso(now) },
    'compressor-1': {
      id: 'compressor-1',
      type: 'compressor',
      status: 'normal',
      running: true,
      pressureMpa: pressing ? round1(pressing.targetPressureMpa * (1 - Math.exp(-pressAge / 2.2))) : 0.4,
      temperatureC: round1(41.5 + Math.sin(tSec / 20) * 1.2),
      cycleStage: pressing ? 'pressing' : 'idle',
      updatedAt: iso(now),
    },
  };

  const done = Math.floor(tSec / BATCH_EVERY);
  const trend = (base: number, swing: number, k: number) => Array.from({ length: 24 }, (_, i) => round1(base + Math.sin(i / k) * swing + (i % 3) * swing * 0.12));
  return {
    devices,
    summary: { averageMoisturePercent: 11.4, totalFillPercent: 54.0, balesToday: 38 + done, compressorUptimePercent: 92.5, status: 'normal', updatedAt: iso(now) },
    vehicles: vehicles.slice(-KEEP),
    batches: batches.slice(-KEEP),
    bales: bales.slice(-KEEP),
    alarms: [],
    trends: {
      balesToday: Array.from({ length: 24 }, (_, i) => Math.round(((38 + done) * (i + 1)) / 24)),
      averageMoisturePercent: trend(11.4, 0.6, 3.1),
      compressorUptimePercent: trend(91, 3, 4.3),
    },
  };
}

/** 1초에 한 번 예시 상태를 새로 만든다. 끊김을 흉내 내는 동안에는 값이 멈춘다 */
/** 측정용 고정 데이터를 넣어 두는 세션 저장소 키 (주소에 ?snapshot이 있을 때만 읽는다) */
export const DEMO_SNAPSHOT_KEY = 'ecocycle.demoSnapshot';

/**
 * 측정용(`/scene-demo?snapshot`): 측정 스크립트가 세션 저장소에 넣은 고정 데이터(같은 차량·베일·배치)를 쓴다.
 * 서로 다른 코드(예: 기준 브랜치와 지금)를 같은 부하로 견줄 때만 쓴다. 화면 값은 여전히 "예시 데이터"다
 */
function snapshotFromSession(): StudioData | null {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('snapshot')) return null;
  const raw = sessionStorage.getItem(DEMO_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudioData;
  } catch {
    return null;
  }
}

const resend = (s: StudioData): StudioData => ({
  ...s,
  devices: { ...s.devices },
  vehicles: s.vehicles.map((v) => ({ ...v })),
  batches: s.batches.map((b) => ({ ...b })),
  bales: s.bales.map((b) => ({ ...b })),
  alarms: [...s.alarms],
});

export function useDemoData(disconnected: boolean): { data: StudioData; startMs: number; lastReceivedAt: string } {
  const startMs = useRef(Date.now()).current;
  const [tick, setTick] = useState(0);
  const [lastReceivedAt, setLast] = useState(() => iso(Date.now()));
  useEffect(() => {
    if (disconnected) return;
    const timer = setInterval(() => {
      setTick(Math.floor((Date.now() - startMs) / 1000));
      setLast(iso(Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [disconnected, startMs]);
  const snapshot = useRef(snapshotFromSession()).current;
  // (고정 데이터도 매초 새로 받은 것처럼 새 배열로 준다: 서버가 다시 보낸 값과 같은 일을 시킨다)
  const data = useMemo(() => (snapshot ? resend(snapshot) : demoData(startMs, tick)), [snapshot, startMs, tick]);
  return { data, startMs, lastReceivedAt };
}
