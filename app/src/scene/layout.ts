import { OrthographicCamera, Vector3 } from 'three';
import { deviceTypeOf } from '@ecocycle/shared';
import type { DeviceId, TankId } from '@ecocycle/shared';
import { CAMERA, COMPRESSOR, CONVEYOR, DEMO_CYCLE, FOCUS_ZOOM, PIN_HEIGHT, ROBOT, ROOM, TANK, TANK_BASE_DEG } from '../config/sceneLayout';
import { chainSpecFor } from './robot/chain';
import { tipPosition } from './robot/kinematics';
import type { ChainSpec } from './robot/chain';

// 장면 안의 위치 계산 (설정값 → 장면 좌표). 순수 함수만 둔다.
// 좌표계: Y가 위, 단위 m. 로봇 받침대 중심이 원점(0, 0, 0)이다.

export type Vec3 = readonly [number, number, number];

/** 로봇이 물건을 집으러 내려갈 때의 관절 값 (모의 서버 sim/robot.ts의 down 자세와 같다) */
export const downPose = (baseDeg: number): number[] => [baseDeg, 45, -70, 0, 25, 0];

/** 로봇 받침대 위(관절 사슬 시작점)의 높이 */
export const robotBaseY = ROBOT.pedestalHeight;

/** 집기 자세의 공구 끝 위치 → 탱크가 놓일 곳(탱크 중심). 로봇이 탱크 가운데 위에서 집도록 맞춘다. */
export function tankPosition(id: TankId, spec: ChainSpec = chainSpecFor()): Vec3 {
  const tip = tipPosition(spec, downPose(TANK_BASE_DEG[id]), ROBOT.yawOffsetDeg);
  return [tip.x, 0, tip.z];
}

/** 컨베이어 위쪽 면의 중심선 */
export const conveyorCenter: Vec3 = [(CONVEYOR.startX + CONVEYOR.endX) / 2, CONVEYOR.topY - CONVEYOR.thickness / 2, CONVEYOR.z];
export const conveyorLength = Math.abs(CONVEYOR.startX - CONVEYOR.endX);

/** 놓기 자세의 공구 끝이 컨베이어 시작 근처에 오는지 확인하는 데 쓴다 */
export function placeTip(spec: ChainSpec = chainSpecFor()): Vec3 {
  const tip = tipPosition(spec, downPose(DEMO_CYCLE.conveyorBaseDeg), ROBOT.yawOffsetDeg);
  return [tip.x, tip.y + robotBaseY, tip.z];
}

/** 기기의 중심(카메라가 확대할 곳)과 핀을 붙일 곳 */
export function deviceAnchor(id: DeviceId): { center: Vec3; pin: Vec3 } {
  const type = deviceTypeOf(id);
  if (type === 'tank') {
    const [x, , z] = tankPosition(id as TankId);
    return { center: [x, TANK.height / 2, z], pin: [x, PIN_HEIGHT.tank, z] };
  }
  if (type === 'robot') return { center: [0, ROBOT.pedestalHeight + 0.8, 0], pin: [0, PIN_HEIGHT.robot, 0] };
  if (type === 'conveyor') return { center: [conveyorCenter[0], CONVEYOR.topY, conveyorCenter[2]], pin: [conveyorCenter[0], PIN_HEIGHT.conveyor, conveyorCenter[2]] };
  return { center: [COMPRESSOR.x, COMPRESSOR.height / 2, COMPRESSOR.z], pin: [COMPRESSOR.x, PIN_HEIGHT.compressor, COMPRESSOR.z] };
}

export interface CameraPreset {
  /** 카메라가 바라보는 점 */
  center: Vec3;
  /** 전체 보기 대비 확대 배율 (1이면 방 전체) */
  zoom: number;
}

/** 전체 보기: 방 한가운데 */
export const OVERVIEW: CameraPreset = {
  center: [(ROOM.minX + ROOM.maxX) / 2, 0.8, (ROOM.minZ + ROOM.maxZ) / 2],
  zoom: 1,
};

/** 기기별 카메라 위치. 고르지 않았으면 전체 보기 */
export function cameraPresetFor(id: DeviceId | null): CameraPreset {
  if (!id) return OVERVIEW;
  return { center: deviceAnchor(id).center, zoom: FOCUS_ZOOM[deviceTypeOf(id)] };
}

/** 카메라 방향(단위 벡터)과 거리를 합친 위치 오프셋 */
export function cameraOffset(): Vec3 {
  const [dx, dy, dz] = CAMERA.direction;
  const len = Math.hypot(dx, dy, dz);
  const k = CAMERA.distance / len;
  return [dx * k, dy * k, dz * k];
}

/**
 * 전체 보기에서 방이 화면에 들어가도록 하는 기본 확대(1m가 차지하는 픽셀 수).
 * 방의 여덟 꼭짓점을 카메라 좌표로 옮겨 가로·세로 크기를 재고, 화면에 맞는 쪽을 고른다.
 */
export function baseZoom(viewWidth: number, viewHeight: number): number {
  const [ox, oy, oz] = cameraOffset();
  const camera = new OrthographicCamera();
  camera.position.set(OVERVIEW.center[0] + ox, OVERVIEW.center[1] + oy, OVERVIEW.center[2] + oz);
  camera.lookAt(OVERVIEW.center[0], OVERVIEW.center[1], OVERVIEW.center[2]);
  camera.updateMatrixWorld();
  const toCamera = camera.matrixWorldInverse;
  const point = new Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [ROOM.minX, ROOM.maxX]) {
    for (const z of [ROOM.minZ, ROOM.maxZ]) {
      for (const y of [0, ROOM.wallHeight]) {
        point.set(x, y, z).applyMatrix4(toCamera);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      }
    }
  }
  return Math.min(viewWidth / (maxX - minX), viewHeight / (maxY - minY)) * CAMERA.margin;
}
