import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, TankId } from '@ecocycle/shared';
import { DEMO_CYCLE, TANK_BASE_DEG } from '../../config/robotCycle';
import { YARD_FLOW } from '../../config/yard';
import { chainSpecFor } from '../robot/chain';
import { tipPosition } from '../robot/kinematics';
import type { P2 } from '../sim/paths';
import type { V3 } from './views';

// 카메라 지역(views.ts)은 three 없이 패널도 읽으므로 따로 두고 여기서 다시 내보낸다
export * from './views';

// 3D 홈(스튜디오) 월드의 배치. 섹터 집는 각도·시연 주기만 config/robotCycle에서 온다.
// 좌표: Y가 위, 로봇 받침대가 원점. 흐름은 +X(정문) → 계중대 → 하역 마당 → 섹터 4칸 → 로봇 → 컨베이어(-X) → 압축기 → 출하 마당(-Z).
// 로봇이 집는 자리·놓는 자리만은 서버 관절 값(base 각도, 모의 서버와 같은 down 자세)에서 나온다. 섹터 칸과 컨베이어는 그 자리에 맞춰 놓는다.

export const ROBOT = { scale: 1.6, pedestalH: 0.8, pedestalR: 0.62 } as const;

const DOWN = (baseDeg: number): number[] => [baseDeg, 45, -70, 0, 25, 0];

function tip(baseDeg: number): [number, number, number] {
  const t = tipPosition(chainSpecFor(), DOWN(baseDeg));
  return [t.x * ROBOT.scale, ROBOT.pedestalH + t.y * ROBOT.scale, t.z * ROBOT.scale];
}

/** 로봇이 각 섹터에서 집는 자리 (공구 끝) */
export const PICK: Record<TankId, [number, number, number]> = {
  'tank-a1': tip(TANK_BASE_DEG['tank-a1']),
  'tank-a2': tip(TANK_BASE_DEG['tank-a2']),
  'tank-b1': tip(TANK_BASE_DEG['tank-b1']),
  'tank-b2': tip(TANK_BASE_DEG['tank-b2']),
};
/** 로봇이 컨베이어에 놓는 자리 */
export const PLACE = tip(DEMO_CYCLE.conveyorBaseDeg);

export const SITE = { minX: -12.5, maxX: 20, minZ: -11, maxZ: 8.4 } as const;

export const HALL = { minX: -10, maxX: 4.7, minZ: -4, maxZ: 4, wallH: 3.3, wallT: 0.22 } as const;

/** 섹터 칸: 로봇 쪽 낮은 벽(minX)에서 트럭 쪽 입구(maxX)까지. 칸막이는 Z 방향으로 1.7 간격 */
export const BAY = { minX: 1.0, maxX: 4.5, width: 1.7, dividerH: 1.9, backH: 0.9, pileMaxH: 1.45 } as const;

export const BAY_Z: Record<TankId, readonly [number, number]> = {
  'tank-a1': [1.7, 3.4],
  'tank-a2': [0, 1.7],
  'tank-b1': [-1.7, 0],
  'tank-b2': [-3.4, -1.7],
};

export const bayCenterZ = (id: TankId): number => (BAY_Z[id][0] + BAY_Z[id][1]) / 2;

export { SECTOR_LABEL } from '../../config/processDisplay';

/** 컨베이어: 놓는 자리 아래에서 시작해 -X로 압축기 투입구까지 */
export const CONVEYOR = { startX: PLACE[0] + 0.55, endX: -6.7, z: PLACE[2], topY: PLACE[1] - 0.22, width: 0.95 } as const;

export const BALER = {
  x: -7.3,
  z: CONVEYOR.z,
  /** 압축실 */
  halfX: 0.85,
  minZ: CONVEYOR.z - 0.9,
  maxZ: CONVEYOR.z + 0.9,
  height: 1.0,
  /** 결속부가 끝나는 곳, 배출 롤러가 끝나는 곳 */
  strapZ: CONVEYOR.z - 1.5,
  chuteEndZ: -5.6,
  chuteY: 0.5,
} as const;

export const BALE = { w: 0.75, h: 0.62, d: 0.95 } as const;
/** 배출된 베일이 멈추는 자리 */
export const BALE_REST: [number, number, number] = [BALER.x, BALER.chuteY, -4.85];

/** 지게차가 포크를 내밀어 베일을 드는 거리(지게차 중심 → 베일 중심). 베일 뒤쪽이 포크 받침 바로 앞에 오도록 잡았다 */
export const FORK_REACH = 1.1;

/**
 * 출하 마당. 적치 칸은 한 줄(slotZ)에 열(slotXs)을 늘어놓고 칸마다 levels단까지 쌓는다.
 * 지게차 길(laneZ)은 칸 줄 앞의 한 줄 통로이고, 칸을 드는 지게차는 길에서 앞(+Z)으로 들어가 칸 앞 자리(pocketZ)에 선다.
 * 간격: 칸 앞 자리(칸 앞 지게차 뒷면 -6.37)와 배출구 앞 자리(뒷면 -6.57)에 선 지게차가 길을 지나가는 지게차(-6.63까지)와 겹치지 않는다.
 * 그래서 길은 칸 앞·배출구 앞 작업과 동시에 쓸 수 있다. 길 가장자리는 도로 경계(-7.4)를 0.1m쯤 넘는다.
 */
