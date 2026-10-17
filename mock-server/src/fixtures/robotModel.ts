import type { RobotModel } from '@ecocycle/shared';

// 범용 6축 로봇팔 가정 값 (docs/decisions.md, 질문 B5). 실제 기종이 정해지면 서버 값으로 대체된다.
export const ROBOT_MODEL: RobotModel = {
  deviceId: 'robot-1',
  axisCount: 6,
  joints: [
    { name: 'base', minDeg: -170, maxDeg: 170, zeroDeg: 0 },
    { name: 'shoulder', minDeg: -90, maxDeg: 90, zeroDeg: 0 },
    { name: 'elbow', minDeg: -135, maxDeg: 135, zeroDeg: 0 },
    { name: 'wrist1', minDeg: -180, maxDeg: 180, zeroDeg: 0 },
    { name: 'wrist2', minDeg: -120, maxDeg: 120, zeroDeg: 0 },
    { name: 'wrist3', minDeg: -360, maxDeg: 360, zeroDeg: 0 },
  ],
  linkLengthsM: [0.35, 0.8, 0.7, 0.2, 0.15, 0.1],
};
