import type { Bale, BaleStage, Batch, BatchStage, DeviceState, DeviceStatus, Vehicle, VehicleStage } from '@ecocycle/shared';
import { PHASE_STEPS, ROBOT_STATUS_TEXT, ROBOT_STATUS_TONE, STATUS_TEXT, formatPercent, formatPressureMpa } from '../../config/display';
import { SECTOR_LABEL } from '../world/layout';
import type { StudioData } from '../types';

// 스튜디오 패널의 문구와 "공정 추적" 계산. 서버가 준 stage를 여섯 단계 칸에 옮겨 적을 뿐, 값을 만들지 않는다.

export const VEHICLE_STAGE_TEXT: Record<VehicleStage, string> = {
  arrived: '계량 중',
  identified: '인식 완료',
  unloading: '하역 중',
  unloaded: '하역 완료',
  departed: '출차',
};

export const BATCH_STAGE_TEXT: Record<BatchStage, string> = {
  planned: '계획',
  mixing: '배합 중',
  compressing: '압축 중',
  completed: '완료',
};

export const BALE_STAGE_TEXT: Record<BaleStage, string> = {
  created: '적치',
  shipped: '출하',
};

export const mixText = (batch: Batch): string => batch.mix.map((m) => `${SECTOR_LABEL[m.sectorId]} ${m.percent}`).join(' : ');

/** 베일·배치 ID의 끝 번호만 (표에서 좁게 보여 줄 때) */
export const shortId = (id: string): string => `#${id.split('-').pop() ?? id}`;

const latest = <T extends { updatedAt: string }>(list: readonly T[], test: (item: T) => boolean): T | undefined => {
  let found: T | undefined;
  for (const item of list) if (test(item) && (!found || item.updatedAt >= found.updatedAt)) found = item;
  return found;
};

export interface CycleStep {
  key: 'inbound' | 'identify' | 'unload' | 'mix' | 'press' | 'ship';
  label: string;
  /** 지금 이 단계에 있는 대상이 있다 */
  active: boolean;
  /** 대상 한 줄 (번호판, 배합비, 목표 압력 등 서버 값). 없으면 null */
  detail: string | null;
  /** 이 단계에 들어선 시각 (서버 값) */
  at: string | null;
  /** 누르면 고를 대상 */
  select: string | null;
}

/** 입고 → 차량 인식 → 하역 → 배합 → 압축 → 출하. 각 칸에는 그 단계에 가장 최근 들어선 대상을 적는다 */
export function cycleSteps(data: Pick<StudioData, 'vehicles' | 'batches' | 'bales'>): CycleStep[] {
  const { vehicles, batches, bales } = data;
  const arrivedNow = latest(vehicles, (v) => v.stage === 'arrived');
  const arrivedLast = arrivedNow ?? latest(vehicles, (v) => !!v.stageTimes.arrived);
  const identNow = latest(vehicles, (v) => v.stage === 'identified');
  const identLast = identNow ?? latest(vehicles, (v) => !!v.stageTimes.identified);
  const unloadNow = latest(vehicles, (v) => v.stage === 'unloading');
  const unloadLast = unloadNow ?? latest(vehicles, (v) => !!v.stageTimes.unloading);
  const mixNow = latest(batches, (b) => b.stage === 'mixing');
  const mixLast = mixNow ?? latest(batches, (b) => !!b.stageTimes.mixing);
  const pressNow = latest(batches, (b) => b.stage === 'compressing');
  const pressLast = pressNow ?? latest(batches, (b) => !!b.stageTimes.compressing);
  const waiting = latest(bales, (b) => b.stage === 'created');
  const shipped = latest(bales, (b) => b.stage === 'shipped');
  const ship: Bale | undefined = waiting ?? shipped;

  const vehicleKey = (v: Vehicle | undefined) => (v && v.stage !== 'departed' ? `veh:${v.id}` : null);
  return [
    { key: 'inbound', label: '입고', active: !!arrivedNow, detail: arrivedNow ? '계중대 계량 중' : null, at: arrivedLast?.stageTimes.arrived ?? null, select: vehicleKey(arrivedNow) },
    {
      key: 'identify',
      label: '차량 인식',
      active: !!identNow,
      detail: identLast?.plate ? `${identLast.plate} · ${identLast.companyName ?? ''}` : null,
      at: identLast?.stageTimes.identified ?? null,
      select: vehicleKey(identLast),
    },
    {
      key: 'unload',
      label: '하역',
      active: !!unloadNow,
      detail: unloadLast?.sectorId ? `섹터 ${SECTOR_LABEL[unloadLast.sectorId]}` : null,
      at: unloadLast?.stageTimes.unloading ?? null,
      select: unloadLast?.sectorId ? `dev:${unloadLast.sectorId}` : null,
    },
    { key: 'mix', label: '배합', active: !!mixNow, detail: mixLast ? mixText(mixLast) : null, at: mixLast?.stageTimes.mixing ?? null, select: 'dev:robot-1' },
    {
      key: 'press',
      label: '압축',
      active: !!pressNow,
      detail: pressLast ? `목표 ${formatPressureMpa(pressLast.targetPressureMpa)}` : null,
      at: pressLast?.stageTimes.compressing ?? null,
      select: 'dev:compressor-1',
    },
    {
      key: 'ship',
      label: '출하',
      active: !!waiting,
      detail: ship ? `베일 ${shortId(ship.id)} ${BALE_STAGE_TEXT[ship.stage]}` : null,
      at: ship ? (ship.stageTimes.shipped ?? ship.stageTimes.created ?? null) : null,
      select: waiting ? `bale:${waiting.id}` : null,
    },
  ];
}

/** 핀에 적을 한 줄과 상태 */
export function deviceLine(device: DeviceState): { tone: DeviceStatus; value: string; statusText: string } {
  switch (device.type) {
    case 'tank':
      return { tone: device.status, value: formatPercent(device.fillPercent), statusText: STATUS_TEXT[device.status] };
    case 'robot':
      return {
        tone: ROBOT_STATUS_TONE[device.status],
        value: device.status === 'running' ? (PHASE_STEPS.find((s) => s.phase === device.phase)?.label ?? '대기') : ROBOT_STATUS_TEXT[device.status],
        statusText: ROBOT_STATUS_TEXT[device.status],
      };
    case 'conveyor':
      return { tone: device.status, value: device.running ? '가동' : '정지', statusText: STATUS_TEXT[device.status] };
    case 'compressor':
      return { tone: device.status, value: formatPressureMpa(device.pressureMpa), statusText: STATUS_TEXT[device.status] };
  }
}
