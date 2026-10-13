import type { DeviceId, TankId } from '@ecocycle/shared';

// 3D 홈 장면의 배치와 치수. 길이 단위는 m(장면 단위), 각도 단위는 도.
// 장면 구성: 벽 두 면을 둔 방 안에 탱크 4개(A1, A2, B1, B2), 중앙 로봇팔, 로봇 뒤에서 압축기까지 이어지는 컨베이어 하나(Section Z), 압축기.
// 장면 구성이 바뀌면(명세 7절 "장면 구성" 가정) 이 파일만 고친다. 위치 계산은 scene/layout.ts가 한다.

export const ROOM = {
  minX: -8.2,
  maxX: 2.6,
  minZ: -2.6,
  maxZ: 1.9,
  wallHeight: 2.6,
  wallThickness: 0.15,
} as const;

/** 로봇 받침대와 팔 */
export const ROBOT = {
  position: [0, 0, 0] as const,
  pedestalHeight: 0.9,
  pedestalRadius: 0.5,
  /**
   * 로봇 관절 값의 0도가 장면에서 가리키는 방향(+X 기준)을 돌리는 각. 모의 서버의 탱크 쪽 관절 값(-60~60도)과
   * 컨베이어 쪽 관절 값(150도)이 장면에서 보기 좋게 놓이도록 정한 값이다. 실제 로봇이 정해지면 다시 맞춘다.
   */
  yawOffsetDeg: 30,
} as const;

/** 탱크가 놓이는 곳은 로봇이 집으러 가는 관절 값(아래)에서 계산한다. 이 각도는 서버의 `base` 관절 값이다. */
export const TANK_BASE_DEG: Record<TankId, number> = {
  'tank-a1': -60,
  'tank-a2': -25,
  'tank-b1': 25,
  'tank-b2': 60,
};

export const TANK = {
  radius: 0.4,
  height: 1.3,
  wallThickness: 0.05,
} as const;

/** 컨베이어: 로봇 뒤쪽(-X)으로 길게 이어져 압축기에서 끝난다. */
export const CONVEYOR = {
  startX: -1.2,
  endX: -5.6,
  z: 0,
  width: 0.7,
  /** 벨트 윗면 높이. 로봇이 내려놓는 높이(약 1.44m) 바로 아래여야 한다 */
  topY: 1.3,
  thickness: 0.18,
  legSpacing: 1.4,
} as const;

export const COMPRESSOR = {
  x: -6.9,
  z: 0,
  width: 1.8,
  depth: 1.6,
  height: 1.7,
} as const;

/** 로봇이 집기·놓기를 할 때의 관절 값. 모의 서버(mock-server/src/sim/robot.ts)와 같은 값이어야 시연 동작이 서버와 비슷하다. */
export const DEMO_CYCLE = {
  pickSec: 4,
  moveSec: 4,
  placeSec: 3,
  idleSec: 1,
  conveyorBaseDeg: 150,
  home: [0, 10, -20, 0, 10, 0],
} as const;

/** 핀이 붙는 높이(장면 단위). 장면 위에 올리는 HTML 핀의 기준점 */
export const PIN_HEIGHT: Record<'tank' | 'robot' | 'conveyor' | 'compressor', number> = {
  tank: 1.7,
  robot: 3.0,
  conveyor: 1.9,
  compressor: 2.3,
};

/** 기기를 눌렀을 때 카메라가 확대하는 정도(전체 보기 대비 배율) */
export const FOCUS_ZOOM: Record<'tank' | 'robot' | 'conveyor' | 'compressor', number> = {
  tank: 2.4,
  robot: 2.0,
  conveyor: 1.7,
  compressor: 2.2,
};

/** 아이소메트릭 카메라가 보는 방향 (회전·핀치 확대 없음, 고정) */
export const CAMERA = {
  /**
   * 장면 중심에서 카메라까지의 방향(길이는 상관없음). 탱크 네 개가 화면에서 좌우로 펼쳐져 보이는 쪽(-Z)에서 본다.
   * 벽은 카메라 반대쪽 두 면에만 세운다 (scene/objects/Room).
   */
  direction: [1, 0.95, -1] as const,
  distance: 30,
  /** 전체 보기에서 방이 화면에 꽉 차지 않게 두는 여백 비율 */
  margin: 0.92,
  /** 카메라가 이동하는 속도 (클수록 빠르다, 초당 비율) */
  damping: 7,
} as const;

export const BELT = { speedMps: 0.35 } as const;

export const DEVICE_ORDER: readonly DeviceId[] = [
  'tank-a1',
  'tank-a2',
  'tank-b1',
  'tank-b2',
  'robot-1',
  'conveyor-z',
  'compressor-1',
];
