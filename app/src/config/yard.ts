// 3D 홈 베일 적치의 흐름 설정 (서버 값이 아니라 연출을 균형 있게 돌리기 위한 가정).
// 남동 구역에 새 베일을 쌓고, 남동이 차면 오래된 줄부터 북서로 옮기며, 서버가 출하한 베일은 북서에서 빠진다(docs/dashboard-spec.md 3절).
// 지게차가 못 따라가면 받침대가 차고 압축기가 기다린다. 균형은 `studio/sim/yard.test.ts`가 점검한다.

export const YARD_FLOW = {
  /** 지게차 수 (1 또는 2). 둘이면 입고(받침대 → 저울 → 남동)와 줄 옮기기(남동 → 북서)·상차(북서 → 상차 차량)를 나눠 맡기 쉽다 */
  forkliftCount: 2 as 1 | 2,
  /** 남동 칸 줄의 열 수, 북서 칸 줄의 열 수, 쌓는 높이(단). 베일은 두 개씩(저울에서 잰 한 쌍) 쌓는다 */
  seColumns: 7,
  nwColumns: 6,
  levels: 4,
  /** 처음 장면을 열 때 이미 쌓여 있는 재고(서버 베일이 아닌 바탕 재고)의 비율: 남동 열, 북서 열 */
  seStartColumns: 3,
  nwStartColumns: 6,
  /** 남동에 빈 열이 이만큼보다 적으면 가장 오래된 줄을 북서로 옮긴다 */
  seFreeColumnsMin: 2,
  /** 지게차 속도·가속·회전·포크 오르내림 (m/s, m/s², rad/s, m/s) */
  driveMps: 5.6,
  reverseMps: 3.6,
  accelMps2: 5.0,
  turnRadPerSec: 6.2,
  liftMps: 2.0,
} as const;

/** 장면이 쌓을 수 있는 칸 수 (남동 + 북서). 패널이 "마당 N칸"을 적을 때도 이 값을 쓴다 */
export const YARD_CAPACITY = (YARD_FLOW.seColumns + YARD_FLOW.nwColumns) * YARD_FLOW.levels;
