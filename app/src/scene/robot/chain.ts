import type { RobotModel } from '@ecocycle/shared';
import { DEFAULT_JOINT_RENDER, DEFAULT_ROBOT_MODEL } from '../../config/robotModel';
import type { JointRender } from '../../config/robotModel';

// 로봇팔의 관절 사슬. 그리기(RobotArm)와 위치 계산(kinematics.ts의 tipPosition)이 같은 정의를 쓰도록 한 곳에 둔다.
// 이 파일은 three.js를 쓰지 않는다 (홈 화면의 메인 묶음에서 가져다 쓴다).
//
//   관절 i의 장면 안 모양: 이전 관절 끝에서 (0, 앞 링크 길이, 0)만큼 위로 간 곳에서 axis 둘레로 sign × (값 − 영점)도 회전하고,
//   그 위로 링크 길이 linkLengths[i]만큼의 팔이 +Y 방향으로 뻗는다. 마지막 링크 끝이 공구 끝이다.
//
// 관절 순서와 각도 범위는 로봇 모델(config/robotModel, 서버 /robots/{id}/model로 덮어씀)을 따른다.

const DEG = Math.PI / 180;

export interface ChainJoint {
  axis: 'x' | 'y' | 'z';
  /** 라디안: sign × (값 − 영점) */
  radians: number;
  /** 이 관절 앞(아래)의 링크 길이 = 이 관절이 올라앉는 높이 */
  offsetY: number;
  /** 이 관절에서 뻗는 링크의 길이 */
  linkLength: number;
}

export interface ChainSpec {
  /** 관절 하나의 렌더 정의 */
  render: readonly JointRender[];
  lengths: readonly number[];
  zeroDeg: readonly number[];
}

/** 서버 모델과 기본 렌더 정의로 사슬 정의를 만든다. 관절 수가 맞지 않으면 기본 모델을 쓴다. */
export function chainSpecFor(model: RobotModel = DEFAULT_ROBOT_MODEL, render: readonly JointRender[] = DEFAULT_JOINT_RENDER): ChainSpec {
  const usable =
    model.joints.length > 0 && model.linkLengthsM.length >= model.joints.length && render.length >= model.joints.length;
  const m = usable ? model : DEFAULT_ROBOT_MODEL;
  return {
    render: render.slice(0, m.joints.length),
    lengths: m.linkLengthsM.slice(0, m.joints.length),
    zeroDeg: m.joints.map((j) => j.zeroDeg),
  };
}

/** 관절 값(도) 목록 → 관절별 회전·위치 (값이 모자라면 영점으로 본다) */
export function chainJoints(spec: ChainSpec, jointsDeg: readonly number[]): ChainJoint[] {
  return spec.render.map((r, i) => {
    const value = jointsDeg[i] ?? spec.zeroDeg[i] ?? 0;
    return {
      axis: r.axis,
      radians: r.sign * (value - (spec.zeroDeg[i] ?? 0)) * DEG,
      offsetY: i === 0 ? 0 : (spec.lengths[i - 1] ?? 0),
      linkLength: spec.lengths[i] ?? 0,
    };
  });
}
