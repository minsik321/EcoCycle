import type { TankId } from '@ecocycle/shared';

// 로봇팔이 섹터(탱크)를 집으러 갈 때의 관절 값과 시연 동작 주기.
// 모의 서버(mock-server/src/sim/robot.ts)와 같은 값이어야 시연 동작과 3D 배치(studio/world/layout.ts의 집는 자리)가 서버와 맞는다.
// 실제 로봇이 정해지면 서버 값에 맞춰 다시 정한다.

/** 섹터마다 로봇이 집으러 가는 `base` 관절 각도(도). 3D 홈의 섹터 칸은 이 각도에서 내려간 공구 끝에 맞춰 놓인다 */
export const TANK_BASE_DEG: Record<TankId, number> = {
  'tank-a1': -60,
  'tank-a2': -25,
  'tank-b1': 25,
  'tank-b2': 60,
};

/** 시연 동작(서버 값이 없을 때의 최후 수단) 한 주기의 길이(초)와 컨베이어 쪽 base 각도, 쉬는 자세 */
export const DEMO_CYCLE = {
  pickSec: 4,
  moveSec: 4,
  placeSec: 3,
  idleSec: 1,
  conveyorBaseDeg: 150,
  home: [0, 10, -20, 0, 10, 0],
} as const;
