// 카메라 지역과 거리 단계. three를 쓰지 않는다: 3D 장면을 받기 전에 그리는 패널(지역 전환)도 이 목록을 읽는다.
// world/layout.ts가 그대로 다시 내보낸다.

export type V3 = readonly [number, number, number];

/**
 * 카메라 거리는 세 단계다 (참고 화면 docs/reference/ 01~10):
 *  - wide: 부지 전체. 다 보여도 한산하게
 *  - mid: 한 구역(섹터·로봇·압축기, 정문·계중대 등). 기본 화면
 *  - close: 대상 하나(기울이는 트럭, 압축기, 베일을 든 지게차). 대상을 고르면 이 거리로 간다
 */
export type ViewTier = 'wide' | 'mid' | 'close';

/** 카메라 지역 프리셋: target과 거리, 방위각·천정각(도) */
export interface ViewPreset {
  key: string;
  label: string;
  /** 지역 전환 목록의 둘째 줄 */
  hint: string;
  tier: ViewTier;
  target: V3;
  distance: number;
  azimuth: number;
  polar: number;
}

export const WIDE_VIEW: ViewPreset = { key: 'site', label: '부지 전체', hint: '정문부터 출하 마당까지', tier: 'wide', target: [3.8, 0, -1.4], distance: 86, azimuth: 58, polar: 48 };

/** 구역(mid). 첫 번째가 기본 화면이다 */
export const AREAS: readonly ViewPreset[] = [
  { key: 'process', label: '섹터·로봇·압축', hint: '섹터 4칸, 로봇팔, 컨베이어, 압축기', tier: 'mid', target: [-1.6, 0.3, -0.9], distance: 47, azimuth: 56, polar: 50 },
  { key: 'inbound', label: '정문·계중대', hint: '입차, 계량, 번호판 인식', tier: 'mid', target: [14.6, 0, -6.8], distance: 40, azimuth: 52, polar: 50 },
  { key: 'unload', label: '하역 마당', hint: '섹터 앞 후진·하역', tier: 'mid', target: [7.2, 0, -1.2], distance: 40, azimuth: 40, polar: 50 },
  { key: 'shipping', label: '출하 마당', hint: '베일 배출, 적치, 지게차', tier: 'mid', target: [-5.4, 0.2, -5.0], distance: 38, azimuth: 64, polar: 50 },
];

export const VIEWS: readonly ViewPreset[] = [WIDE_VIEW, ...AREAS];
export const DEFAULT_VIEW: ViewPreset = AREAS[0]!;

/** 거리 단계별 기준 거리 (확대·축소 버튼이 이 단계를 오간다) */
export const TIER_DISTANCE: Record<ViewTier, number> = { wide: WIDE_VIEW.distance, mid: DEFAULT_VIEW.distance, close: 22 };

/** 대상을 골랐을 때(close)의 거리. 대상이 화면 폭의 3분의 1쯤 차고 둘레가 조금 보이게 한다 (참고 화면 08~10) */
export const CLOSE_DISTANCE: Record<string, number> = {
  'dev:compressor-1': 25,
  'dev:robot-1': 22,
  'dev:conveyor-z': 26,
  dev: 23,
  veh: 22,
  bale: 13,
  forklift: 17,
};

export function closeDistance(key: string): number {
  return CLOSE_DISTANCE[key] ?? CLOSE_DISTANCE[key.split(':')[0] ?? ''] ?? TIER_DISTANCE.close;
}

/** 이 거리는 어느 단계인가 (핀 크기·확대 버튼에 쓴다) */
export function tierOf(distance: number): ViewTier {
  if (distance > (TIER_DISTANCE.wide + TIER_DISTANCE.mid) / 2) return 'wide';
  if (distance > (TIER_DISTANCE.mid + TIER_DISTANCE.close) / 2) return 'mid';
  return 'close';
}
