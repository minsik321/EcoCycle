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
 * 관절별 3D 그리기 정의 (장면은 Y가 위). 서버 모델에는 없는 앱 쪽 가정이고 관절 순서는 모델의 `joints` 순서와 같다.
 *   axis: 회전축, sign: 관절 값이 커질 때 도는 방향(1 또는 -1). 그릴 때 sign × (값 − 영점)도만큼 돈다.
 * 기본값은 범용 6축: 밑동 좌우 회전(Y), 어깨·팔꿈치 앞뒤 기울기(Z), 손목1 비틀기(Y), 손목2 기울기(Z), 손목3 비틀기(Y).
 * 어깨는 값이 커질수록 앞으로 기울고, 팔꿈치·손목2는 값이 커질수록 앞쪽 팔이 아래로 접힌다.
 * 실제 로봇의 축 방향과 다르면(질문 B5) 이 표를 고친다.
 */
export interface JointRender {
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
}

export const DEFAULT_JOINT_RENDER: readonly JointRender[] = [
  { axis: 'y', sign: 1 },
  { axis: 'z', sign: -1 },
  { axis: 'z', sign: 1 },
  { axis: 'y', sign: 1 },
  { axis: 'z', sign: 1 },
  { axis: 'y', sign: 1 },
];

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
