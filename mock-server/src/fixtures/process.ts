import type { TankId } from '@ecocycle/shared';

// 공정 흐름 예시 데이터. 회사·번호판은 모두 가상이다 (실제 업체·차량이 아니다).
// 번호판 → 회사 → 배정 섹터, 배합비, 목표 압력은 실서버에서 서버가 정하는 값이고 여기서는 예시로 흉내만 낸다.

/** 차량 한 대. 공차는 등록 공차 근처에서 조금씩 다르게 잰다(연료·운전자), 싣는 양은 범위 안에서 고른다 */
export interface TruckFixture {
  plate: string;
  /** 등록 공차 t */
  tareT: number;
  /** 한 번에 싣고 오는 파지 순중량 범위 t (부피가 커서 적재 한도보다 적게 싣는다) */
  netT: [number, number];
}

export interface CompanyFixture {
  name: string;
  /** 이 회사 차량이 배정되는 섹터 (예시 규칙: 회사마다 한 섹터) */
  sectorId: TankId;
  trucks: TruckFixture[];
}

// 5톤 카고(공차 약 6.3~6.8 t, 파지 3.5~6 t)와 11톤 카고(공차 약 9.6~10.2 t, 파지 6.5~10 t) 예시
const T5 = (plate: string, tareT: number): TruckFixture => ({ plate, tareT, netT: [3.6, 5.8] });
const T11 = (plate: string, tareT: number): TruckFixture => ({ plate, tareT, netT: [6.6, 9.8] });

export const COMPANIES: CompanyFixture[] = [
  { name: '한빛자원', sectorId: 'tank-a1', trucks: [T11('12가 3456', 9.86), T5('87나 1203', 6.42)] },
  { name: '동해페이퍼', sectorId: 'tank-a2', trucks: [T5('34다 7781', 6.51), T11('90라 4412', 10.12)] },
  { name: '새솔리싸이클', sectorId: 'tank-b1', trucks: [T5('56마 2098', 6.33), T5('23바 6650', 6.78)] },
  { name: '푸른들환경', sectorId: 'tank-b2', trucks: [T11('78사 5127', 9.64), T5('45아 8834', 6.47)] },
  { name: '가람제지자원', sectorId: 'tank-a1', trucks: [T11('61자 9072', 10.05)] },
  { name: '누리순환', sectorId: 'tank-b2', trucks: [T5('19차 3345', 6.6)] },
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

/**
 * 실제 배합의 평균 수분이 계획보다 1%p 높을 때 목표 압력을 몇 MPa 올리나 (예시 규칙, 범위 안으로 자른다).
 * 젖은 파지는 덜 눌리므로 조금 더 누른다고 가정했다. 실제 규칙은 서버 담당이 정한다 (docs/decisions.md 2026-10-16 "섹터 지정의 실제 배합").
 */
export const PRESSURE_PER_MOISTURE_MPA = 0.6;

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
/** 순중량 1 t가 섹터 적재율을 몇 %p 올리나 (예시 환산: 섹터 용량과 파지 밀도는 서버가 아는 값이다) */
export const FILL_PERCENT_PER_TON = 1.4;
/** 최근 목록 길이 (명세: 종류별 최근 20건 가정) */
export const RECENT_LIMIT = 20;

/** 하역 기록: 시작할 때 채워 둘 지난 날 수, 섹터마다 하루 하역 횟수 범위, 작업 시간(현장 시각), 기억할 날 수 */
export const UNLOAD_HISTORY = { seedDays: 30, perSectorPerDay: [3, 7] as [number, number], workHours: [7, 18] as [number, number], keepDays: 40 };

/** 배치 기록: 시작할 때 채워 둘 지난 날 수, 하루 배치 수 범위, 작업 시간(현장 시각), 건너뜀·일시정지됨 비율, 기억할 날 수 (차량 기록도 같은 기간을 기억한다) */
export const BATCH_HISTORY = {
  seedDays: 30,
  perDay: [8, 13] as [number, number],
  workHours: [7, 19] as [number, number],
  skipChance: 0.07,
  pauseChance: 0.05,
  keepDays: 40,
};
