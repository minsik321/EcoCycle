import { describe, expect, it } from 'vitest';
import { DEVICE_IDS, TANK_IDS } from '@ecocycle/shared';
import type { RobotJointsMessage, RobotModel } from '@ecocycle/shared';
import { QUALITY_PROFILES } from '../config/quality';
import { DEFAULT_ROBOT_MODEL } from '../config/robotModel';
import { COMPRESSOR, CONVEYOR, DEMO_CYCLE, ROBOT, ROOM, TANK, TANK_BASE_DEG } from '../config/sceneLayout';
import { createJointBuffer } from '../realtime';
import { OVERVIEW, baseZoom, cameraPresetFor, deviceAnchor, downPose, placeTip, robotBaseY, tankPosition } from './layout';
import { chunkSlots, visibleChunkCount } from './objects/chunks';
import { chainJoints, chainSpecFor } from './robot/chain';
import { tipPosition } from './robot/kinematics';
import { demoPose, demoSource, fixedSource, liveSource, sampleOf } from './robot/jointSource';

const spec = chainSpecFor();
const L = DEFAULT_ROBOT_MODEL.linkLengthsM;
const total = L.reduce((a, b) => a + b, 0);
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('로봇팔 관절 사슬 (그리기와 위치 계산이 함께 쓰는 정의)', () => {
  it('모든 관절이 0도이면 곧게 위로 선다', () => {
    const tip = tipPosition(spec, [0, 0, 0, 0, 0, 0]);
    near(tip.x, 0);
    near(tip.z, 0);
    near(tip.y, total);
  });

  it('어깨를 90도 숙이면 앞(+X)으로 수평하게 뻗는다', () => {
    const tip = tipPosition(spec, [0, 90, 0, 0, 0, 0]);
    near(tip.x, total - L[0]!);
    near(tip.y, L[0]!);
    near(tip.z, 0);
  });

  it('밑동을 90도 돌리면 팔이 -Z 쪽을 향한다 (Y축 둘레 회전)', () => {
    const tip = tipPosition(spec, [90, 90, 0, 0, 0, 0]);
    near(tip.x, 0);
    near(tip.z, -(total - L[0]!));
  });

  it('팔꿈치·손목2는 값이 커지면 앞쪽 팔이 아래로 접힌다 (모의 서버의 집기 자세는 팔꿈치가 음수라 펴진다)', () => {
    const straight = tipPosition(spec, [0, 45, 0, 0, 0, 0]);
    const bentDown = tipPosition(spec, [0, 45, -70, 0, 25, 0]);
    expect(bentDown.y).toBeLessThan(straight.y);
  });

  it('집기 자세의 공구 끝은 손으로 계산한 값과 같다 (반지름 약 1.63m, 높이 약 0.54m)', () => {
    const tip = tipPosition(spec, downPose(0));
    near(tip.x, 0.8 * Math.sin(Math.PI / 4) + 0.9 * Math.sin((115 * Math.PI) / 180) + 0.25, 1e-9);
    near(tip.y, 0.35 + 0.8 * Math.cos(Math.PI / 4) + 0.9 * Math.cos((115 * Math.PI) / 180), 1e-9);
    expect(tip.x).toBeCloseTo(1.632, 2);
    expect(tip.y).toBeCloseTo(0.535, 2);
  });

  it('마지막 비틀기(손목3)는 공구 끝 위치를 바꾸지 않는다', () => {
    const a = tipPosition(spec, [10, 30, -40, 0, 20, 0]);
    const b = tipPosition(spec, [10, 30, -40, 0, 20, -120]);
    near(a.distanceTo(b), 0);
  });

  it('손목1을 비틀면 그 뒤 손목2가 접히는 방향이 바뀐다 (손목2가 곧으면 영향이 없다)', () => {
    const bent = tipPosition(spec, [10, 30, -40, 0, 20, 0]).distanceTo(tipPosition(spec, [10, 30, -40, 77, 20, 0]));
    expect(bent).toBeGreaterThan(0.05);
    const straight = tipPosition(spec, [10, 30, -40, 0, 0, 0]).distanceTo(tipPosition(spec, [10, 30, -40, 77, 0, 0]));
    near(straight, 0);
  });

  it('장면 방향 보정(yaw)은 밑동 각도에 더해진다', () => {
    const a = tipPosition(spec, downPose(-60), 30);
    const b = tipPosition(spec, downPose(-30), 0);
    near(a.distanceTo(b), 0);
  });

  it('영점이 있으면 값에서 영점을 뺀 만큼만 돈다', () => {
    const model: RobotModel = { ...DEFAULT_ROBOT_MODEL, joints: DEFAULT_ROBOT_MODEL.joints.map((j, i) => (i === 1 ? { ...j, zeroDeg: 90 } : j)) };
    const tip = tipPosition(chainSpecFor(model), [0, 90, 0, 0, 0, 0]);
    near(tip.y, total); // 어깨 값 90이 영점이므로 곧게 선 자세
  });

  it('관절 값이 모자라면 영점으로 보고, 관절 수가 맞지 않는 모델은 기본 모델로 그린다', () => {
    expect(chainJoints(spec, [10])).toHaveLength(6);
    expect(chainJoints(spec, [10])[1]!.radians).toBeCloseTo(0, 12);
    const broken: RobotModel = { ...DEFAULT_ROBOT_MODEL, linkLengthsM: [0.3] };
    expect(chainSpecFor(broken).lengths).toEqual(DEFAULT_ROBOT_MODEL.linkLengthsM);
  });

  it('관절마다 앞 링크 길이만큼 올라앉는다', () => {
    const joints = chainJoints(spec, [0, 0, 0, 0, 0, 0]);
    expect(joints.map((j) => j.offsetY)).toEqual([0, ...L.slice(0, 5)]);
    expect(joints.map((j) => j.linkLength)).toEqual(L);
  });
});

