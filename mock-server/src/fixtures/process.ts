import type { TankId } from '@ecocycle/shared';

// 공정 흐름 예시 데이터. 회사·번호판은 모두 가상이다 (실제 업체·차량이 아니다).
// 번호판 → 회사 → 배정 섹터, 배합비, 목표 압력은 실서버에서 서버가 정하는 값이고 여기서는 예시로 흉내만 낸다.

export interface CompanyFixture {
  name: string;
  /** 이 회사 차량이 배정되는 섹터 (예시 규칙: 회사마다 한 섹터) */
  sectorId: TankId;
  plates: string[];
}

export const COMPANIES: CompanyFixture[] = [
  { name: '한빛자원', sectorId: 'tank-a1', plates: ['12가 3456', '87나 1203'] },
  { name: '동해페이퍼', sectorId: 'tank-a2', plates: ['34다 7781', '90라 4412'] },
  { name: '새솔리싸이클', sectorId: 'tank-b1', plates: ['56마 2098', '23바 6650'] },
  { name: '푸른들환경', sectorId: 'tank-b2', plates: ['78사 5127', '45아 8834'] },
  { name: '가람제지자원', sectorId: 'tank-a1', plates: ['61자 9072'] },
  { name: '누리순환', sectorId: 'tank-b2', plates: ['19차 3345'] },
];

/** 배합비 예시 (섹터 두 곳을 섞을 때의 %). 한 곳만 쓸 수 있으면 100% */
export const MIX_RATIOS: [number, number][] = [
  [40, 60],
  [50, 50],
  [30, 70],
  [60, 40],
];

/** 목표 압력 예시 범위 (MPa) */
export const TARGET_PRESSURE_MPA = { min: 27.0, max: 30.0 };

/** 단계별 머무는 시간(초). 화면 연출이 따라올 수 있을 만큼 여유를 둔다 */
export const VEHICLE_TIMING_SEC = {
  /** 계중대 도착 → 번호판 인식 */
  identify: 6,
  /** 인식 → 섹터 앞 도착, 하역 시작 */
  toSector: 16,
  /** 하역(적재함 기울이기) */
  unload: 9,
  /** 하역 완료 → 출차 */
  leave: 14,
  /** 차량 사이 최소 간격 */
  spawnGap: 35,
};

export const BATCH_TIMING_SEC = {
  /** 계획 → 배합 시작 */
  plan: 3,
  /** 압축 */
  compress: 8,
  /** 베일 배출 → 지게차 출하 */
  ship: 25,
};

/** 배치 하나에 로봇이 올리는 횟수 */
export const PICKS_PER_BATCH = 5;
/** 차량 한 대가 섹터에 내리는 양 (적재율 %) */
export const UNLOAD_FILL_PERCENT = 7;
/** 최근 목록 길이 (명세: 종류별 최근 20건 가정) */
export const RECENT_LIMIT = 20;
