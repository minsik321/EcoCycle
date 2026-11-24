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
  { name: '한빛자원', sectorId: 'sector-a', trucks: [T11('12가 3456', 9.86), T5('87나 1203', 6.42)] },
  { name: '동해페이퍼', sectorId: 'sector-a', trucks: [T5('34다 7781', 6.51), T11('90라 4412', 10.12)] },
  { name: '새솔리싸이클', sectorId: 'sector-c', trucks: [T5('56마 2098', 6.33), T5('23바 6650', 6.78)] },
  { name: '푸른들환경', sectorId: 'sector-c', trucks: [T11('78사 5127', 9.64), T5('45아 8834', 6.47)] },
  { name: '가람제지자원', sectorId: 'sector-a', trucks: [T11('61자 9072', 10.05)] },
  { name: '누리순환', sectorId: 'sector-c', trucks: [T5('19차 3345', 6.6)] },
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
  /** 하역·상차 완료 → 출차 계근 시작(계근대가 비어 있을 때만) */
  afterWork: 4,
  /** 출차 계근(weighing_out): 계근대로 돌아가 다시 재는 시간. 끝나면 출차 */
  weighOut: 24,
  /** 차량 사이 최소 간격 */
  spawnGap: 35,
};

/** 상차 차량(윙바디) 한 대: 번호판, 등록 공차 t, 한 번에 싣는 베일 수 */
export interface OutboundTruckFixture {
  plate: string;
  tareT: number;
  maxBales: number;
}

/** 베일을 사 가는 회사(가상). 상차 차량은 배정 섹터가 없다 */
export interface BuyerFixture {
  name: string;
  trucks: OutboundTruckFixture[];
}

export const BUYERS: BuyerFixture[] = [
  { name: '대한판지', trucks: [{ plate: '82바 1047', tareT: 8.94, maxBales: 4 }, { plate: '71바 3390', tareT: 9.21, maxBales: 4 }] },
  { name: '성원제지', trucks: [{ plate: '64사 5512', tareT: 10.38, maxBales: 5 }] },
  { name: '한결포장', trucks: [{ plate: '38아 2276', tareT: 8.67, maxBales: 3 }, { plate: '95자 4801', tareT: 9.02, maxBales: 4 }] },
];

/**
 * 상차 차량 흐름 (예시 규칙 ⚠ B41).
 * 입고 차량 3~4대가 들어올 때마다 상차 차량 한 대. 상차 자리에 서면 적치 베일(created)을 `loadEach`초마다 하나씩 싣는다.
 * 실을 베일이 없으면 기다리고, 마지막으로 실은 때(또는 상차 시작)부터 `maxWait`초가 지나면 실은 만큼(0개도 가능)으로 상차를 마친다.
 */
export const OUTBOUND_TIMING_SEC = {
  /** 인식 → 상차 자리 도착, 상차 시작 */
  toBay: 18,
  /** 베일 하나 싣는 시간 */
  loadEach: 8,
  /** 실을 베일을 기다리는 최대 시간 */
  maxWait: 60,
};
/** 입고 차량 몇 대마다 상차 차량 한 대 [최소, 최대] */
export const OUTBOUND_EVERY_INBOUND: [number, number] = [3, 4];
/** 베일 한 개 무게 범위 t (예시: 상차 차량 순중량 계산에만 쓴다, 베일에는 무게 필드가 없다) */
export const BALE_WEIGHT_T: [number, number] = [0.85, 1.15];

export const BATCH_TIMING_SEC = {
  /** 계획 → 배합 시작 */
  plan: 3,
  /** 압축 */
  compress: 8,
};

/** 배치 하나에 로봇이 올리는 횟수 */
export const PICKS_PER_BATCH = 5;
/** 순중량 1 t가 섹터 적재율을 몇 %p 올리나 (예시 환산: 섹터 용량(노천 더미 16 m³)과 파지 밀도는 서버가 아는 값이다) */
export const FILL_PERCENT_PER_TON = 0.7;
/** 최근 목록 길이 (명세: 종류별 최근 20건 가정) */
export const RECENT_LIMIT = 20;

/** 하역 기록: 시작할 때 채워 둘 지난 날 수, 섹터마다 하루 하역 횟수 범위, 작업 시간(현장 시각), 기억할 날 수 */
export const UNLOAD_HISTORY = { seedDays: 30, perSectorPerDay: [6, 14] as [number, number], workHours: [7, 18] as [number, number], keepDays: 40 };

/** 상차 기록 채우기: 상차 차량 한 대에 싣는 베일 수 범위, 마지막 베일 생산 뒤 상차 차량이 오기까지 분 범위 */
export const OUTBOUND_HISTORY = { balesPerVehicle: [1, 3] as [number, number], arriveAfterMin: [5, 40] as [number, number] };

/** 배치 기록: 시작할 때 채워 둘 지난 날 수, 하루 배치 수 범위, 작업 시간(현장 시각), 건너뜀·일시정지됨 비율, 기억할 날 수 (차량 기록도 같은 기간을 기억한다) */
export const BATCH_HISTORY = {
  seedDays: 30,
  perDay: [8, 13] as [number, number],
  workHours: [7, 19] as [number, number],
  skipChance: 0.07,
  pauseChance: 0.05,
  keepDays: 40,
};
