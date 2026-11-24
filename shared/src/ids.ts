// 기기 ID는 고정이다 (명세 "공통 규칙"). 새 기기가 생기면 명세 → 여기 순서로 고친다.

// 섹터 = 노천 더미 두 곳(A급·C급). 기기 종류는 예전 이름 그대로 'tank'다 (명세 6절 "섹터 이름").
export const TANK_IDS = ['sector-a', 'sector-c'] as const;
export const ROBOT_IDS = ['robot-1'] as const;
export const CONVEYOR_IDS = ['conveyor-z'] as const;
export const COMPRESSOR_IDS = ['compressor-1'] as const;

export const DEVICE_IDS = [...TANK_IDS, ...ROBOT_IDS, ...CONVEYOR_IDS, ...COMPRESSOR_IDS] as const;

export type TankId = (typeof TANK_IDS)[number];
export type RobotId = (typeof ROBOT_IDS)[number];
export type ConveyorId = (typeof CONVEYOR_IDS)[number];
export type CompressorId = (typeof COMPRESSOR_IDS)[number];
export type DeviceId = (typeof DEVICE_IDS)[number];

export type DeviceType = 'tank' | 'robot' | 'conveyor' | 'compressor';

/** 기기 ID로 기기 종류를 알아낸다 (`sector-a` → `tank`, `robot-1` → `robot`). 상태를 아직 받지 못한 기기에도 쓸 수 있다. */
export function deviceTypeOf(id: DeviceId): DeviceType {
  // 섹터는 ID 앞부분(`sector`)과 기기 종류(`tank`)가 다르므로 목록으로 먼저 가린다
  if ((TANK_IDS as readonly string[]).includes(id)) return 'tank';
  return id.split('-')[0] as Exclude<DeviceType, 'tank'>;
}
