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
  /** 남동에 빈 열이 이만큼보다 적으면 가장 오래된 줄을 북서로 옮긴다 */
  seFreeColumnsMin: 3,
  /** 지게차 속도·가속·회전·포크 오르내림 (m/s, m/s², rad/s, m/s) */
  driveMps: 5.6,
  reverseMps: 3.6,
  accelMps2: 5.0,
  turnRadPerSec: 6.2,
  liftMps: 2.0,
} as const;

/** 장면이 쌓을 수 있는 칸 수 (남동 + 북서). 패널이 "마당 N칸"을 적을 때도 이 값을 쓴다 */
export const YARD_CAPACITY = (YARD_FLOW.seColumns + YARD_FLOW.nwColumns) * YARD_FLOW.levels;

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
   * 낮은 적재함에 옆판이 내려간다. 베일 20개를 1.5 m 쪽이 차 길이 방향으로 6열 × 2줄 × 2단(24자리) 중에 싣는다
   */
  loadTruck: { length: 12, width: 2.5, height: 3.2, bedLength: 10.1, bedWidth: 2.35, deckHeight: 1.3 },
  /** 계근대 길이: 상차 트럭(12 m)이 다 올라서도록 위성사진의 9.6 m에서 늘렸다 (S2j) */
  weighbridge: { length: 14 },
  /** 지게차: 3톤급 (클램프 포함 길이, 몸체 폭, 머리 보호 틀 높이). 클램프는 베일 폭 1.1을 잡는다 */
  forklift: { length: 3.7, width: 1.2, guardHeight: 2.2 },
  /** 작업자 키 */
  worker: { height: 1.75 },
} as const;
