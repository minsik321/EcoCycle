import type {
  Alarm,
  CompressorState,
  ConveyorState,
  DeviceId,
  DeviceState,
  DeviceStatus,
  PlantSummary,
  RobotState,
  TankState,
} from '@ecocycle/shared';
import { SETTING_DEFS } from '../fixtures/settings';

// 현재 값 저장소. 값은 sim/ 의 시뮬레이터가 바꾸고, routes/ 와 stream 은 여기서 읽는다.

const nowIso = () => new Date().toISOString();

/**
 * 탱크 상태 판정. 이상 기준은 서버 설정이다(실서버에서는 서버가 정한다).
 * 모의 서버의 임시 기준: 적재율 80% 이상 caution, 95% 이상 alarm.
 */
export function judgeTankStatus(fillPercent: number, cautionThresholdPercent = 80): DeviceStatus {
  if (fillPercent >= 95) return 'alarm';
  if (fillPercent >= cautionThresholdPercent) return 'caution';
  return 'normal';
}

// update_setting으로 바뀐 값. 없으면 SETTING_DEFS의 기본값을 쓴다.
const settings = new Map<string, number>();

export function getSetting(deviceId: DeviceId, key: string): number {
  const stored = settings.get(`${deviceId}.${key}`);
  if (stored !== undefined) return stored;
  const type = deviceId.split('-')[0] as DeviceState['type'];
  return SETTING_DEFS[type].find((d) => d.key === key)?.default ?? 0;
}

export function setSetting(deviceId: DeviceId, key: string, value: number): void {
  settings.set(`${deviceId}.${key}`, value);
}

function tank(
  id: TankState['id'],
  section: TankState['section'],
  grade: TankState['grade'],
  fill: number,
  moisture: number,
): TankState {
  const capacityM3 = 8.0;
  return {
    id,
    type: 'tank',
    section,
    grade,
    status: judgeTankStatus(fill),
    fillPercent: fill,
    volumeM3: Math.round(((capacityM3 * fill) / 100) * 10) / 10,
    capacityM3,
    moisturePercent: moisture,
    cautionThresholdPercent: 80,
    updatedAt: nowIso(),
  };
}

export const devices: Record<DeviceId, DeviceState> = {
  'tank-a1': tank('tank-a1', 'A1', 'A', 62.4, 11.8),
  'tank-a2': tank('tank-a2', 'A2', 'A', 45.0, 10.2),
  'tank-b1': tank('tank-b1', 'B1', 'C', 30.5, 12.6),
  'tank-b2': tank('tank-b2', 'B2', 'C', 58.8, 9.7),
  'robot-1': {
    id: 'robot-1',
    type: 'robot',
    status: 'running',
    mode: 'auto',
    phase: 'idle',
    targetTankId: null,
    gripper: { closed: false, holding: false },
    updatedAt: nowIso(),
  } satisfies RobotState,
  'conveyor-z': {
    id: 'conveyor-z',
    type: 'conveyor',
    status: 'normal',
    running: true,
    loadPercent: 40,
    updatedAt: nowIso(),
  } satisfies ConveyorState,
  'compressor-1': {
    id: 'compressor-1',
    type: 'compressor',
    status: 'normal',
    running: true,
    pressureMpa: 28.7,
    temperatureC: 42.3,
    updatedAt: nowIso(),
  } satisfies CompressorState,
};

/** 오늘 처리량과 압축기 가동 시간. 가동률은 서버가 집계해 보내는 값이다 (시작 값은 예시) */
export const production = { balesToday: 411, runSec: 6 * 3600 * 0.92, totalSec: 6 * 3600 };

/** 압축 중인 배치의 목표 압력. 압축 중이 아니면 null (sim/process가 정하고 sim/plant가 압력에 반영한다) */
export const press: { targetMpa: number | null } = { targetMpa: null };

export const alarms: Alarm[] = [
  {
    id: 'al-3290',
    level: 'caution',
    deviceId: 'tank-b2',
    message: '적재율 80% 초과',
    state: 'cleared',
    ts: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: 'al-3295',
    level: 'alarm',
    deviceId: 'compressor-1',
    message: '온도 상승',
    state: 'cleared',
    ts: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
];

export const listDevices = (): DeviceState[] => Object.values(devices);

export function isDeviceId(value: string): value is DeviceId {
  return Object.prototype.hasOwnProperty.call(devices, value);
}

/** 시스템 상태: 하나라도 alarm이면 alarm, 다음으로 offline, caution, normal 순으로 가장 심한 값 */
function worst(statuses: DeviceStatus[]): DeviceStatus {
  for (const s of ['alarm', 'offline', 'caution'] as const) {
    if (statuses.includes(s)) return s;
  }
  return 'normal';
}

export function summarize(): PlantSummary {
  const tanks = listDevices().filter((d): d is TankState => d.type === 'tank');
  const totalCapacity = tanks.reduce((sum, t) => sum + t.capacityM3, 0);
  const totalVolume = tanks.reduce((sum, t) => sum + t.volumeM3, 0);
  const robot = devices['robot-1'] as RobotState;
  const robotStatus: DeviceStatus =
    robot.status === 'error' ? 'alarm' : robot.status === 'offline' ? 'offline' : 'normal';
  const statuses = [
    ...tanks.map((t) => t.status),
    devices['conveyor-z'].status as DeviceStatus,
    devices['compressor-1'].status as DeviceStatus,
    robotStatus,
  ];
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    averageMoisturePercent: round1(tanks.reduce((s, t) => s + t.moisturePercent, 0) / tanks.length),
    totalFillPercent: round1((totalVolume / totalCapacity) * 100),
    balesToday: production.balesToday,
    compressorUptimePercent: round1((production.runSec / production.totalSec) * 100),
    status: worst(statuses),
    updatedAt: nowIso(),
  };
}
