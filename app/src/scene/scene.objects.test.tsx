import ReactThreeTestRenderer from '@react-three/test-renderer';
import type { Group, InstancedMesh, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { QUALITY_PROFILES } from '../config/quality';
import { ROBOT } from '../config/sceneLayout';
import { sectorBay } from './layout';
import { RobotArm } from './objects/RobotArm';
import { Sector } from './objects/Sector';
import { visibleChunkCount } from './objects/chunks';
import { chainSpecFor } from './robot/chain';
import type { JointSource } from './robot/jointSource';

// 장면 물체를 실제 그래픽 없이 만들어 보고(three 객체만) 값이 그리기에 반영되는지 본다.

const DEG = Math.PI / 180;
const spec = chainSpecFor();
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

/** 값을 바꿔 가며 줄 수 있는 관절 입력 */
function mutableSource(initial: number[] | null) {
  const state = { joints: initial, closed: false, holding: false };
  const source: JointSource = {
    kind: 'fixed',
    read(_nowMs, out) {
      if (!state.joints) return false;
      out.joints.length = state.joints.length;
      state.joints.forEach((v, i) => (out.joints[i] = v));
      out.gripper.closed = state.closed;
      out.gripper.holding = state.holding;
      return true;
    },
  };
  return { state, source };
}

/** 로봇팔의 관절 그룹을 밑동부터 차례로 모은다 (관절 i 안에 관절 i+1이 들어 있다) */
function jointGroups(root: Object3D): Group[] {
  const yaw = root.children.find((child) => child.type === 'Group') as Group;
  const groups: Group[] = [];
  let current = yaw.children[0] as Group | undefined;
  while (current && groups.length < spec.render.length) {
    groups.push(current);
    current = current.children.find((child) => child.type === 'Group') as Group | undefined;
  }
  return groups;
}

describe('RobotArm: 입력(JointSource)에서 받은 값을 그대로 그린다', () => {
  it('관절 값이 관절 그룹의 회전에 반영된다 (축과 방향은 config/robotModel)', async () => {
    const { source } = mutableSource([40, 30, -20, 0, 10, 0]);
    const renderer = await ReactThreeTestRenderer.create(<RobotArm spec={spec} source={source} frozen={false} onSelect={() => {}} />);
    const joints = jointGroups(renderer.scene.children[0]!.instance as Object3D);

    expect(joints).toHaveLength(6);
    near(joints[0]!.rotation.y, 40 * DEG);
    near(joints[1]!.rotation.z, -30 * DEG);
    near(joints[2]!.rotation.z, -20 * DEG);
    near(joints[4]!.rotation.z, 10 * DEG);
  });

  it('값이 바뀌면 다음 프레임에 따라간다', async () => {
    const { state, source } = mutableSource([0, 0, 0, 0, 0, 0]);
    const renderer = await ReactThreeTestRenderer.create(<RobotArm spec={spec} source={source} frozen={false} onSelect={() => {}} />);
    const joints = jointGroups(renderer.scene.children[0]!.instance as Object3D);

    state.joints = [90, 0, 0, 0, 0, 0];
    await renderer.advanceFrames(1, 0.033);
    near(joints[0]!.rotation.y, 90 * DEG);
  });

  it('연결이 끊기면 다시 그려져도 마지막 자세에서 멈춘다 (추측으로 움직이지 않는다)', async () => {
    const { state, source } = mutableSource([20, 0, 0, 0, 0, 0]);
    const renderer = await ReactThreeTestRenderer.create(<RobotArm spec={spec} source={source} frozen={false} onSelect={() => {}} />);
    const joints = jointGroups(renderer.scene.children[0]!.instance as Object3D);

    await renderer.update(<RobotArm spec={spec} source={source} frozen onSelect={() => {}} />);
    state.joints = [80, 0, 0, 0, 0, 0];
    await renderer.advanceFrames(3, 0.033);
    near(joints[0]!.rotation.y, 20 * DEG);

    // 복구되면 다시 따라간다
    await renderer.update(<RobotArm spec={spec} source={source} frozen={false} onSelect={() => {}} />);
    await renderer.advanceFrames(1, 0.033);
    near(joints[0]!.rotation.y, 80 * DEG);
  });

  it('아직 값을 못 받았으면 자세를 바꾸지 않는다', async () => {
    const { source } = mutableSource(null);
    const renderer = await ReactThreeTestRenderer.create(<RobotArm spec={spec} source={source} frozen={false} onSelect={() => {}} />);
    const joints = jointGroups(renderer.scene.children[0]!.instance as Object3D);
    await renderer.advanceFrames(2, 0.033);
    joints.forEach((joint) => {
      near(joint.rotation.x, 0);
      near(joint.rotation.y, 0);
      near(joint.rotation.z, 0);
    });
  });
});

describe('Sector: 적재율에 맞춰 보이는 파지 조각 수만 바꾼다', () => {
  const maxChunks = QUALITY_PROFILES.standard.maxChunksPerTank;

  const chunksOf = (root: Object3D) => root.children.find((child) => (child as InstancedMesh).isInstancedMesh) as InstancedMesh;

  it('더미는 InstancedMesh 하나이고 적재율이 바뀌면 개수만 달라진다', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Sector id="tank-a1" fillPercent={50} status="normal" maxChunks={maxChunks} onSelect={() => {}} />);
    const root = renderer.scene.children[0]!.instance as Object3D;
    const chunks = chunksOf(root);
    const slotCount = chunks.instanceMatrix.count;

    expect(root.children.filter((child) => (child as InstancedMesh).isInstancedMesh)).toHaveLength(1);
    expect(slotCount).toBeLessThanOrEqual(maxChunks);
    expect(chunks.count).toBe(visibleChunkCount(50, slotCount));

    await renderer.update(<Sector id="tank-a1" fillPercent={90} status="caution" maxChunks={maxChunks} onSelect={() => {}} />);
    expect(chunksOf(root)).toBe(chunks);
    expect(chunks.count).toBe(visibleChunkCount(90, slotCount));
    expect(chunks.count).toBeGreaterThan(visibleChunkCount(50, slotCount));
  });

  it('비어 있으면 조각을 그리지 않고, 화질 모드의 상한을 넘지 않는다', async () => {
    const low = QUALITY_PROFILES.low.maxChunksPerTank;
    const renderer = await ReactThreeTestRenderer.create(<Sector id="tank-b2" fillPercent={0} status="normal" maxChunks={low} onSelect={() => {}} />);
    const chunks = chunksOf(renderer.scene.children[0]!.instance as Object3D);
    expect(chunks.count).toBe(0);

    await renderer.update(<Sector id="tank-b2" fillPercent={100} status="alarm" maxChunks={low} onSelect={() => {}} />);
    expect(chunks.count).toBeGreaterThan(0);
    expect(chunks.count).toBeLessThanOrEqual(low);
  });

  it('칸은 설정한 자리(섹터 칸 한가운데)에 놓인다', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Sector id="tank-b1" fillPercent={10} status="normal" maxChunks={maxChunks} onSelect={() => {}} />);
    const root = renderer.scene.children[0]!.instance as Object3D;
    const bay = sectorBay('tank-b1');
    near(root.position.x, (bay.minX + bay.maxX) / 2);
    near(root.position.z, (bay.minZ + bay.maxZ) / 2);
  });
});

describe('RobotArm: 장면에서 키워 그린다', () => {
  it('배율은 받침대와 팔 전체에 한 번만 곱한다 (관절 값은 그대로)', async () => {
    const { source } = mutableSource([40, 0, 0, 0, 0, 0]);
    const renderer = await ReactThreeTestRenderer.create(<RobotArm spec={spec} source={source} frozen={false} onSelect={() => {}} />);
    const root = renderer.scene.children[0]!.instance as Object3D;
    near(root.scale.x, ROBOT.scale);
    near(root.scale.y, ROBOT.scale);
    near(jointGroups(root)[0]!.rotation.y, 40 * DEG);
  });
});