describe('장면 배치', () => {
  const tanks = TANK_IDS.map((id) => ({ id, p: tankPosition(id) }));

  it('탱크는 로봇이 집으러 가는 자리(집기 자세의 공구 끝 아래)에 놓인다', () => {
    for (const { id, p } of tanks) {
      const tip = tipPosition(spec, downPose(TANK_BASE_DEG[id]), ROBOT.yawOffsetDeg);
      near(p[0], tip.x);
      near(p[2], tip.z);
      // 공구 끝이 탱크 입구 바로 위에 온다 (입구보다 조금 높고 너무 뜨지 않는다)
      const gap = tip.y + robotBaseY - TANK.height;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(0.4);
    }
  });

  it('탱크끼리 겹치지 않고, 로봇 받침대와도 겹치지 않으며, 방 안에 있다', () => {
    for (let i = 0; i < tanks.length; i += 1) {
      for (let j = i + 1; j < tanks.length; j += 1) {
        const d = Math.hypot(tanks[i]!.p[0] - tanks[j]!.p[0], tanks[i]!.p[2] - tanks[j]!.p[2]);
        expect(d, `${tanks[i]!.id}~${tanks[j]!.id}`).toBeGreaterThan(TANK.radius * 2);
      }
      const [x, , z] = tanks[i]!.p;
      expect(Math.hypot(x, z)).toBeGreaterThan(TANK.radius + ROBOT.pedestalRadius);
      expect(x - TANK.radius).toBeGreaterThan(ROOM.minX);
      expect(x + TANK.radius).toBeLessThan(ROOM.maxX);
      expect(z - TANK.radius).toBeGreaterThan(ROOM.minZ);
      expect(z + TANK.radius).toBeLessThan(ROOM.maxZ);
    }
  });

  it('놓기 자세의 공구 끝은 컨베이어 시작 쪽 벨트 바로 위에 온다', () => {
    const [x, y, z] = placeTip();
    expect(Math.abs(z - CONVEYOR.z)).toBeLessThan(CONVEYOR.width / 2);
    expect(x).toBeLessThan(CONVEYOR.startX); // 벨트 위
    expect(x).toBeGreaterThan(CONVEYOR.endX);
    expect(y - CONVEYOR.topY).toBeGreaterThan(0);
    expect(y - CONVEYOR.topY).toBeLessThan(0.4);
  });

  it('컨베이어는 로봇에서 압축기까지 이어지고 모두 방 안에 있다', () => {
    expect(CONVEYOR.endX).toBeLessThan(CONVEYOR.startX);
    expect(COMPRESSOR.x + COMPRESSOR.width / 2).toBeLessThanOrEqual(CONVEYOR.endX + 0.5);
    expect(COMPRESSOR.x - COMPRESSOR.width / 2).toBeGreaterThan(ROOM.minX);
  });

  it('모든 기기에 카메라 위치와 핀 자리가 있고, 핀은 기기 위에 있다', () => {
    for (const id of DEVICE_IDS) {
      const { center, pin } = deviceAnchor(id);
      expect(pin[1]).toBeGreaterThan(center[1]);
      expect(cameraPresetFor(id).zoom).toBeGreaterThan(1);
      expect(cameraPresetFor(id).center).toEqual(center);
    }
    expect(cameraPresetFor(null)).toBe(OVERVIEW);
  });

  it('전체 보기는 화면 크기에 맞춰 방이 들어가게 확대를 정한다', () => {
    const wide = baseZoom(1200, 600);
    const tall = baseZoom(600, 1200);
    expect(wide).toBeGreaterThan(0);
    expect(baseZoom(2400, 1200)).toBeCloseTo(wide * 2, 5);
    expect(tall).toBeLessThan(wide); // 좁은 화면에서는 더 작게
  });
});

