import { BoxGeometry, CylinderGeometry, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry } from 'three';
import type { DeviceStatus } from '@ecocycle/shared';
import { PALETTE } from './palette';

// 공용 재질과 지오메트리. 모두 불투명·저폴리이고 여기서 한 번만 만들어 장면 전체가 함께 쓴다.
// (투명·유리 재질은 쓰지 않는다. 그림자는 화질 단계에 따라 실시간이거나 바닥 텍스처에 미리 그린 것이다.)

const lambert = (color: string, extra: object = {}) => new MeshLambertMaterial({ color, flatShading: true, ...extra });

/** 고정물 전체(조각마다 꼭짓점 색)를 그리는 재질 하나 */
export const WORLD_MATERIAL = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

export const MATERIALS = {
  /** 파지 조각: 조각마다 색을 따로 준다(instanceColor) */
  chunk: lambert('#ffffff'),
  slat: lambert(PALETTE.slat),
  bale: lambert(PALETTE.bale),
  ram: lambert(PALETTE.steel),
  rod: lambert(PALETTE.cabinet),
  pedestal: lambert(PALETTE.steelDark),
  robotArm: lambert(PALETTE.robotArm),
  robotJoint: lambert(PALETTE.robotJoint),
  gripper: lambert(PALETTE.belt),
  grass: lambert(PALETTE.grass),
  /** 누르는 영역만 잡는 보이지 않는 재질 */
  hit: new MeshBasicMaterial({ visible: false }),
} as const;

/** 상태 색. styles/index.css의 --color-status-* 와 같은 값이다. */
export const STATUS_COLOR: Record<DeviceStatus, string> = {
  normal: '#2e7d32',
  caution: '#b26a00',
  alarm: '#c62828',
  offline: '#616161',
};

export const STATUS_MATERIAL: Record<DeviceStatus, MeshLambertMaterial> = {
  normal: lambert(STATUS_COLOR.normal),
  caution: lambert(STATUS_COLOR.caution),
  alarm: lambert(STATUS_COLOR.alarm),
  offline: lambert(STATUS_COLOR.offline),
};

export const GEOMETRY = {
  /** 한 변이 1인 상자. scale로 크기를 정해 쓴다 */
  box: new BoxGeometry(1, 1, 1),
  /** 반지름 1, 높이 1인 원통 (옆면 12각) */
  cylinder: new CylinderGeometry(1, 1, 1, 12),
  /** 한 변이 1인 판 (바닥) */
  plane: new PlaneGeometry(1, 1),
} as const;

/** 바닥 판 밖으로 보이는 배경. 잔디색과 같게 두어 경계가 보이지 않게 한다 */
export const BACKGROUND = PALETTE.grass;

/** 바닥 그림을 만들 수 없을 때(테스트 등) 쓰는 단색 바닥 */
export const GROUND_FALLBACK_MATERIAL = lambert(PALETTE.concrete);
