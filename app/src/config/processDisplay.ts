import type { Bale, BaleStage, Batch, BatchResult, BatchStage, MixPart, RobotState, TankId, Vehicle, VehicleRecordStatus, VehicleStage } from '@ecocycle/shared';
import { formatPressureMpa } from './display';

// 공정 흐름(차량·배치·베일)을 화면에 적는 문구와 "공정 추적" 계산. 서버가 준 stage를 여섯 단계 칸에 옮겨 적을 뿐, 값을 만들지 않는다.
// 3D 홈(studio)과 대시보드가 함께 쓴다. three·React를 import하지 않는다.

/** 섹터 이름 (섹터와 탱크는 같은 대상이다) */
export const SECTOR_LABEL: Record<TankId, string> = { 'tank-a1': 'A1', 'tank-a2': 'A2', 'tank-b1': 'B1', 'tank-b2': 'B2' };

/** 공정 추적이 읽는 값 */
export interface ProcessLists {
  vehicles: readonly Vehicle[];
  batches: readonly Batch[];
  bales: readonly Bale[];
}

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

export const mixText = (batch: Pick<Batch, 'mix'>): string => batch.mix.map((m) => `${SECTOR_LABEL[m.sectorId]} ${m.percent}`).join(' : ');

/** 배합을 %로 분명히 적은 것 (공정 기록: "A1 40% · B2 60%") */
export const mixPercentText = (batch: Pick<Batch, 'mix'>): string => partsText(batch.mix);

/** 배합 조각 목록을 %로 ("A1 40% · B2 60%"). 실제 배합을 적을 때도 쓴다 */
export const partsText = (parts: readonly MixPart[]): string => parts.map((m) => `${SECTOR_LABEL[m.sectorId]} ${m.percent}%`).join(' · ');

/** 지정 섹터 목록 ("A1 · B1") */
export const sectorsText = (ids: readonly TankId[]): string => ids.map((id) => SECTOR_LABEL[id]).join(' · ');

/**
 * 실제 배합 줄: 서버가 준 `actualMix`를 적는다(화면이 계산하지 않는다). 섹터 지정·수동 투입이 없는 배치(null)는 null,
 * 아직 놓은 것이 없으면 안내 글.
 */
export const actualMixText = (batch: Pick<Batch, 'actualMix'>): string | null =>
  batch.actualMix === null ? null : batch.actualMix.length ? partsText(batch.actualMix) : '아직 놓은 파지가 없습니다';

/** 로봇이 집어 든 상태 한 줄 ("A1에서 집음 · 놓기 대기"). 들고 있지 않고 집는 중도 아니면 null (서버 `heldSectorId`·`phase`) */
export function robotHoldText(robot: Pick<RobotState, 'heldSectorId' | 'phase' | 'targetTankId'>): string | null {
  if (robot.heldSectorId) {
    const sector = SECTOR_LABEL[robot.heldSectorId];
    return robot.phase === 'idle' ? `${sector}에서 집음 · 놓기 대기` : `${sector}에서 집음 · 컨베이어로 옮기는 중`;
  }
  if (robot.phase === 'pick' && robot.targetTankId) return `${SECTOR_LABEL[robot.targetTankId]}에서 집는 중`;
  return null;
}

/** 공정 기록: 차량 상태 (인식 · 하역 · 출차) */
export const VEHICLE_RECORD_STATUS_TEXT: Record<VehicleRecordStatus, string> = {
  identified: '인식',
  unloading: '하역',
  departed: '출차',
};

/** 공정 기록: 배치 결과. 진행 중이면 결과가 아직 없다(null) */
export const BATCH_RESULT_TEXT: Record<BatchResult, string> = {
  completed: '완료',
  skipped: '건너뜀',
  paused: '일시정지됨',
};
export const BATCH_RESULT_RUNNING_TEXT = '진행 중';
export const batchResultText = (result: BatchResult | null): string => (result ? BATCH_RESULT_TEXT[result] : BATCH_RESULT_RUNNING_TEXT);

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
export function cycleSteps(data: ProcessLists): CycleStep[] {
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