describe('탱크의 파지 조각', () => {
  const inner = TANK.radius - TANK.wallThickness;

  it.each(Object.entries(QUALITY_PROFILES))('%s 화질: 조각 수는 상한을 넘지 않고 모두 탱크 안에 있다', (_mode, q) => {
    const slots = chunkSlots(inner, TANK.height - 0.1, 0.16, q.maxChunksPerTank);
    expect(slots.length).toBeGreaterThan(8);
    expect(slots.length).toBeLessThanOrEqual(q.maxChunksPerTank);
    for (const s of slots) {
      expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(inner);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(TANK.height);
    }
  });

  it('아래층부터 순서대로라서 앞에서부터 보이면 수위가 차오른다', () => {
    const slots = chunkSlots(inner, TANK.height - 0.1, 0.16, 96);
    for (let i = 1; i < slots.length; i += 1) expect(slots[i]!.y).toBeGreaterThanOrEqual(slots[i - 1]!.y);
  });

  it('같은 입력이면 항상 같은 배치다 (다시 그릴 때 조각이 튀지 않는다)', () => {
    expect(chunkSlots(inner, 1.2, 0.16, 96)).toEqual(chunkSlots(inner, 1.2, 0.16, 96));
  });

  it('수위에 맞춰 보이는 조각 수를 정한다', () => {
    expect(visibleChunkCount(0, 80)).toBe(0);
    expect(visibleChunkCount(50, 80)).toBe(40);
    expect(visibleChunkCount(100, 80)).toBe(80);
    expect(visibleChunkCount(140, 80)).toBe(80);
    expect(visibleChunkCount(-5, 80)).toBe(0);
    expect(visibleChunkCount(Number.NaN, 80)).toBe(0);
  });

  it('저사양 화질은 조각이 더 적다', () => {
    expect(QUALITY_PROFILES.low.maxChunksPerTank).toBeLessThan(QUALITY_PROFILES.standard.maxChunksPerTank);
    expect(QUALITY_PROFILES.low.maxFps).toBeLessThanOrEqual(QUALITY_PROFILES.standard.maxFps);
    expect(QUALITY_PROFILES.standard.maxFps).toBeLessThanOrEqual(30); // 명세: 초당 30프레임 이하
  });
});

