// 기기 ID는 고정이다 (명세 "공통 규칙"). 새 기기가 생기면 명세 → 여기 순서로 고친다.

export const TANK_IDS = ['tank-a1', 'tank-a2', 'tank-b1', 'tank-b2'] as const;
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
