import type { RobotModel } from '@ecocycle/shared';

// 범용 6축 로봇팔 가정 값 (docs/decisions.md, 질문 B5). 실제 기종이 정해지면 서버 `/robots/{id}/model` 값으로 덮어쓴다.
// 구조가 크게 다른 로봇(굴착기형 등)이면 설정만으로 해결하지 말고 scene/objects/RobotArm을 새로 만든다.
// 단위: 각도는 도, 길이는 m.

export const DEFAULT_ROBOT_MODEL: RobotModel = {
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

/**
 * 관절별 회전축 (3D 장면용, 2단계에서 사용). 서버 모델에는 없는 앱 쪽 가정이다.
 * 관절 순서는 모델의 `joints` 순서와 같다.
 */
export const DEFAULT_JOINT_AXES: ReadonlyArray<'x' | 'y' | 'z'> = ['z', 'y', 'y', 'x', 'y', 'x'];

/**
 * 서버가 준 모델로 기본값을 덮어쓴다. 서버 값이 없거나 축 수와 관절 목록이 맞지 않으면 기본값을 그대로 쓴다.
 */
export function mergeRobotModel(base: RobotModel, fromServer?: RobotModel | null): RobotModel {
  if (!fromServer) return base;
  const consistent =
    fromServer.axisCount > 0 &&
    fromServer.joints.length === fromServer.axisCount &&
    fromServer.linkLengthsM.length > 0;
  return consistent ? fromServer : base;
}
