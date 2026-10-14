import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, TankId } from '@ecocycle/shared';
import { DEMO_CYCLE, TANK_BASE_DEG } from '../../config/robotCycle';
import { chainSpecFor } from '../robot/chain';
import { tipPosition } from '../robot/kinematics';
import type { P2 } from '../sim/paths';

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
export const BALE_REST: [number, number, number] = [BALER.x, BALER.chuteY, -5.05];

export const YARD = { minX: -12.5, maxX: 4.7, minZ: -7.4, maxZ: -4, laneZ: -6.55, slotZ: -4.75, slotXs: [-4.9, -3.95, -3.0, -2.05, -1.1, -0.15], home: [1.9, -6.55] as P2, exitX: -26 } as const;

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

export type V3 = readonly [number, number, number];

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

/**
 * 카메라 거리는 세 단계다 (참고 화면 docs/reference/ 01~10):
 *  - wide: 부지 전체. 다 보여도 한산하게
 *  - mid: 한 구역(섹터·로봇·압축기, 정문·계중대 등). 기본 화면
 *  - close: 대상 하나(기울이는 트럭, 압축기, 베일을 든 지게차). 대상을 고르면 이 거리로 간다
 */
export type ViewTier = 'wide' | 'mid' | 'close';

/** 카메라 지역 프리셋: target과 거리, 방위각·천정각(도) */
export interface ViewPreset {
  key: string;
  label: string;
  /** 지역 전환 목록의 둘째 줄 */
  hint: string;
  tier: ViewTier;
  target: V3;
  distance: number;
  azimuth: number;
  polar: number;
}

export const WIDE_VIEW: ViewPreset = { key: 'site', label: '부지 전체', hint: '정문부터 출하 마당까지', tier: 'wide', target: [3.8, 0, -1.4], distance: 86, azimuth: 58, polar: 48 };

/** 구역(mid). 첫 번째가 기본 화면이다 */
export const AREAS: readonly ViewPreset[] = [
  { key: 'process', label: '섹터·로봇·압축', hint: '섹터 4칸, 로봇팔, 컨베이어, 압축기', tier: 'mid', target: [-1.6, 0.3, -0.9], distance: 47, azimuth: 56, polar: 50 },
  { key: 'inbound', label: '정문·계중대', hint: '입차, 계량, 번호판 인식', tier: 'mid', target: [14.6, 0, -6.8], distance: 40, azimuth: 52, polar: 50 },
  { key: 'unload', label: '하역 마당', hint: '섹터 앞 후진·하역', tier: 'mid', target: [7.2, 0, -1.2], distance: 40, azimuth: 40, polar: 50 },
  { key: 'shipping', label: '출하 마당', hint: '베일 배출, 적치, 지게차', tier: 'mid', target: [-5.4, 0.2, -5.0], distance: 38, azimuth: 64, polar: 50 },
];

export const VIEWS: readonly ViewPreset[] = [WIDE_VIEW, ...AREAS];
export const DEFAULT_VIEW: ViewPreset = AREAS[0]!;

/** 거리 단계별 기준 거리 (확대·축소 버튼이 이 단계를 오간다) */
export const TIER_DISTANCE: Record<ViewTier, number> = { wide: WIDE_VIEW.distance, mid: DEFAULT_VIEW.distance, close: 22 };

/** 대상을 골랐을 때(close)의 거리. 대상이 화면 폭의 3분의 1쯤 차고 둘레가 조금 보이게 한다 (참고 화면 08~10) */
export const CLOSE_DISTANCE: Record<string, number> = {
  'dev:compressor-1': 25,
  'dev:robot-1': 22,
  'dev:conveyor-z': 26,
  dev: 23,
  veh: 22,
  bale: 13,
  forklift: 17,
};

export function closeDistance(key: string): number {
  return CLOSE_DISTANCE[key] ?? CLOSE_DISTANCE[key.split(':')[0] ?? ''] ?? TIER_DISTANCE.close;
}

/** 이 거리는 어느 단계인가 (핀 크기·확대 버튼에 쓴다) */
export function tierOf(distance: number): ViewTier {
  if (distance > (TIER_DISTANCE.wide + TIER_DISTANCE.mid) / 2) return 'wide';
  if (distance > (TIER_DISTANCE.mid + TIER_DISTANCE.close) / 2) return 'mid';
  return 'close';
}
