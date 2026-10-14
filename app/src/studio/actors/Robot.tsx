import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group } from 'three';
import type { ChainSpec } from '../robot/chain';
import { emptySample } from '../robot/jointSource';
import type { JointSource } from '../robot/jointSource';
import type { Director } from '../sim/director';
import { C } from '../theme';
import { Kit, disposeTree } from '../three/kit';
import { useWaker } from '../three/motion';
import { ROBOT } from '../world/layout';
import { buildLump } from './build';

// 로봇팔. 그리기는 입력과 분리되어 있다: 기존 JointSource(실시간·시연·정지)에서 관절 값을 읽어 마디를 돌리기만 한다.
// 연결이 끊기면(frozen) 값을 새로 읽지 않아 마지막 자세로 멈춘다.

const DEG = Math.PI / 180;
const THICK = [0.36, 0.25, 0.2, 0.15, 0.13, 0.1];
const FINGER_OPEN = 0.1;
const FINGER_CLOSED = 0.05;

interface Built {
  root: Group;
  joints: Group[];
  fingerA: Group;
  fingerB: Group;
  lump: Group;
}

function build(spec: ChainSpec): Built {
  const root = new Group();
  // 받침대
  const p = new Kit('clay');
  p.box(C.concreteDark, [1.7, 0.1, 1.7], [0, 0.06, 0], { r: 0.045, seg: 3 });
  p.cyl(C.wall, [0.5, ROBOT.pedestalR], ROBOT.pedestalH - 0.24, [0, 0.16, 0], { seg: 32, mat: 'gloss' });
  p.cyl(C.blue, 0.53, 0.07, [0, ROBOT.pedestalH - 0.2, 0], { seg: 32, mat: 'gloss' });
  p.cyl(C.yellowDeep, 0.5, 0.08, [0, ROBOT.pedestalH - 0.08, 0], { seg: 32, mat: 'gloss' });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    p.cyl(C.dark, 0.04, 0.03, [Math.cos(a) * 0.72, 0.16, Math.sin(a) * 0.72], { seg: 8 });
  }
  root.add(p.build('robot-pedestal'));

  const arm = new Group();
  arm.position.y = ROBOT.pedestalH;
  arm.scale.setScalar(ROBOT.scale);
  root.add(arm);

  const joints: Group[] = [];
  let parent: Group = arm;
  spec.render.forEach((render, i) => {
    const joint = new Group();
    joint.position.y = i === 0 ? 0 : (spec.lengths[i - 1] ?? 0);
    const length = spec.lengths[i] ?? 0;
    const t = THICK[i] ?? 0.1;
    const k = new Kit('gloss');
    if (render.axis === 'y') {
      // 비트는 마디: 굵은 고리 + 원통 팔
      k.cyl(C.dark, t * 0.66, t * 0.36, [0, -t * 0.06, 0], { seg: 24, mat: 'clay' });
      k.cyl(C.yellow, i === 0 ? t * 0.74 : t * 0.5, length, [0, 0, 0], { seg: 24 });
      if (i === 0) k.cyl(C.yellowDeep, t * 0.8, 0.06, [0, length - 0.07, 0], { seg: 24 });
    } else {
      // 꺾이는 마디: 옆으로 누운 원통 + 둥근 팔
      k.cyl(C.dark, t * 0.62, t * 1.3, [0, 0, 0], { axis: 'z', seg: 24, mat: 'clay' });
      k.cyl(C.blue, t * 0.4, t * 1.38, [0, 0, 0], { axis: 'z', seg: 20 });
      k.box(C.yellow, [t * 0.86, length + t * 0.3, t * 0.78], [0, -t * 0.15, 0], { r: t * 0.3, seg: 4 });
      if (length > 0.5) {
        // 케이블과 덮개
        k.cyl(C.dark, t * 0.09, length * 0.8, [-t * 0.5, length * 0.1, 0], { seg: 8, mat: 'clay' });
        k.box(C.yellowDeep, [t * 0.9, length * 0.34, t * 0.84], [0, length * 0.33, 0], { r: t * 0.2, seg: 3 });
      }
    }
    joint.add(k.build());
    parent.add(joint);
    joints.push(joint);
    parent = joint;
  });

  // 집게
  const tool = new Group();
  tool.position.y = spec.lengths[spec.lengths.length - 1] ?? 0;
  const palm = new Kit('clay');
  palm.box(C.dark, [0.3, 0.06, 0.16], [0, 0, 0], { r: 0.02 });
  tool.add(palm.build());
  const finger = (): Group => {
    const k = new Kit('metal');
    k.box(C.steel, [0.035, 0.22, 0.12], [0, 0.04, 0], { r: 0.012 });
    k.box(C.dark, [0.045, 0.05, 0.13], [0, 0.23, 0], { r: 0.012, mat: 'clay' });
    return k.build();
  };
  const fingerA = finger();
  const fingerB = finger();
  fingerA.position.x = FINGER_OPEN;
  fingerB.position.x = -FINGER_OPEN;
  const lump = buildLump(2);
  lump.position.y = 0.1;
  lump.scale.setScalar(0.62);
  lump.visible = false;
  tool.add(fingerA, fingerB, lump);
  parent.add(tool);

  return { root, joints, fingerA, fingerB, lump };
}