describe('관절 입력 (JointSource): 그리기와 분리', () => {
  it('fixed는 정해진 자세로 서 있다', () => {
    const s = fixedSource();
    expect(s.kind).toBe('fixed');
    expect(sampleOf(s, 0)!.joints).toEqual([...DEMO_CYCLE.home]);
    expect(sampleOf(s, 99_999)!.joints).toEqual([...DEMO_CYCLE.home]);
  });

  it('live는 jointBuffer의 값을 그대로 주고, 값이 없으면 null이다', () => {
    const buffer = createJointBuffer({ delaySec: 0 });
    let current: typeof buffer | null = null;
    const s = liveSource(() => current);
    expect(s.kind).toBe('live');
    expect(sampleOf(s, 0)).toBeNull();
    current = buffer;
    expect(sampleOf(s, 0)).toBeNull();

    const msg: RobotJointsMessage = {
      type: 'robot.joints',
      deviceId: 'robot-1',
      seq: 1,
      ts: new Date(1_000).toISOString(),
      joints: [1, 2, 3, 4, 5, 6],
      gripper: { closed: true, holding: true },
      phase: 'move',
      targetTankId: 'tank-a1',
    };
    buffer.push(msg, 1_000);
    expect(sampleOf(s, 1_000)!.joints).toEqual([1, 2, 3, 4, 5, 6]);
    // 마지막 값 뒤에는 그 자세로 멈춘다 (연결이 끊겨도 추측해서 움직이지 않는다)
    expect(sampleOf(s, 60_000)!.joints).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('demo는 탱크 4개를 차례로 돌며 집기 → 이동 → 놓기를 반복한다', () => {
    const cycle = DEMO_CYCLE.pickSec + DEMO_CYCLE.moveSec + DEMO_CYCLE.placeSec + DEMO_CYCLE.idleSec;
    expect(demoPose(1).phase).toBe('pick');
    expect(demoPose(DEMO_CYCLE.pickSec + 1).phase).toBe('move');
    expect(demoPose(DEMO_CYCLE.pickSec + DEMO_CYCLE.moveSec + 1).phase).toBe('place');
    expect(demoPose(cycle - 0.5).phase).toBe('idle');
    expect(TANK_IDS.map((_, i) => demoPose(i * cycle + 1).targetTankId)).toEqual([...TANK_IDS]);
    expect(demoPose(TANK_IDS.length * cycle + 1).targetTankId).toBe('tank-a1'); // 다시 처음으로
  });

  it('demo는 집을 때 그리퍼를 닫아 들고, 놓은 뒤에 연다', () => {
    expect(demoPose(0.5).gripper.holding).toBe(false);
    expect(demoPose(DEMO_CYCLE.pickSec - 0.1).gripper.holding).toBe(true);
    expect(demoPose(DEMO_CYCLE.pickSec + 2).gripper.holding).toBe(true);
    expect(demoPose(DEMO_CYCLE.pickSec + DEMO_CYCLE.moveSec + DEMO_CYCLE.placeSec - 0.2).gripper.holding).toBe(false);
  });

  it('demo 자세는 시간에 따라 끊기지 않고 이어진다 (한 걸음에 크게 튀지 않는다)', () => {
    let prev = demoPose(0).joints;
    for (let t = 0.05; t < 60; t += 0.05) {
      const next = demoPose(t).joints;
      const jump = Math.max(...next.map((v, i) => Math.abs(v - prev[i]!)));
      expect(jump, `t=${t.toFixed(2)}`).toBeLessThan(12);
      prev = next;
    }
  });

  it('demo 자세는 모델의 각도 범위를 벗어나지 않는다', () => {
    for (let t = 0; t < 60; t += 0.25) {
      demoPose(t).joints.forEach((v, i) => {
        const j = DEFAULT_ROBOT_MODEL.joints[i]!;
        expect(v).toBeGreaterThanOrEqual(j.minDeg);
        expect(v).toBeLessThanOrEqual(j.maxDeg);
      });
    }
  });

  it('demoSource는 시작 시각부터의 경과로 자세를 정한다', () => {
    const s = demoSource(10_000);
    expect(s.kind).toBe('demo');
    expect(sampleOf(s, 11_000)).toEqual(demoPose(1));
  });
});
