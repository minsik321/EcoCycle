import { Matrix4, Vector3 } from 'three';
import { chainJoints } from './chain';
import type { ChainSpec } from './chain';

// 공구 끝 위치 계산 (three.js 사용). 3D 홈 배치(studio/world/layout)와 테스트가 쓴다.
// three.js가 필요 없는 사슬 정의(chain.ts)와 나눠 두어, 홈 화면의 메인 묶음에 three.js가 들어가지 않게 한다.

const DEG = Math.PI / 180;
const AXES = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) } as const;

/**
 * 공구 끝의 위치 (로봇 받침대 위 기준점에서 본 장면 좌표, 로봇 방향 yawDeg를 반영). 탱크·컨베이어를 놓을 위치를 정하는 데 쓴다.
 * 매 프레임 쓰지 않는다(새 객체를 만든다).
 */
export function tipPosition(spec: ChainSpec, jointsDeg: readonly number[], yawOffsetDeg = 0): Vector3 {
  const m = new Matrix4().makeRotationY(yawOffsetDeg * DEG);
  const step = new Matrix4();
  const joints = chainJoints(spec, jointsDeg);
  for (const j of joints) {
    m.multiply(step.makeTranslation(0, j.offsetY, 0));
    m.multiply(step.makeRotationAxis(AXES[j.axis], j.radians));
  }
  const last = joints[joints.length - 1];
  return new Vector3(0, last?.linkLength ?? 0, 0).applyMatrix4(m);
}
