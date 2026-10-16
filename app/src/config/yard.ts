// 3D 홈 출하 마당의 흐름 설정 (서버 값이 아니라 연출을 균형 있게 돌리기 위한 가정).
// 베일이 만들어지는 속도(서버)에 지게차가 못 따라가면 마당이 끝없이 쌓이므로, 지게차 수·속도와 칸 수를 여기서 정한다.
// 균형은 `studio/sim/yard.test.ts`가 점검한다: 모의 서버·시연의 생산 속도에서 마당이 한정된 채 도는지, 겹침이 없는지.

export const YARD_FLOW = {
  /** 지게차 수 (1 또는 2). 둘이면 입고(배출구 → 칸)와 출하(칸 → 화면 밖)를 나눠 맡는다 */
  forkliftCount: 2 as 1 | 2,
  /** 적치 칸: 줄 안의 열 수 × 쌓는 높이(2~3단). 칸이 다 차면 압축기는 배출을 멈추고 기다린다 */
  columns: 8,
  levels: 3,
  /** 지게차 속도·가속·회전·포크 오르내림 (m/s, m/s², rad/s, m/s) */
  driveMps: 3.8,
  reverseMps: 2.6,
  accelMps2: 4.0,
  turnRadPerSec: 4.5,
  liftMps: 1.6,
  /** 베일을 싣고 화면 밖으로 나가 있다가 돌아오는 시간 (s, 연출) */
  awaySec: 2.5,
  /** 출하하러 나가는 길의 화면 끝(X). 이 너머로 나가면 지게차를 숨긴다 */
  exitX: -15.5,
} as const;

/** 적치 칸 수. 패널이 "마당 N칸"을 적을 때도 이 값을 쓴다 */
export const YARD_CAPACITY = YARD_FLOW.columns * YARD_FLOW.levels;