const SLOT_X0 = -4.9;
const SLOT_DX = 0.95;
const SLOT_Z = -4.65;
export const YARD = {
  minX: -12.5,
  maxX: 4.7,
  minZ: -7.4,
  maxZ: -4,
  laneZ: -7.08,
  slotZ: SLOT_Z,
  pocketZ: SLOT_Z - FORK_REACH,
  slotXs: Array.from({ length: YARD_FLOW.columns }, (_, i) => SLOT_X0 + i * SLOT_DX) as readonly number[],
  levels: YARD_FLOW.levels,
  /** 지게차 대기 자리(칸 줄 왼쪽 밖, 배출구 쪽부터). 칸 줄에서 멀리 둬서 대기 중인 지게차가 칸 앞 회전을 막지 않는다 */
  homes: [[-9.4, SLOT_Z - FORK_REACH], [-11.6, SLOT_Z - FORK_REACH]] as readonly P2[],
  exitX: YARD_FLOW.exitX,
} as const;

export const ROAD = { minZ: -10.6, maxZ: -7.4, inZ: -9.8, outZ: -8.0, spawnX: 28 } as const;

export const APRON = { minX: 4.7, maxX: 13.2, minZ: -7.4, maxZ: 4.8, laneX: 8.6, exitX: 12.0, turnX: 10.8, holdZ: -5.4 } as const;

export const SCALE = { minX: 13.1, maxX: 16.5, z: ROAD.inZ, stopX: 14.8 } as const;
export const GATE = { x: 19.4, houseX: 18.4, houseZ: -6.7 } as const;

export const TRUCK = { length: 2.9, width: 1.16, parkX: 6.35 } as const;

export const OFFICE = { minX: 6.2, maxX: 11.6, minZ: 5.4, maxZ: 7.6, height: 2.3 } as const;
export const PARKING = { minX: 14.2, maxX: 18.8, minZ: -4.6, maxZ: 3.4 } as const;

// ── 경로 (꺾이는 점) ──────────────────────────────────────────────────

export const TRUCK_IN: P2[] = [
  [ROAD.spawnX, ROAD.inZ],
  [SCALE.stopX, ROAD.inZ],
];

export function truckToBay(id: TankId): P2[] {
  const z = bayCenterZ(id);
  return [
    [SCALE.stopX, ROAD.inZ],
    [APRON.laneX, ROAD.inZ],
    [APRON.laneX, z],
    [APRON.turnX, z],
  ];
}

export function truckReverse(id: TankId): P2[] {
  const z = bayCenterZ(id);
  return [
    [APRON.turnX, z],
    [TRUCK.parkX, z],
  ];
}

export function truckToExit(id: TankId): P2[] {
  const z = bayCenterZ(id);
  return [
    [TRUCK.parkX, z],
    [APRON.exitX, z],
    [APRON.exitX, APRON.holdZ],
  ];
}

/** 인식만 되고 섹터에 가지 않은 채 출차하는 드문 경우: 마당을 한 바퀴 돌아 나간다 */
export const TRUCK_SCALE_TO_EXIT: P2[] = [
  [SCALE.stopX, ROAD.inZ],
  [APRON.laneX, ROAD.inZ],
  [APRON.laneX, -3.9],
  [APRON.exitX, -3.9],
  [APRON.exitX, APRON.holdZ],
];

/** 출차 대기 자리(마당 출구 앞)에서 도로로 나가 정문 밖으로 */
export const TRUCK_OUT: P2[] = [
  [APRON.exitX, APRON.holdZ],
  [APRON.exitX, ROAD.outZ],
  [ROAD.spawnX, ROAD.outZ],
];

// ── 기준점 (핀·카메라) ────────────────────────────────────────────────


export function deviceCenter(id: DeviceId): V3 {
  if ((TANK_IDS as readonly string[]).includes(id)) return [(BAY.minX + BAY.maxX) / 2, 0.6, bayCenterZ(id as TankId)];
  if (id === 'robot-1') return [0, 1.6, 0];
  if (id === 'conveyor-z') return [(CONVEYOR.startX + CONVEYOR.endX) / 2, CONVEYOR.topY, CONVEYOR.z];
  return [BALER.x, 0.8, BALER.z - 0.6];
}

export function devicePin(id: DeviceId): V3 {
  const [x, , z] = deviceCenter(id);
  // 섹터 핀은 칸마다 X를 달리해 비스듬히 늘어놓는다 (카메라에서 칸들이 앞뒤로 겹쳐 보이기 때문)
  if ((TANK_IDS as readonly string[]).includes(id)) return [BAY.maxX - 0.5 - (TANK_IDS as readonly string[]).indexOf(id) * 0.95, 2.3, z];
  if (id === 'robot-1') return [0, 4.1, 0];
  if (id === 'conveyor-z') return [x, 2.3, z];
  return [BALER.x, 2.6, BALER.z];
}
