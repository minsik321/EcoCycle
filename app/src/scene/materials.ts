import { BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, MeshLambertMaterial, PlaneGeometry } from 'three';
import type { DeviceStatus } from '@ecocycle/shared';
import { COMPRESSOR, CONVEYOR, ROBOT, ROOM, TANK } from '../config/sceneLayout';

// 공용 재질과 지오메트리. 모두 불투명·저폴리이고 여기서 한 번만 만들어 장면 전체가 함께 쓴다.
// (투명·발광·유리 재질과 실시간 그림자는 쓰지 않는다. 그림자는 바닥 텍스처에 미리 그린다.)

const lambert = (color: string, extra: object = {}) => new MeshLambertMaterial({ color, flatShading: true, ...extra });

export const MATERIALS = {
  wall: lambert('#cbd5e1'),
  tankBody: lambert('#94a3b8', { side: DoubleSide }),
  chunk: lambert('#d9c9a3'),
  conveyorFrame: lambert('#64748b'),
  belt: lambert('#334155'),
  slat: lambert('#475569'),
  bale: lambert('#c8ac7a'),
  machine: lambert('#64748b'),
  machineDark: lambert('#475569'),
  pedestal: lambert('#475569'),
  robotArm: lambert('#f59e0b'),
  robotJoint: lambert('#1e293b'),
  gripper: lambert('#334155'),
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
  /** 위아래가 뚫린 원통 (탱크 몸통) */
  tube: new CylinderGeometry(1, 1, 1, 16, 1, true),
  floor: new PlaneGeometry(ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ),
} as const;

export const BACKGROUND = '#f1f5f9';
const FLOOR_COLOR = '#e2e8f0';

/**
 * 바닥 텍스처: 바닥색 위에 기기 아래의 그림자를 미리 그려 둔다 (실시간 그림자 대신).
 * 캔버스를 쓸 수 없는 환경(테스트 등)에서는 null을 돌려주고 바닥은 단색으로 그린다.
 */
export function createFloorTexture(tanks: ReadonlyArray<readonly [number, number, number]>): CanvasTexture | null {
  try {
    const pxPerM = 48;
    const width = ROOM.maxX - ROOM.minX;
    const depth = ROOM.maxZ - ROOM.minZ;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * pxPerM);
    canvas.height = Math.round(depth * pxPerM);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = FLOOR_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const toPx = (x: number, z: number): [number, number] => [(x - ROOM.minX) * pxPerM, (z - ROOM.minZ) * pxPerM];

    // 그림자는 빛이 오는 반대쪽(-X, -Z)으로 조금 밀어 그린다
    const shadow = (x: number, z: number, rx: number, rz: number) => {
      const [cx, cy] = toPx(x - 0.18, z - 0.18);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, rz) * pxPerM);
      gradient.addColorStop(0, 'rgba(15, 23, 42, 0.30)');
      gradient.addColorStop(0.7, 'rgba(15, 23, 42, 0.16)');
      gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx / Math.max(rx, rz), rz / Math.max(rx, rz));
      ctx.translate(-cx, -cy);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(rx, rz) * pxPerM, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    for (const [x, , z] of tanks) shadow(x, z, TANK.radius * 1.5, TANK.radius * 1.5);
    shadow(ROBOT.position[0], ROBOT.position[2], ROBOT.pedestalRadius * 1.7, ROBOT.pedestalRadius * 1.7);
    shadow((CONVEYOR.startX + CONVEYOR.endX) / 2, CONVEYOR.z, Math.abs(CONVEYOR.startX - CONVEYOR.endX) / 2 + 0.3, CONVEYOR.width);
    shadow(COMPRESSOR.x, COMPRESSOR.z, COMPRESSOR.width * 0.8, COMPRESSOR.depth * 0.8);

    return new CanvasTexture(canvas);
  } catch {
    return null;
  }
}

export const FLOOR_FALLBACK_MATERIAL = lambert(FLOOR_COLOR);
