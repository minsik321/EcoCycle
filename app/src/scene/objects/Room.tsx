import { useEffect, useMemo } from 'react';
import { MeshLambertMaterial } from 'three';
import { TANK_IDS } from '@ecocycle/shared';
import { CAMERA, ROOM } from '../../config/sceneLayout';
import { tankPosition } from '../layout';
import { FLOOR_FALLBACK_MATERIAL, GEOMETRY, MATERIALS, createFloorTexture } from '../materials';

const WIDTH = ROOM.maxX - ROOM.minX;
const DEPTH = ROOM.maxZ - ROOM.minZ;
const CENTER_X = (ROOM.minX + ROOM.maxX) / 2;
const CENTER_Z = (ROOM.minZ + ROOM.maxZ) / 2;
// 벽은 카메라에서 먼 쪽에 세운다 (가까운 쪽은 잘라낸 면)
const BACK_Z = CAMERA.direction[2] > 0 ? ROOM.minZ - ROOM.wallThickness / 2 : ROOM.maxZ + ROOM.wallThickness / 2;
const SIDE_X = CAMERA.direction[0] > 0 ? ROOM.minX - ROOM.wallThickness / 2 : ROOM.maxX + ROOM.wallThickness / 2;

/** 벽 한쪽을 잘라낸 방: 바닥(그림자를 미리 그린 텍스처)과 카메라 반대쪽 벽 두 면 */
export function Room() {
  const floorMaterial = useMemo(() => {
    const texture = createFloorTexture(TANK_IDS.map((id) => tankPosition(id)));
    return texture ? new MeshLambertMaterial({ map: texture }) : FLOOR_FALLBACK_MATERIAL;
  }, []);

  useEffect(
    () => () => {
      if (floorMaterial !== FLOOR_FALLBACK_MATERIAL) {
        floorMaterial.map?.dispose();
        floorMaterial.dispose();
      }
    },
    [floorMaterial],
  );

  return (
    <group>
      <mesh geometry={GEOMETRY.floor} material={floorMaterial} position={[CENTER_X, 0, CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} />
      {/* 뒤쪽 벽 */}
      <mesh
        geometry={GEOMETRY.box}
        material={MATERIALS.wall}
        position={[CENTER_X, ROOM.wallHeight / 2, BACK_Z]}
        scale={[WIDTH + ROOM.wallThickness, ROOM.wallHeight, ROOM.wallThickness]}
      />
      {/* 옆쪽 벽 */}
      <mesh
        geometry={GEOMETRY.box}
        material={MATERIALS.wall}
        position={[SIDE_X, ROOM.wallHeight / 2, CENTER_Z]}
        scale={[ROOM.wallThickness, ROOM.wallHeight, DEPTH]}
      />
    </group>
  );
}
