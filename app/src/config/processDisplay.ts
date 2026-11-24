import type { Bale, BaleStage, Batch, BatchResult, BatchStage, MixPart, RobotState, TankId, Vehicle, VehicleKind, VehicleRecordStatus, VehicleStage } from '@ecocycle/shared';
import { VEHICLE_KIND_TEXT } from '@ecocycle/shared';
import { formatPressureMpa } from './display';

// 공정 흐름(차량·배치·베일)을 화면에 적는 문구와 "공정 추적" 계산. 서버가 준 stage를 여섯 단계 칸에 옮겨 적을 뿐, 값을 만들지 않는다.
// 3D 홈(studio)과 대시보드가 함께 쓴다. three·React를 import하지 않는다.

/** 섹터 이름 (섹터와 탱크는 같은 대상이다) */
export const SECTOR_LABEL: Record<TankId, string> = { 'sector-a': 'A', 'sector-c': 'C' };

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
  loading: '상차 중',
  loaded: '상차 완료',
  weighing_out: '출차 계근',
  departed: '출차',
};

/** 차량 종류 이름 ("입고"·"상차"). 서버 검색이 찾는 이름과 같다(`shared/search.ts`) */
export const VEHICLE_KIND_LABEL: Record<VehicleKind, string> = VEHICLE_KIND_TEXT;

/** 회사 안에 있는 차량: 출차(`departed`)하지 않은 입고·상차 차량(출차 계근 중 포함) */
export const isOnSite = (vehicle: Pick<Vehicle, 'stage'>): boolean => vehicle.stage !== 'departed';

/**
 * 회사 안 차량 목록, 최근 것부터. 3D 홈 표·폰 시트 "차량" 탭의 목록이고 그 길이가 탭 숫자다(명세 3절, 장면의 트럭 대수와 같다).
 * 출차한 차량은 "기록 보기"(공정 기록)에서 본다. 상태 판정은 서버 `stage` 그대로.
 */
export const onSiteVehicles = <V extends Pick<Vehicle, 'stage' | 'updatedAt'>>(vehicles: readonly V[]): V[] =>
  vehicles.filter(isOnSite).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

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

/** 배합을 %로 분명히 적은 것 (공정 기록: "A 40% · C 60%") */
export const mixPercentText = (batch: Pick<Batch, 'mix'>): string => partsText(batch.mix);

/** 배합 조각 목록을 %로 ("A 40% · C 60%"). 실제 배합을 적을 때도 쓴다 */
export const partsText = (parts: readonly MixPart[]): string => parts.map((m) => `${SECTOR_LABEL[m.sectorId]} ${m.percent}%`).join(' · ');

/** 지정 섹터 목록 ("A · C") */
export const sectorsText = (ids: readonly TankId[]): string => ids.map((id) => SECTOR_LABEL[id]).join(' · ');

/**
 * 실제 배합 줄: 서버가 준 `actualMix`를 적는다(화면이 계산하지 않는다). 섹터 지정·수동 투입이 없는 배치(null)는 null,
 * 아직 놓은 것이 없으면 안내 글.
 */
export const actualMixText = (batch: Pick<Batch, 'actualMix'>): string | null =>
  batch.actualMix === null ? null : batch.actualMix.length ? partsText(batch.actualMix) : '아직 놓은 파지가 없습니다';

/** 로봇이 집어 든 상태 한 줄 ("A에서 집음 · 놓기 대기"). 들고 있지 않고 집는 중도 아니면 null (서버 `heldSectorId`·`phase`) */
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
  loading: '상차',
  weighing_out: '출차 계근',
  departed: '출차',
};

/**
 * 공정 기록: 종류별 계중대 무게 이름표와 출차 계근 전 안내 (입고: 들어올 때 총중량·출차 계근 때 공차, 상차: 들어올 때 공차·출차 계근 때 총중량)
 */
