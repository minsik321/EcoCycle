import { describe, expect, it } from 'vitest';
import { DEVICE_IDS, TANK_IDS } from '@ecocycle/shared';
import type { RobotJointsMessage, RobotModel } from '@ecocycle/shared';
import { QUALITY_PROFILES } from '../config/quality';
import { DEFAULT_ROBOT_MODEL } from '../config/robotModel';
import { APRON, BUILDING, CAMERA, COMPRESSOR, CONVEYOR, DEMO_CYCLE, GROUND, OFFICE, PARKING, ROAD, ROBOT, SECTOR, SITE, SUN, TANK_BASE_DEG, WEIGHBRIDGE, YARD } from '../config/sceneLayout';
import { createJointBuffer } from '../realtime';
import { OVERVIEW, baseZoom, cameraPresetFor, deviceAnchor, downPose, pickTip, placeTip, robotBaseY, sectorBay, tankPosition } from './layout';
import { pileSlots, visibleChunkCount } from './objects/chunks';
import { SHADOW_SHIFT, convexHull, shadowOutline } from './objects/ground';
import { worldParts } from './objects/world';
import { buildGeometry, offset, vertexCountOf } from './objects/world/parts';
import type { Part } from './objects/world/parts';
import { PALETTE } from './palette';
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
  const tanks = TANK_IDS.map((id) => ({ id, p: tankPosition(id), bay: sectorBay(id) }));

  it('로봇이 집으러 가는 자리는 집기 자세의 공구 끝에 장면 배율을 곱한 곳이다', () => {
    for (const { id, p } of tanks) {
      const tip = tipPosition(spec, downPose(TANK_BASE_DEG[id]), ROBOT.yawOffsetDeg);
      near(p[0], ROBOT.position[0] + tip.x * ROBOT.scale);
      near(p[2], ROBOT.position[2] + tip.z * ROBOT.scale);
      near(pickTip(id)[1], robotBaseY + tip.y * ROBOT.scale);
    }
  });

  it('섹터 칸은 로봇이 집는 자리를 안에 품고, 공구 끝은 가득 찬 더미 바로 위에 온다', () => {
    const margin = 0.2;
    for (const { id, p, bay } of tanks) {
      expect(p[0], id).toBeGreaterThan(bay.minX + margin);
      expect(p[0], id).toBeLessThan(bay.maxX - margin);
      expect(p[2], id).toBeGreaterThan(bay.minZ + margin);
      expect(p[2], id).toBeLessThan(bay.maxZ - margin);
      const gap = pickTip(id)[1] - SECTOR.pileMaxHeight;
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(0.6);
    }
  });

  it('섹터 칸끼리 겹치지 않고, 로봇 받침대와도 겹치지 않으며, 본관 안에 있다', () => {
    for (let i = 0; i < tanks.length; i += 1) {
      for (let j = i + 1; j < tanks.length; j += 1) {
        const a = tanks[i]!.bay;
        const b = tanks[j]!.bay;
        expect(a.maxZ <= b.minZ || b.maxZ <= a.minZ, `${tanks[i]!.id}~${tanks[j]!.id}`).toBe(true);
      }
      const { bay } = tanks[i]!;
      expect(bay.minX).toBeGreaterThan(ROBOT.position[0] + ROBOT.pedestalRadius * ROBOT.scale);
      expect(bay.maxX).toBeLessThanOrEqual(BUILDING.maxX);
      expect(bay.minZ).toBeGreaterThanOrEqual(BUILDING.minZ);
      expect(bay.maxZ).toBeLessThanOrEqual(BUILDING.maxZ);
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

  it('컨베이어는 로봇에서 압축기 투입구 위까지 이어지고 모두 본관 안에 있다', () => {
    expect(CONVEYOR.endX).toBeLessThan(CONVEYOR.startX);
    // 벨트 끝이 투입구 안쪽 위에 온다
    expect(CONVEYOR.endX).toBeLessThan(COMPRESSOR.x + COMPRESSOR.width / 2);
    expect(CONVEYOR.endX).toBeGreaterThan(COMPRESSOR.x - COMPRESSOR.width / 2);
    expect(CONVEYOR.topY - CONVEYOR.thickness).toBeGreaterThanOrEqual(COMPRESSOR.hopperTopY);
    expect(COMPRESSOR.x - COMPRESSOR.width / 2).toBeGreaterThan(BUILDING.minX);
    // 배출 슬라이드는 본관 밖 출하장으로 나간다
    expect(COMPRESSOR.slideEndZ).toBeLessThan(BUILDING.minZ);
    expect(COMPRESSOR.slideEndZ).toBeGreaterThan(YARD.minZ);
  });

  it('입고에서 출하까지의 구역이 부지 안에 있고, 본관·출하장·도로가 서로 겹치지 않는다', () => {
    for (const area of [BUILDING, APRON, YARD, OFFICE, PARKING]) {
      expect(area.minX).toBeGreaterThanOrEqual(SITE.minX);
      expect(area.maxX).toBeLessThanOrEqual(SITE.maxX);
      expect(area.minZ).toBeGreaterThanOrEqual(SITE.minZ);
      expect(area.maxZ).toBeLessThanOrEqual(SITE.maxZ);
    }
    expect(YARD.maxZ).toBeLessThanOrEqual(BUILDING.minZ);
    expect(ROAD.maxZ).toBeLessThanOrEqual(YARD.minZ);
    expect(APRON.minX).toBeGreaterThanOrEqual(BUILDING.maxX);
    // 계중대는 들어오는 차로 위에 있다
    expect(WEIGHBRIDGE.z - WEIGHBRIDGE.width / 2).toBeGreaterThan(ROAD.minZ);
    expect(WEIGHBRIDGE.z + WEIGHBRIDGE.width / 2).toBeLessThan((ROAD.minZ + ROAD.maxZ) / 2);
    expect(WEIGHBRIDGE.maxX).toBeLessThan(ROAD.maxX);
    expect(WEIGHBRIDGE.minX).toBeGreaterThan(ROAD.connectorMaxX);
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

  it('전체 보기는 화면 크기에 맞춰 부지가 들어가게 확대를 정한다', () => {
    const wide = baseZoom(1200, 600);
    const tall = baseZoom(600, 1200);
    expect(wide).toBeGreaterThan(0);
    expect(baseZoom(2400, 1200)).toBeCloseTo(wide * 2, 5);
    expect(tall).toBeLessThan(wide); // 좁은 화면에서는 더 작게
  });
});

describe('섹터의 파지 더미', () => {
  const bay = sectorBay('tank-a1');
  const width = bay.maxX - bay.minX - 0.24;
  const depth = bay.maxZ - bay.minZ - 0.34;

  it.each(Object.entries(QUALITY_PROFILES))('%s 화질: 조각 수는 상한을 넘지 않고 모두 칸 안, 더미 높이 안에 있다', (_mode, q) => {
    const { size, slots } = pileSlots(width, depth, SECTOR.pileMaxHeight, q.maxChunksPerTank);
    expect(slots.length).toBeGreaterThan(8);
    expect(slots.length).toBeLessThanOrEqual(q.maxChunksPerTank);
    // 상한을 거의 다 써야 더미가 듬성듬성해 보이지 않는다
    expect(slots.length).toBeGreaterThan(q.maxChunksPerTank * 0.6);
    for (const s of slots) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(width / 2);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(depth / 2);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y + size / 2).toBeLessThanOrEqual(SECTOR.pileMaxHeight + size * 0.5);
    }
  });

  it('아래층부터 순서대로라서 앞에서부터 보이면 더미가 차오른다', () => {
    const { slots } = pileSlots(width, depth, SECTOR.pileMaxHeight, 96);
    for (let i = 1; i < slots.length; i += 1) expect(slots[i]!.y).toBeGreaterThanOrEqual(slots[i - 1]!.y);
  });

  it('같은 입력이면 항상 같은 배치다 (다시 그릴 때 조각이 튀지 않는다)', () => {
    expect(pileSlots(width, depth, 1.2, 96)).toEqual(pileSlots(width, depth, 1.2, 96));
  });

  it('적재율에 맞춰 보이는 조각 수를 정한다', () => {
    expect(visibleChunkCount(0, 80)).toBe(0);
    expect(visibleChunkCount(50, 80)).toBe(40);
    expect(visibleChunkCount(100, 80)).toBe(80);
    expect(visibleChunkCount(140, 80)).toBe(80);
    expect(visibleChunkCount(-5, 80)).toBe(0);
    expect(visibleChunkCount(Number.NaN, 80)).toBe(0);
  });

  it('저사양 화질은 조각이 더 적고, 어느 단계도 초당 30프레임을 넘지 않는다', () => {
    expect(QUALITY_PROFILES.low.maxChunksPerTank).toBeLessThan(QUALITY_PROFILES.standard.maxChunksPerTank);
    expect(QUALITY_PROFILES.low.maxFps).toBeLessThanOrEqual(QUALITY_PROFILES.standard.maxFps);
    for (const q of Object.values(QUALITY_PROFILES)) expect(q.maxFps).toBeLessThanOrEqual(30); // 명세: 초당 30프레임 이하
  });
});

describe('고정물 (건물·설비 몸체·소품을 합쳐 한 번에 그린다)', () => {
  const byDetail = ([0, 1, 2] as const).map((detail) => worldParts(detail));

  it('모든 조각이 바닥 그림 범위 안, 땅 위에 있다', () => {
    for (const part of byDetail[2]!) {
      // 돌려 놓은 조각이 X, Z 방향으로 차지하는 반폭
      const cos = Math.abs(Math.cos(part.ry));
      const sin = Math.abs(Math.sin(part.ry));
      const halfX = (cos * part.sx + sin * part.sz) / 2;
      const halfZ = (sin * part.sx + cos * part.sz) / 2;
      expect(part.x - halfX, part.color).toBeGreaterThan(GROUND.minX);
      expect(part.x + halfX, part.color).toBeLessThan(GROUND.maxX);
      expect(part.z - halfZ, part.color).toBeGreaterThan(GROUND.minZ);
      expect(part.z + halfZ, part.color).toBeLessThan(GROUND.maxZ);
      expect(part.y + part.sy / 2).toBeGreaterThan(0);
      expect(Math.min(part.sx, part.sy, part.sz)).toBeGreaterThan(0);
    }
  });

  it('화질 단계가 낮을수록 소품이 줄지만, 설비와 건물은 그대로 남는다', () => {
    expect(byDetail[0]!.length).toBeLessThan(byDetail[1]!.length);
    expect(byDetail[1]!.length).toBeLessThan(byDetail[2]!.length);
    expect(byDetail[0]!.length).toBeGreaterThan(100);
    // 압축기 몸체(설비 색)는 어느 단계에나 있다
    for (const parts of byDetail) expect(parts.some((part) => part.color === PALETTE.machine)).toBe(true);
  });

  it('조각을 지오메트리 하나로 합친다 (위치·법선·색의 꼭짓점 수가 같다)', () => {
    const parts = byDetail[0]!;
    const geometry = buildGeometry(parts);
    const expected = parts.reduce((sum, part) => sum + vertexCountOf(part.shape), 0);
    expect(geometry.getAttribute('position').count).toBe(expected);
    expect(geometry.getAttribute('normal').count).toBe(expected);
    expect(geometry.getAttribute('color').count).toBe(expected);
    expect(geometry.boundingSphere!.radius).toBeGreaterThan(5);
    // 전부 그리는 단계에서도 꼭짓점 수가 과하지 않다
    expect(buildGeometry(byDetail[2]!).getAttribute('position').count).toBeLessThan(60_000);
  });

  it('물체 안의 자리를 방향에 맞게 돌린다', () => {
    const [x, z] = offset(1, 2, Math.PI / 2, 1, 0);
    near(x, 1);
    near(z, 1);
  });
});

describe('미리 그리는 바닥 그림자 (저사양)', () => {
  const part = (over: Partial<Part>): Part => ({ shape: 'box', color: '#000', x: 0, y: 1, z: 0, sx: 2, sy: 2, sz: 2, rx: 0, ry: 0, rz: 0, shadow: true, ...over });

  it('그림자는 해의 반대쪽으로, 높이에 비례해 밀린다', () => {
    expect(SHADOW_SHIFT[0]).toBeCloseTo(-SUN.direction[0] / SUN.direction[1]);
    expect(SHADOW_SHIFT[1]).toBeCloseTo(-SUN.direction[2] / SUN.direction[1]);
    const xs = (p: Part) => shadowOutline(p).map(([x]) => x);
    near(Math.min(...xs(part({ y: 0.5, sy: 1 }))), -1 + SHADOW_SHIFT[0] * 1);
    near(Math.min(...xs(part({ y: 2, sy: 4 }))), -1 + SHADOW_SHIFT[0] * 4);
  });

  it('바닥에 놓인 상자의 그림자는 밑면을 포함한다', () => {
    const outline = shadowOutline(part({}));
    expect(Math.max(...outline.map(([x]) => x))).toBeCloseTo(1);
    expect(Math.max(...outline.map(([, z]) => z))).toBeCloseTo(1);
    expect(outline.length).toBeGreaterThanOrEqual(4);
  });

  it('볼록 껍질은 안쪽 점을 버린다', () => {
    const hull = convexHull([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [1, 1],
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([1, 1]);
  });

  it('해는 카메라 옆에서 비춘다 (그림자가 물체 뒤로 숨지 않는다)', () => {
    // 카메라가 보는 방향을 바닥에 내린 벡터와 그림자가 밀리는 방향이 나란하지 않아야 한다
    const view = [-CAMERA.direction[0], -CAMERA.direction[2]] as const;
    const cos = (view[0] * SHADOW_SHIFT[0] + view[1] * SHADOW_SHIFT[1]) / (Math.hypot(...view) * Math.hypot(...SHADOW_SHIFT));
    expect(cos).toBeLessThan(0.75);
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
