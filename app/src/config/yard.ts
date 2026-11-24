// 3D 홈 베일 적치(남동 구역)의 흐름 설정 (서버 값이 아니라 연출을 균형 있게 돌리기 위한 가정).
// 베일이 만들어지는 속도(서버)에 지게차가 못 따라가면 마당이 끝없이 쌓이므로, 지게차 수·속도와 칸 수를 여기서 정한다.
// 균형은 `studio/sim/yard.test.ts`가 점검한다: 모의 서버·시연의 생산 속도에서 마당이 한정된 채 도는지, 겹침이 없는지.

export const YARD_FLOW = {
  /** 지게차 수 (1 또는 2). 둘이면 입고(배출구 → 남동 칸)와 출하(남동 칸 → 북서 재고)·상차(북서 재고 → 상차 차량, 예시)를 나눠 맡는다 */
  forkliftCount: 2 as 1 | 2,
  /** 적치 칸: 줄 안의 열 수 × 쌓는 높이(2~3단). 칸이 다 차면 압축기는 배출을 멈추고 기다린다 */
  columns: 8,
  levels: 3,
  /** 지게차 속도·가속·회전·포크 오르내림 (m/s, m/s², rad/s, m/s). 출하 베일은 마당을 가로질러 북서 재고까지 가므로 예전(화면 밖으로 나가기)보다 빠르게 잡았다 */
  driveMps: 5.6,
  reverseMps: 3.6,
  accelMps2: 5.0,
  turnRadPerSec: 6.2,
  liftMps: 2.0,
} as const;

/** 적치 칸 수. 패널이 "마당 N칸"을 적을 때도 이 값을 쓴다 */
export const YARD_CAPACITY = YARD_FLOW.columns * YARD_FLOW.levels;
