import type { Alarm, CompressorState, ConveyorState, DeviceStatus, TankId, TankState } from '@ecocycle/shared';
import { TANK_IDS } from '@ecocycle/shared';
import { publish } from './bus';
import { publishDevice, publishSummary } from './publish';
import { alarms, devices, judgeTankStatus } from './state';

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

const tank = (id: TankId) => devices[id] as TankState;
const conveyor = () => devices['conveyor-z'] as ConveyorState;
const compressor = () => devices['compressor-1'] as CompressorState;

// 화면에 보이는 값은 소수 첫째 자리로 반올림하지만, 계산은 원래 값으로 해야 작은 변화가 사라지지 않는다.
const fillRaw = new Map<TankId, number>(TANK_IDS.map((id) => [id, tank(id).fillPercent]));
const moistureRaw = new Map<TankId, number>(TANK_IDS.map((id) => [id, tank(id).moisturePercent]));
let loadRaw = conveyor().loadPercent;

/** 탱크에서 파지를 집어 갔을 때 (로봇 시뮬레이터가 호출) */
export function removeFromTank(id: TankId, percent: number): void {
  fillRaw.set(id, clamp((fillRaw.get(id) ?? 0) - percent, 0, 100));
}

/** 컨베이어에 파지를 올렸을 때 (로봇 시뮬레이터가 호출) */
export function addToConveyor(percent: number): void {
  loadRaw = clamp(loadRaw + percent, 0, 100);
}

let alarmSeq = 3300;

function nextAlarmId(): string {
  alarmSeq += 1;
  return `al-${alarmSeq}`;
}

/** 탱크 상태가 caution/alarm이면 알람을 열고, normal로 돌아오면 해제한다. */
function syncTankAlarm(t: TankState): void {
  const active = alarms.find((a) => a.deviceId === t.id && a.state === 'active');
  if (t.status === 'caution' || t.status === 'alarm') {
    if (active) return;
    const alarm: Alarm = {
      id: nextAlarmId(),
      level: t.status,
      deviceId: t.id,
      message: t.status === 'alarm' ? '적재율 95% 초과' : '적재율 80% 초과',
      state: 'active',
      ts: new Date().toISOString(),
    };
    alarms.push(alarm);
    publish({ type: 'alarm', alarm: { ...alarm } });
  } else if (active) {
    active.state = 'cleared';
    active.ts = new Date().toISOString();
    publish({ type: 'alarm', alarm: { ...active } });
  }
}

/** 1초마다: 탱크 적재·수분 변화, 컨베이어 적재, 압축기 압력·온도 */
export function tickPlant(): void {
  for (const id of TANK_IDS) {
    const t = tank(id);
    // 파지가 천천히 들어온다 (초당 약 0.02%)
    const fill = clamp((fillRaw.get(id) ?? 0) + rnd(0.005, 0.035), 0, 100);
    fillRaw.set(id, fill);
    const moisture = clamp((moistureRaw.get(id) ?? 10) + rnd(-0.05, 0.05), 6, 16);
    moistureRaw.set(id, moisture);

    t.fillPercent = round1(fill);
    t.volumeM3 = round1((t.capacityM3 * fill) / 100);
    t.moisturePercent = round1(moisture);
    const status: DeviceStatus = judgeTankStatus(t.fillPercent);
    t.status = status;
    syncTankAlarm(t);
    publishDevice(t);
  }

  const c = conveyor();
  if (c.running) loadRaw = clamp(loadRaw + (35 - loadRaw) * 0.05 + rnd(-0.5, 0.5), 0, 100);
  c.loadPercent = Math.round(loadRaw);
  publishDevice(c);

  const comp = compressor();
  if (comp.running) {
    const t = Date.now() / 1000;
    comp.pressureMpa = round1(28.7 + Math.sin(t / 20) * 0.6 + rnd(-0.1, 0.1));
    comp.temperatureC = round1(42.3 + Math.sin(t / 45) * 2 + rnd(-0.1, 0.1));
  }
  publishDevice(comp);

  publishSummary();
}
