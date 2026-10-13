import { OrthographicCamera, Vector3 } from 'three';
import { deviceTypeOf } from '@ecocycle/shared';
import type { DeviceId, TankId } from '@ecocycle/shared';
import { CAMERA, COMPRESSOR, CONVEYOR, DEMO_CYCLE, FOCUS_ZOOM, PIN_HEIGHT, ROBOT, SECTOR, SECTOR_PIN_HEIGHT, SECTOR_Z, SITE, TANK_BASE_DEG } from '../config/sceneLayout';
import { chainSpecFor } from './robot/chain';
import { tipPosition } from './robot/kinematics';
import type { ChainSpec } from './robot/chain';

// 장면 안의 위치 계산 (설정값 → 장면 좌표). 순수 함수만 둔다.
// 좌표계: Y가 위, 단위 m. 로봇 받침대 중심이 원점(0, 0, 0)이다.

export type Vec3 = readonly [number, number, number];

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 로봇이 물건을 집으러 내려갈 때의 관절 값 (모의 서버 sim/robot.ts의 down 자세와 같다) */
export const downPose = (baseDeg: number): number[] => [baseDeg, 45, -70, 0, 25, 0];

/** 로봇 받침대 위(관절 사슬 시작점)의 높이 */
export const robotBaseY = ROBOT.pedestalHeight * ROBOT.scale;

/** 관절 값의 공구 끝이 장면에서 어디인지 (로봇을 키워 그리는 배율과 받침대 높이를 반영) */
function tipInScene(spec: ChainSpec, jointsDeg: readonly number[]): Vec3 {
  const tip = tipPosition(spec, jointsDeg, ROBOT.yawOffsetDeg);
  return [ROBOT.position[0] + tip.x * ROBOT.scale, robotBaseY + tip.y * ROBOT.scale, ROBOT.position[2] + tip.z * ROBOT.scale];
}

/** 집기 자세의 공구 끝: 로봇이 이 섹터에서 파지를 집는 자리 */
export function pickTip(id: TankId, spec: ChainSpec = chainSpecFor()): Vec3 {
  return tipInScene(spec, downPose(TANK_BASE_DEG[id]));
}

/** 로봇이 집는 자리의 바닥 좌표. 섹터 칸(sectorBay)은 이 자리를 안에 품도록 놓는다. */
export function tankPosition(id: TankId, spec: ChainSpec = chainSpecFor()): Vec3 {
  const [x, , z] = pickTip(id, spec);
  return [x, 0, z];
}

/** 섹터 칸의 안쪽 범위 (칸막이 사이) */
export function sectorBay(id: TankId): Rect {
  const [minZ, maxZ] = SECTOR_Z[id];
  return { minX: SECTOR.minX, maxX: SECTOR.maxX, minZ, maxZ };
}

/** 컨베이어 위쪽 면의 중심선 */
export const conveyorCenter: Vec3 = [(CONVEYOR.startX + CONVEYOR.endX) / 2, CONVEYOR.topY - CONVEYOR.thickness / 2, CONVEYOR.z];
export const conveyorLength = Math.abs(CONVEYOR.startX - CONVEYOR.endX);

/** 놓기 자세의 공구 끝이 컨베이어 시작 근처에 오는지 확인하는 데 쓴다 */
export function placeTip(spec: ChainSpec = chainSpecFor()): Vec3 {
  return tipInScene(spec, downPose(DEMO_CYCLE.conveyorBaseDeg));
}

/** 기기의 중심(카메라가 확대할 곳)과 핀을 붙일 곳 */
export function deviceAnchor(id: DeviceId): { center: Vec3; pin: Vec3 } {
  const type = deviceTypeOf(id);
  if (type === 'tank') {
    const bay = sectorBay(id as TankId);
    const x = (bay.minX + bay.maxX) / 2;
    const z = (bay.minZ + bay.maxZ) / 2;
    return { center: [x, SECTOR.wallHeight / 2, z], pin: [x, SECTOR_PIN_HEIGHT[id as TankId], z] };
  }
  if (type === 'robot') {
    const [x, , z] = ROBOT.position;
    return { center: [x, robotBaseY + 0.9, z], pin: [x, PIN_HEIGHT.robot, z] };
  }
  if (type === 'conveyor') return { center: [conveyorCenter[0], CONVEYOR.topY, conveyorCenter[2]], pin: [conveyorCenter[0], PIN_HEIGHT.conveyor, conveyorCenter[2]] };
  return { center: [COMPRESSOR.x, COMPRESSOR.height / 2, COMPRESSOR.z], pin: [COMPRESSOR.x, PIN_HEIGHT.compressor, COMPRESSOR.z] };
}

export interface CameraPreset {
  /** 카메라가 바라보는 점 */
  center: Vec3;
  /** 전체 보기 대비 확대 배율 (1이면 부지 전체) */
  zoom: number;
}

/** 전체 보기: 부지 한가운데 */
export const OVERVIEW: CameraPreset = {
  center: [(SITE.minX + SITE.maxX) / 2, 0.6, (SITE.minZ + SITE.maxZ) / 2],
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
 * 전체 보기에서 부지가 화면에 들어가도록 하는 기본 확대(1m가 차지하는 픽셀 수).
 * 부지의 여덟 꼭짓점을 카메라 좌표로 옮겨 가로·세로 크기를 재고, 화면에 맞는 쪽을 고른다.
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
  for (const x of [SITE.minX, SITE.maxX]) {
    for (const z of [SITE.minZ, SITE.maxZ]) {
      for (const y of [0, SITE.viewHeight]) {
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
