// 카메라 지역과 거리 단계. three를 쓰지 않는다: 3D 장면을 받기 전에 그리는 패널(지역 전환)도 이 목록을 읽는다.
// world/layout.ts가 그대로 다시 내보낸다.

export type V3 = readonly [number, number, number];

/**
 * 카메라 거리는 세 단계다 (참고 화면 docs/reference/ 01~10):
 *  - wide: 부지 전체. 다 보여도 한산하게
 *  - mid: 한 구역(섹터·로봇, 입구·계근대, 압축기·레일, 베일 적치). 기본 화면
 *  - close: 대상 하나(기울이는 트럭, 압축기, 베일을 든 지게차). 대상을 고르면 이 거리로 간다
 */
export type ViewTier = 'wide' | 'mid' | 'close';

/**
 * 카메라 지역 프리셋. 보는 곳(at)은 위성사진 좌표(px)로 적고, 3D 조각(three/Rig)이 world/layout의 sitePx로 월드에 옮긴다
 * (사진 → 월드 변환은 layout.ts 하나뿐이다. 이 파일은 three 없이 패널도 읽으므로 그 변환을 가져오지 않는다).
 * azimuth는 "사진처럼 남쪽에서 북쪽을 보는" 방향을 0으로 잰 카메라 방위각(도, 위에서 볼 때 반시계), polar는 천정각(도).
 */
export interface ViewPreset {
  key: string;
  label: string;
  /** 지역 전환 목록의 둘째 줄 */
  hint: string;
  tier: ViewTier;
  /** 보는 곳: 사진 좌표(px)와 높이 */
  at: readonly [number, number];
  height: number;
  distance: number;
  azimuth: number;
  polar: number;
}

export const WIDE_VIEW: ViewPreset = { key: 'site', label: '부지 전체', hint: '도로·입구부터 숲까지', tier: 'wide', at: [300, 300], height: 0, distance: 118, azimuth: 22, polar: 46 };

/** 위에서 내려다본 부지 전체: 위성사진처럼 북쪽이 위 (사진과 견주어 보는 화면) */
export const TOP_VIEW: ViewPreset = { key: 'top', label: '위에서 보기', hint: '위성사진처럼 북쪽이 위', tier: 'wide', at: [300, 300], height: 0, distance: 170, azimuth: 0, polar: 1 };

/** 구역(mid). 첫 번째가 기본 화면이다 */
export const AREAS: readonly ViewPreset[] = [
  { key: 'process', label: '섹터·로봇', hint: '섹터 A·C 더미, 로봇팔', tier: 'mid', at: [210, 372], height: 0.4, distance: 44, azimuth: 26, polar: 50 },
  { key: 'inbound', label: '입구·계근대', hint: '입차, 계근, 번호판 인식, 출차', tier: 'mid', at: [462, 272], height: 0, distance: 42, azimuth: 30, polar: 50 },
  { key: 'baler', label: '압축기·레일', hint: '경사 레일, 압축기 건물, 배출구', tier: 'mid', at: [160, 440], height: 0.6, distance: 40, azimuth: 18, polar: 50 },
  { key: 'bales', label: '베일 적치', hint: '남동 적치, 지게차, 상차(예시)', tier: 'mid', at: [338, 378], height: 0.2, distance: 50, azimuth: 30, polar: 50 },
];

export const VIEWS: readonly ViewPreset[] = [WIDE_VIEW, TOP_VIEW, ...AREAS];
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
