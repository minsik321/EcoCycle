import { useEffect, useMemo } from 'react';
import { MeshLambertMaterial } from 'three';
import { GROUND, ROBOT } from '../../config/sceneLayout';
import { GEOMETRY, GROUND_FALLBACK_MATERIAL, MATERIALS, WORLD_MATERIAL } from '../materials';
import { createGroundTexture } from './ground';
import { worldParts } from './world';
import { PartList, buildGeometry } from './world/parts';

const GROUND_WIDTH = GROUND.maxX - GROUND.minX;
const GROUND_DEPTH = GROUND.maxZ - GROUND.minZ;
const FLAT = [-Math.PI / 2, 0, 0] as const;

/** 고정물 목록에는 없지만 바닥에 그림자를 미리 그려 줘야 하는 것 (로봇 받침대) */
function extraShadowParts() {
  const list = new PartList();
  const diameter = ROBOT.pedestalRadius * ROBOT.scale * 2;
  list.cyl('#000000', [ROBOT.position[0], 0, ROBOT.position[2]], [diameter, ROBOT.pedestalHeight * ROBOT.scale, diameter]);
  return list.parts;
}

export interface StaticWorldProps {
  /** 소품 수준 (config/quality의 detail) */
  detail: 0 | 1 | 2;
  /** 그림자를 바닥 그림에 미리 그려 넣는다 (실시간 그림자를 쓰지 않는 화질 단계) */
  bakedShadows: boolean;
  /** 바닥 그림의 해상도 (1m당 픽셀 수) */
  groundPxPerM: number;
}

/**
 * 부지 전체의 움직이지 않는 것: 바닥(잔디·도로·표시선을 그린 판 하나)과 고정물(건물·설비 몸체·소품을 합친 메시 하나).
 * 조각 수가 수백 개여도 그리는 횟수는 세 번이다.
 */
export function StaticWorld({ detail, bakedShadows, groundPxPerM }: StaticWorldProps) {
  const parts = useMemo(() => worldParts(detail), [detail]);
  const geometry = useMemo(() => buildGeometry(parts), [parts]);
  const groundMaterial = useMemo(() => {
    const texture = createGroundTexture(groundPxPerM, bakedShadows ? [...parts, ...extraShadowParts()] : null);
    return texture ? new MeshLambertMaterial({ map: texture }) : GROUND_FALLBACK_MATERIAL;
  }, [parts, bakedShadows, groundPxPerM]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => () => {
      if (groundMaterial !== GROUND_FALLBACK_MATERIAL) {
        groundMaterial.map?.dispose();
        groundMaterial.dispose();
      }
    },
    [groundMaterial],
  );

  return (
    <group>
      {/* 바닥 그림 밖까지 이어지는 잔디 */}
      <mesh geometry={GEOMETRY.plane} material={MATERIALS.grass} position={[0, -0.03, 0]} rotation={FLAT} scale={[400, 400, 1]} userData={{ castShadow: false }} />
      <mesh
        geometry={GEOMETRY.plane}
        material={groundMaterial}
        position={[(GROUND.minX + GROUND.maxX) / 2, 0, (GROUND.minZ + GROUND.maxZ) / 2]}
        rotation={FLAT}
        scale={[GROUND_WIDTH, GROUND_DEPTH, 1]}
        userData={{ castShadow: false }}
      />
      <mesh geometry={geometry} material={WORLD_MATERIAL} />
    </group>
  );
}
