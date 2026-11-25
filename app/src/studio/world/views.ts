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
  /** 세로 화각(도). 없으면 기본 20도. 사진 방향 화면은 현장 사진(넓은 각)처럼 넓게 */
  fov?: number;
}

export const WIDE_VIEW: ViewPreset = { key: 'site', label: '부지 전체', hint: '도로·입구부터 숲까지', tier: 'wide', at: [300, 300], height: 0, distance: 118, azimuth: 22, polar: 46 };

/** 위에서 내려다본 부지 전체: 위성사진처럼 북쪽이 위 (사진과 견주어 보는 화면) */
export const TOP_VIEW: ViewPreset = { key: 'top', label: '위에서 보기', hint: '위성사진처럼 북쪽이 위', tier: 'wide', at: [300, 300], height: 0, distance: 170, azimuth: 0, polar: 1 };

/** 구역(mid). 첫 번째가 기본 화면이다 */
export const AREAS: readonly ViewPreset[] = [
  { key: 'process', label: '섹터·로봇', hint: '섹터 A·C 더미, 로봇팔', tier: 'mid', at: [210, 372], height: 0.4, distance: 44, azimuth: 26, polar: 50 },
  { key: 'inbound', label: '입구·계근대', hint: '입차, 계근, 번호판 인식, 출차', tier: 'mid', at: [462, 272], height: 0, distance: 42, azimuth: 30, polar: 50 },
  { key: 'baler', label: '압축기·레일', hint: '경사 레일, 압축기, 배출 받침대·베일 저울', tier: 'mid', at: [200, 470], height: 0.6, distance: 40, azimuth: 30, polar: 50 },
  { key: 'bales', label: '베일 적치', hint: '남동 적치, 북서 재고, 지게차, 상차', tier: 'mid', at: [320, 330], height: 0.2, distance: 52, azimuth: 30, polar: 52 },
];

export const VIEWS: readonly ViewPreset[] = [WIDE_VIEW, TOP_VIEW, ...AREAS];

/**
 * 현장 사진과 같은 방향의 화면 (지역 전환 목록에는 없다: 점검 스크립트가 사진과 나란히 견줄 때만 쓴다).
 * entrance: 입구 남쪽 도로에서 서북서, gate: 입구에서 서쪽, weighbridge: 사무실 남동 모서리 도로에서 북서쪽,
 * approach: 사무실 북동쪽 도로에서 남쪽, upperRoad: 남동 바깥 더 높은 도로에서 북서쪽
 */
export const PHOTO_VIEWS: Record<string, ViewPreset> = {
  // 사람 눈높이(천정각 90도: 수평으로 봄, 눈높이 = height)에서 넓은 화각으로. azimuth는 보는 곳에서 카메라 쪽 방위(0 남, 90 동, 180 북)
  // 입구 남동 도로(535,345 근처)에서 서쪽: 오른쪽 계근대 단 옹벽, 경사로, 남동 베일, 그 뒤 파란 지붕 공장·물탱크, 더미, 먼 능선
  entrance: { key: 'photo-entrance', label: '입구에서', hint: 'entrance.png', tier: 'mid', at: [286, 323], height: 0.3, distance: 18, azimuth: 85, polar: 90, fov: 66 },
  // 경사로 위(480,330 근처)에서 서쪽 (트럭이 지나는 자리라 차가 함께 찍힐 수 있다): 왼쪽 남동 베일 벽, 가운데 줄눈 마당과 멀리 북서 베일·숲 (사무실은 사진보다 오른쪽이라 화면 밖: 사무실은 weighbridge·approach·entrance에서 본다)
  gate: { key: 'photo-gate', label: '입구 안에서 서쪽', hint: 'from-gate-inside.png', tier: 'mid', at: [231, 352], height: 1.6, distance: 18, azimuth: 95, polar: 90, fov: 66 },
  // 계근대 단 남동 모서리 아래 도로(580,370 근처)에서 북서: 옹벽·난간, 노란 테두리 계근대, 사무실 남쪽 면, 왼쪽 베일
  weighbridge: { key: 'photo-weighbridge', label: '계근대 쪽', hint: 'weighbridge.png', tier: 'mid', at: [440, 232], height: 0.6, distance: 14, azimuth: 45, polar: 90, fov: 50 },
  // 사무실 북동쪽 도로(570,40 근처)에서 남쪽: 낮은 도로, 오른쪽 옹벽 위 2층 사무실 동쪽 면과 실외기, 전봇대·전선
  approach: { key: 'photo-approach', label: '북동 도로에서', hint: 'approach.png', tier: 'mid', at: [552, 300], height: -0.2, distance: 19, azimuth: 176, polar: 90, fov: 58 },
  // 남동 바깥 도로(475,470 근처)에서 북서: 회색 철판 울타리 + 높은 녹색 그물망, 그 뒤 베일 벽, 오른쪽 멀리 사무실
  upperRoad: { key: 'photo-upper-road', label: '남동 도로에서', hint: 'from-upper-road.png', tier: 'mid', at: [334, 329], height: 2.0, distance: 16, azimuth: 45, polar: 90, fov: 64 },
};
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
