import type { Alarm, Bale, Batch, DeviceId, DeviceState, PlantMetric, PlantSummary, Vehicle } from '@ecocycle/shared';

/**
 * 스튜디오 화면이 받는 값 전부. 모두 서버(또는 /scene-demo의 예시 원본)에서 온 그대로다.
 * 화면은 이 값을 표시하고 움직임으로 옮기기만 한다.
 */
export interface StudioData {
  devices: Partial<Record<DeviceId, DeviceState>>;
  summary: PlantSummary | null;
  vehicles: readonly Vehicle[];
  batches: readonly Batch[];
  bales: readonly Bale[];
  alarms: readonly Alarm[];
  /** 지표 카드의 추이선 (`GET /plant/history`). 아직 못 받았으면 없다 */
  trends: Partial<Record<PlantMetric, readonly number[]>>;
}

export const EMPTY_DATA: StudioData = { devices: {}, summary: null, vehicles: [], batches: [], bales: [], alarms: [], trends: {} };
