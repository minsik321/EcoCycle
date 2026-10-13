import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Group, Mesh } from 'three';
import { ROBOT } from '../../config/sceneLayout';
import { GEOMETRY, MATERIALS } from '../materials';
import type { ChainSpec } from '../robot/chain';
import { emptySample } from '../robot/jointSource';
import type { JointSource } from '../robot/jointSource';

const DEG = Math.PI / 180;
/** 링크 굵기: 밑동에서 끝으로 갈수록 가늘다 */
const THICKNESS = [0.34, 0.18, 0.15, 0.12, 0.1, 0.08];
const FINGER_OPEN = 0.09;
const FINGER_CLOSED = 0.045;
const BALE = 0.2;

export interface RobotArmProps {
  /** 관절 순서·회전축·링크 길이 (config/robotModel, 서버 모델로 덮어씀) */
  spec: ChainSpec;
  /** 관절 값을 주는 곳. 바꿔도 그리기 코드는 그대로다 */
  source: JointSource;
  /** 연결이 끊겼다: 관절 값을 새로 읽지 않고 마지막 자세로 멈춘다 */
  frozen: boolean;
  onSelect: () => void;
}

/**
 * 로봇팔. 입력(JointSource)에서 관절 각도·그리퍼를 받아 그리기만 한다.
 * 매 프레임 관절 그룹의 회전만 바꾸고 새 객체를 만들지 않는다. 값이 없으면 마지막 자세를 유지한다
 * (연결이 끊기면 그 자세로 멈춘다. 추측으로 움직이지 않는다).
 */
export function RobotArm({ spec, source, frozen, onSelect }: RobotArmProps) {
  const joints = useRef<Array<Group | null>>([]);
  const fingerA = useRef<Mesh>(null);
  const fingerB = useRef<Mesh>(null);
  const bale = useRef<Mesh>(null);
  const sample = useMemo(emptySample, []);
  const posed = useRef(false);

  const apply = () => {
    // 끊긴 동안에는 다시 그려지더라도(카메라 이동 등) 자세를 바꾸지 않는다. 한 번도 못 그렸으면 마지막 값으로 한 번만 놓는다
    if (frozen && posed.current) return;
    if (!source.read(Date.now(), sample)) return;
    posed.current = true;
    for (let i = 0; i < spec.render.length; i += 1) {
      const group = joints.current[i];
      const render = spec.render[i];
      if (!group || !render) continue;
      const zero = spec.zeroDeg[i] ?? 0;
      group.rotation[render.axis] = render.sign * ((sample.joints[i] ?? zero) - zero) * DEG;
    }
    const gap = sample.gripper.closed ? FINGER_CLOSED : FINGER_OPEN;
    if (fingerA.current) fingerA.current.position.x = gap;
    if (fingerB.current) fingerB.current.position.x = -gap;
    if (bale.current) bale.current.visible = sample.gripper.holding;
  };

  useLayoutEffect(apply);
  useFrame(apply);

  // 관절 사슬을 안쪽으로 겹쳐 만든다: 관절 i 안에 링크 i와 관절 i+1이 들어 있다
  const build = (i: number): ReactNode => {
    if (i >= spec.render.length) {
      return (
        <group position={[0, spec.lengths[spec.lengths.length - 1] ?? 0, 0]}>
          <mesh ref={fingerA} geometry={GEOMETRY.box} material={MATERIALS.gripper} position={[FINGER_OPEN, 0.07, 0]} scale={[0.035, 0.16, 0.09]} />
          <mesh ref={fingerB} geometry={GEOMETRY.box} material={MATERIALS.gripper} position={[-FINGER_OPEN, 0.07, 0]} scale={[0.035, 0.16, 0.09]} />
          <mesh ref={bale} geometry={GEOMETRY.box} material={MATERIALS.bale} position={[0, 0.16, 0]} scale={[BALE, BALE, BALE]} visible={false} />
        </group>
      );
    }
    const length = spec.lengths[i] ?? 0;
    const thick = THICKNESS[i] ?? 0.08;
    return (
      <group
        ref={(group) => {
          joints.current[i] = group;
        }}
        position={[0, i === 0 ? 0 : (spec.lengths[i - 1] ?? 0), 0]}
      >
        {/* 관절(어두운 마디)과 링크(주황 팔) */}
        <mesh geometry={GEOMETRY.cylinder} material={MATERIALS.robotJoint} rotation={[Math.PI / 2, 0, 0]} scale={[thick * 0.62, thick * 1.15, thick * 0.62]} />
        <mesh geometry={GEOMETRY.box} material={MATERIALS.robotArm} position={[0, length / 2, 0]} scale={[thick, length, thick]} />
        {build(i + 1)}
      </group>
    );
  };

  return (
    <group
      position={[ROBOT.position[0], 0, ROBOT.position[2]]}
      // 장면에서 키워 그리는 배율 (링크 길이는 모델 값 그대로다)
      scale={ROBOT.scale}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh geometry={GEOMETRY.cylinder} material={MATERIALS.pedestal} position={[0, ROBOT.pedestalHeight / 2, 0]} scale={[ROBOT.pedestalRadius, ROBOT.pedestalHeight, ROBOT.pedestalRadius]} />
      {/* 받침대 위에서 사슬이 시작한다. 장면 방향 보정은 여기서 한 번만 준다 */}
      <group position={[0, ROBOT.pedestalHeight, 0]} rotation={[0, ROBOT.yawOffsetDeg * DEG, 0]}>
        {build(0)}
      </group>
    </group>
  );
}