export const VEHICLE_WEIGHT_TEXT: Record<VehicleKind, { first: string; second: string; pending: string; pendingShort: string }> = {
  inbound: { first: '총중량 (입차)', second: '공차 (출차 계근)', pending: '공차와 순중량은 출차 계근 뒤에 확정됩니다.', pendingShort: '공차·순중량은 출차 계근 뒤' },
  outbound: { first: '공차 (입차)', second: '총중량 (출차 계근)', pending: '총중량과 순중량은 출차 계근 뒤에 확정됩니다.', pendingShort: '총중량·순중량은 출차 계근 뒤' },
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

/**
 * 입고 → 차량 인식 → 하역 → 배합 → 압축 → 출하. 각 칸에는 그 단계에 가장 최근 들어선 대상을 적는다.
 * 입고 차량의 출차 계근은 하역 칸에, 상차 차량(상차 중·상차 완료·출차 계근)은 출하 칸에 단계 이름(VEHICLE_STAGE_TEXT)으로 적는다.
 */
export function cycleSteps(data: ProcessLists): CycleStep[] {
  const { vehicles, batches, bales } = data;
  const arrivedNow = latest(vehicles, (v) => v.stage === 'arrived');
  const arrivedLast = arrivedNow ?? latest(vehicles, (v) => !!v.stageTimes.arrived);
  const identNow = latest(vehicles, (v) => v.stage === 'identified');
  const identLast = identNow ?? latest(vehicles, (v) => !!v.stageTimes.identified);
  const unloadNow = latest(vehicles, (v) => v.stage === 'unloading');
  const unloadLast = unloadNow ?? latest(vehicles, (v) => !!v.stageTimes.unloading);
  // 하역을 마치고 출차 계근 중인 입고 차량 (하역 칸에 함께 적는다)
  const inboundWeighing = latest(vehicles, (v) => v.kind === 'inbound' && v.stage === 'weighing_out');
  const mixNow = latest(batches, (b) => b.stage === 'mixing');
  const mixLast = mixNow ?? latest(batches, (b) => !!b.stageTimes.mixing);
  const pressNow = latest(batches, (b) => b.stage === 'compressing');
  const pressLast = pressNow ?? latest(batches, (b) => !!b.stageTimes.compressing);
  const waiting = latest(bales, (b) => b.stage === 'created');
  const shipped = latest(bales, (b) => b.stage === 'shipped');
  const ship: Bale | undefined = waiting ?? shipped;
  // 회사 안 상차 차량 (상차 · 출차 계근). 있으면 출하 칸은 이 차량을 적는다
  const outboundNow = latest(vehicles, (v) => v.kind === 'outbound' && (v.stage === 'loading' || v.stage === 'loaded' || v.stage === 'weighing_out'));

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
      active: !!unloadNow || !!inboundWeighing,
      detail: unloadNow?.sectorId
        ? `섹터 ${SECTOR_LABEL[unloadNow.sectorId]}`
        : inboundWeighing
          ? `${inboundWeighing.plate ?? ''} ${VEHICLE_STAGE_TEXT.weighing_out}`.trim()
          : unloadLast?.sectorId
            ? `섹터 ${SECTOR_LABEL[unloadLast.sectorId]}`
            : null,
      at: unloadNow?.stageTimes.unloading ?? inboundWeighing?.stageTimes.weighing_out ?? unloadLast?.stageTimes.unloading ?? null,
      select: !unloadNow && inboundWeighing ? vehicleKey(inboundWeighing) : unloadLast?.sectorId ? `dev:${unloadLast.sectorId}` : null,
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
      active: !!waiting || !!outboundNow,
      detail: outboundNow
        ? `${outboundNow.plate ?? ''} ${VEHICLE_STAGE_TEXT[outboundNow.stage]} · 베일 ${outboundNow.baleIds.length}개`.trim()
        : ship
          ? `베일 ${shortId(ship.id)} ${BALE_STAGE_TEXT[ship.stage]}`
          : null,
      at: outboundNow
        ? (outboundNow.stageTimes[outboundNow.stage] ?? null)
        : ship
          ? (ship.stageTimes.shipped ?? ship.stageTimes.created ?? null)
          : null,
      select: outboundNow ? vehicleKey(outboundNow) : waiting ? `bale:${waiting.id}` : null,
    },
  ];
}
