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
  { name: '예시자원', sectorId: 'tank-a2', plate: '12가 3456' },
  { name: '예시페이퍼', sectorId: 'tank-b1', plate: '34다 7781' },
  { name: '예시리싸이클', sectorId: 'tank-a1', plate: '56마 2098' },
  { name: '예시환경', sectorId: 'tank-b2', plate: '78사 5127' },
];
const MIXES: Array<[TankId, number, TankId, number]> = [
  ['tank-a1', 40, 'tank-b1', 60],
  ['tank-a2', 50, 'tank-b2', 50],
  ['tank-b1', 30, 'tank-a2', 70],
];

const VEHICLE_EVERY = 40;
const VEHICLE_STEPS: Array<[Vehicle['stage'], number]> = [
  ['arrived', 0],
  ['identified', 6],
  ['unloading', 23],
  ['unloaded', 32],
  ['departed', 46],
];
const BATCH_EVERY = 52;
const BATCH_STEPS: Array<[Batch['stage'], number]> = [
  ['planned', 0],
  ['mixing', 3],
  ['compressing', 40],
  ['completed', 49],
];
const SHIP_AFTER = 26;
const KEEP = 12;

/** 시작 뒤 tSec초의 예시 상태 (시각만으로 정해진다) */
export function demoData(startMs: number, tSec: number): StudioData {
  const now = startMs + tSec * 1000;

  const vehicles: Vehicle[] = [];
  const firstVehicle = Math.max(-3, Math.floor(tSec / VEHICLE_EVERY) - KEEP);
  for (let n = firstVehicle; ; n += 1) {
    const age = tSec - 2 - n * VEHICLE_EVERY;
    if (age < 0) break;
    const company = COMPANIES[((n % COMPANIES.length) + COMPANIES.length) % COMPANIES.length]!;
    const born = now - age * 1000;
    const stageTimes: Vehicle['stageTimes'] = {};
    let stage: Vehicle['stage'] = 'arrived';
    let lastAt = 0;
    for (const [name, at] of VEHICLE_STEPS) {
      if (age >= at) {
        stage = name;
        lastAt = at;
        stageTimes[name] = iso(born + at * 1000);
      }
    }
    const known = stage !== 'arrived';
    vehicles.push({
      id: `ex-veh-${String(n + 100).padStart(3, '0')}`,
      stage,
      plate: known ? company.plate : null,
      companyName: known ? company.name : null,
      sectorId: known ? company.sectorId : null,
      stageTimes,
      updatedAt: iso(born + lastAt * 1000),
    });
  }

  const batches: Batch[] = [];
  const bales: Bale[] = [];
  let pressing: Batch | null = null;
  let pressAge = 0;
  const firstBatch = Math.max(-4, Math.floor(tSec / BATCH_EVERY) - KEEP);
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
      const shipped = age >= 49 + SHIP_AFTER;
      bales.push({
        id: `ex-BL-${seq}`,
        batchId: batch.id,
        stage: shipped ? 'shipped' : 'created',
        stageTimes: shipped ? { created: iso(created), shipped: iso(created + SHIP_AFTER * 1000) } : { created: iso(created) },
        updatedAt: iso(shipped ? created + SHIP_AFTER * 1000 : created),
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
      moisturePercent: round1(11 + (id.charCodeAt(6) % 4) * 0.5),
      cautionThresholdPercent: 80,
      updatedAt: iso(now),
    };
  };
  const pose = demoPose(tSec);
  const devices: Partial<Record<DeviceId, DeviceState>> = {
    'tank-a1': tank('tank-a1', 'A1', 62, 37),
    'tank-a2': tank('tank-a2', 'A2', 48, 53),
    'tank-b1': tank('tank-b1', 'B1', 40, 61),
    'tank-b2': tank('tank-b2', 'B2', 66, 43),
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
  const data = useMemo(() => demoData(startMs, tick), [startMs, tick]);
  return { data, startMs, lastReceivedAt };
}
