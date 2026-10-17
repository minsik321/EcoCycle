import type { ReactNode } from 'react';
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

/**
 * 패널이 공정 기록 화면(앱의 다른 화면)으로 보내는 링크의 대상. 스튜디오는 화면(features)을 import하지 않으므로
 * 링크 그리기는 앱 쪽(LiveStudio)이 넘겨 준다. 없으면(시연 화면) 링크를 그리지 않는다.
 */
export type RecordsListTab = 'vehicles' | 'batches' | 'bales';
/** 기록 한 건 (상세 팝업으로 연다) */
export type RecordTarget = { kind: 'vehicle'; id: string } | { kind: 'batch'; id: string } | { kind: 'bale'; id: string };
export type RecordLinkTarget = { kind: 'list'; tab: RecordsListTab } | RecordTarget;
/** 링크 하나를 그린다. `className`은 패널이 정하는 모양(`st-link` 큰 버튼, `st-link-mini` 작은 글자 링크) */
export type RecordLink = (target: RecordLinkTarget, label: string, className: string) => ReactNode;
/**
 * 기록 한 건의 상세 팝업을 지금 화면(3D 홈) 위에 연다. 표에서 3D 장면에 없는 대상(출차한 차량, 출하된 베일, 배치)을 누를 때 쓴다.
 * 앱 쪽(LiveStudio)이 넘겨 준다. 없으면(시연 화면) 그런 줄은 누를 수 없다.
 */
export type RecordOpen = (target: RecordTarget) => void;

export const EMPTY_DATA: StudioData = { devices: {}, summary: null, vehicles: [], batches: [], bales: [], alarms: [], trends: {} };
