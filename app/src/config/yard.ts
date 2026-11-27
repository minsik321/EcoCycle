// 3D 홈 베일 적치의 흐름 설정 (서버 값이 아니라 연출을 균형 있게 돌리기 위한 가정).
// 남동 구역에 새 베일을 쌓고, 남동이 차면 오래된 줄부터 북서로 옮기며, 서버가 출하한 베일은 북서에서 빠진다(docs/dashboard-spec.md 3절).
// 지게차가 못 따라가면 받침대가 차고 압축기가 기다린다. 균형은 `studio/sim/yard.test.ts`가 점검한다.

export const YARD_FLOW = {
  /** 지게차 수 (1 또는 2). 둘이면 입고(받침대 → 저울 → 남동)와 줄 옮기기(남동 → 북서)·상차(북서 → 상차 차량)를 나눠 맡기 쉽다 */
  forkliftCount: 2 as 1 | 2,
  /** 남동 칸 줄의 열 수, 북서 칸 줄의 열 수, 쌓는 높이(단). 베일은 두 개씩(저울에서 잰 한 쌍) 쌓는다 */
  seColumns: 11,
  nwColumns: 9,
  levels: 4,
  /** 처음 장면을 열 때 이미 쌓여 있는 재고(서버 베일이 아닌 바탕 재고)의 비율: 남동 열, 북서 열 */
  seStartColumns: 8,
  nwStartColumns: 9,
  /**
   * 저울(S2t): 베일은 두 개를 2단으로 쌓아 한 번에 잰다. 저울에 한 개를 올린 뒤 이 시간(초, 월드 시계) 안에 다음 베일이 배출구 철판에
   * 나오지 않으면 한 개만 재서 옮긴다(베일 한 개가 나오는 주기 정도). 화면 연출의 가정이고 서버 무게 기록과는 상관없다
   */
  singleWaitSec: 12,
  /** 남동에 빈 열이 이만큼보다 적으면 가장 오래된 줄을 북서로 옮긴다 */
  seFreeColumnsMin: 3,
  /**
   * 지게차(3톤급) 실제 축척 한계(S2s 2026-11-27 메인 승인): 앞 4.5 m/s(약 16 km/h), 후진 2.5 m/s, 가속 2 m/s², 포크 오르내림 0.5 m/s.
   * 장면은 studio/sim/forkRoute.ts에서 월드 단위(1단위 = 2 m)로 바꿔 쓰고, 이 값을 넘어 빨리 돌리지 않는다(전에는 상차 끝에 2.2배).
   * 모서리는 회전 반경(cornerRadiusM)으로 둥글리고 옆 가속(cornerAccelMps2) 안으로 줄인다. 제자리 돌기는 turnRadPerSec(rad/s)
   */
  driveMps: 4.5,
  reverseMps: 2.5,
  accelMps2: 2.0,
  liftMps: 0.5,
  cornerRadiusM: 2.2,
  cornerAccelMps2: 2.5,
  turnRadPerSec: 2.4,
} as const;

/** 장면이 쌓을 수 있는 칸 수 (남동 + 북서). 패널이 "마당 N칸"을 적을 때도 이 값을 쓴다 */
export const YARD_CAPACITY = (YARD_FLOW.seColumns + YARD_FLOW.nwColumns) * YARD_FLOW.levels;

/**
 * 처음 장면을 열 때의 바탕 재고 칸 수 (북서 nwStartColumns × levels + 남동 seStartColumns × levels = 36 + 32 = 68).
 * ⚠ B41 가정(S2q 2026-11-27 사용자 결정 A안): 모의 서버는 적치(created) 베일을 이만큼 가진 채 시작하고(mock-server fixtures
 * OUTBOUND_CALL.seedYardBales, 같은 값임을 app/src/test/vehicleFlow.test.ts가 본다), 3D는 이 재고 칸을 그 서버 베일에 맡긴다(sim/yard.ts).
 */
export const YARD_SEED_BALES = (YARD_FLOW.nwStartColumns + YARD_FLOW.seStartColumns) * YARD_FLOW.levels;

/**
 * 상차 차량을 부르는 기준: 적치 베일이 위쪽(북서) 줄 칸 수(nwColumns × levels = 36)를 넘으면, 곧 북서 줄이 가득 차면 한 대(20개).
 * ⚠ B41 가정(S2q 2026-11-27 사용자 결정 A안). 부르는 것은 서버(모의 서버 OUTBOUND_CALL.callAboveYardBales, 같은 값)이고 3D는 이 값을 쓰지 않는다.
 */
export const YARD_CALL_ABOVE_BALES = YARD_FLOW.nwColumns * YARD_FLOW.levels;

/**
 * 3D 홈의 실제 크기 가정(m). 장면은 이 값을 월드 단위로 바꿔 그린다(studio/world/layout.ts의 `M`, 1단위 = 2 m).
 * 서버 값이 아니라 현장 설명에서 온 가정이다(2026-11-26 S2k 사용자 요청): 부지 면적, 베일 크기, 일반적인 차량 크기.
 */
export const REAL_SIZE_M = {
  /** 부지 총면적(m²): 마당 포장 판(계근대 단·압축기 건물 포함, 숲·도로 제외)으로 본다. 축척을 정하는 기준 */
  siteAreaM2: 4007,
  /** 베일: 단면 1.1 × 1.1, 길이 1.5. 쌓을 때 틈 0.1 */
  bale: { width: 1.1, height: 1.1, length: 1.5, gap: 0.1 },
  /** 입고 트럭: 5톤 화물차급 (길이, 폭(거울 제외), 운전석 지붕 높이) */
  truck: { length: 7.5, width: 2.4, height: 2.9 },
  /**
   * 상차 트럭: 25톤 카고(대형, 2026-11-26 S2j 사용자 결정). 길이·폭·운전석 지붕 높이, 적재함(바닥판) 길이·폭·바닥 높이.
   * 낮은 적재함에 옆판이 내려간다. 베일 20개를 1.5 m 쪽이 차 길이 방향으로 5열 × 2줄 × 2단(20자리, 열 사이 0.26 m·앞 0.52 m)에 싣는다
   */
  loadTruck: { length: 12, width: 2.5, height: 3.2, bedLength: 10.1, bedWidth: 2.35, deckHeight: 1.3 },
  /** 계근대 길이: 상차 트럭(12 m)이 다 올라서도록 위성사진의 9.6 m에서 늘렸다 (S2j) */
  weighbridge: { length: 14 },
  /** 지게차: 3톤급 (클램프 포함 길이, 몸체 폭, 머리 보호 틀 높이). 클램프는 베일 폭 1.1을 잡는다 */
  forklift: { length: 3.7, width: 1.2, guardHeight: 2.2 },
  /** 작업자 키 */
  worker: { height: 1.75 },
} as const;

/**
 * 3D 홈 하역 연출이 기대하는 하역 단계(unloading) 길이(초). 서버 값이 아니라 가정이다(모의 서버 VEHICLE_TIMING_SEC.unload와 같게).
 * 트럭이 섹터 앞에 늦게 서면 "하역 시작 시각 + 이 값"까지 남은 시간에 맞춰 집게차는 집는 횟수(1~4)를, 덤프는 쏟는 시간을 줄인다(S2m)
 */
export const UNLOAD_EXPECTED_SEC = 9;