function poseKey(joints: ArrayLike<number>, holding: boolean): number {
  let k = holding ? 0.5 : 0;
  for (let i = 0; i < joints.length; i += 1) k += (joints[i] ?? 0) * (i + 1.37);
  return k;
}

export interface RobotProps {
  spec: ChainSpec;
  source: JointSource;
  frozen: boolean;
  director: Director;
  onSelect: (key: string) => void;
}

export function Robot({ spec, source, frozen, director, onSelect }: RobotProps) {
  const built = useMemo(() => build(spec), [spec]);
  const sample = useMemo(emptySample, []);
  const peek = useMemo(emptySample, []);
  /** 마지막으로 그린 자세 (관절 값의 합). 새 값이 이와 다르면 한 장 더 그린다 */
  const drawnKey = useRef(Number.NaN);
  const posed = useRef(false);
  const holding = useRef(false);
  useEffect(() => () => disposeTree(built.root), [built]);

  useFrame(() => {
    // 끊긴 동안에는 자세를 바꾸지 않는다. 한 번도 못 그렸으면 마지막 값으로 한 번만 놓는다
    if (frozen && posed.current) return;
    if (!source.read(Date.now(), sample)) return;
    posed.current = true;
    spec.render.forEach((render, i) => {
      const joint = built.joints[i];
      if (!joint) return;
      const zero = spec.zeroDeg[i] ?? 0;
      joint.rotation[render.axis] = render.sign * ((sample.joints[i] ?? zero) - zero) * DEG;
    });
    const gap = sample.gripper.closed ? FINGER_CLOSED : FINGER_OPEN;
    built.fingerA.position.x += (gap - built.fingerA.position.x) * 0.35;
    built.fingerB.position.x = -built.fingerA.position.x;
    built.lump.visible = sample.gripper.holding;
    // 놓는 순간(놓기 단계에서 잡고 있다가 놓음) 컨베이어 위에 뭉치가 생긴다
    if (holding.current && !sample.gripper.holding && sample.phase !== 'pick' && !frozen) director.robotReleased();
    holding.current = sample.gripper.holding;
    drawnKey.current = poseKey(sample.joints, sample.gripper.holding);
  });

  // 필요할 때만 그리기: 관절 값이 마지막으로 그린 자세와 다르거나 손가락이 아직 움직이는 중이면 깨운다
  useWaker(() => {
    if (frozen && posed.current) return false;
    if (!source.read(Date.now(), peek)) return false;
    const gap = peek.gripper.closed ? FINGER_CLOSED : FINGER_OPEN;
    return poseKey(peek.joints, peek.gripper.holding) !== drawnKey.current || Math.abs(gap - built.fingerA.position.x) > 0.001;
  });

  return (
    <primitive
      object={built.root}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect('dev:robot-1');
      }}
    />
  );
}
