import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D } from 'three';
import type { InstancedMesh } from 'three';
import type { DeviceStatus, TankId } from '@ecocycle/shared';
import { SECTOR } from '../../config/sceneLayout';
import { sectorBay } from '../layout';
import { GEOMETRY, MATERIALS, STATUS_MATERIAL } from '../materials';
import { PALETTE } from '../palette';
import { pileSlots, visibleChunkCount } from './chunks';

const dummy = new Object3D();
const tint = new Color();
/** 더미가 칸막이에 닿지 않게 두는 여유 */
const MARGIN = 0.12;

export interface SectorProps {
  id: TankId;
  /** 적재율(%). 값을 아직 못 받았으면 0으로 그린다 */
  fillPercent: number;
  status: DeviceStatus;
  maxChunks: number;
  onSelect: (id: TankId) => void;
}

/**
 * 수납 섹터 한 칸(기존 탱크와 같은 기기): 안에 쌓인 파지 더미와 상태 색 띠. 칸막이 벽은 고정물(world)이 그린다.
 * 더미는 InstancedMesh 하나로 그리고 적재율에 맞춰 보이는 개수만 바꾼다 (조각 위치는 한 번만 계산).
 */
export function Sector({ id, fillPercent, status, maxChunks, onSelect }: SectorProps) {
  const bay = useMemo(() => sectorBay(id), [id]);
  const width = bay.maxX - bay.minX;
  const depth = bay.maxZ - bay.minZ;
  const pile = useMemo(() => pileSlots(width - MARGIN * 2, depth - SECTOR.wallThickness - MARGIN * 2, SECTOR.pileMaxHeight, maxChunks), [width, depth, maxChunks]);
  const chunks = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  // 조각 자리와 색은 처음 한 번만 넣는다
  useLayoutEffect(() => {
    const mesh = chunks.current;
    if (!mesh) return;
    pile.slots.forEach((slot, i) => {
      dummy.position.set(slot.x, slot.y, slot.z);
      dummy.rotation.set(0, slot.rotationY, 0);
      dummy.scale.setScalar(pile.size * slot.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint.set(PALETTE.paper[Math.floor(slot.tint * PALETTE.paper.length)] ?? PALETTE.paper[0]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [pile]);

  // 적재율이 바뀌면 보이는 개수만 바꾸고 한 번 그린다
  useLayoutEffect(() => {
    const mesh = chunks.current;
    if (!mesh) return;
    mesh.count = visibleChunkCount(fillPercent, pile.slots.length);
    invalidate();
  }, [fillPercent, pile, invalidate]);

  const stripLength = depth - SECTOR.wallThickness - 0.06;
  return (
    <group
      position={[(bay.minX + bay.maxX) / 2, 0, (bay.minZ + bay.maxZ) / 2]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
    >
      <instancedMesh ref={chunks} args={[GEOMETRY.box, MATERIALS.chunk, pile.slots.length]} frustumCulled={false} />
      {/* 상태 색 띠: 로봇 쪽 낮은 벽 위와 트럭 쪽 바닥 턱. 색만으로 구분하지 않도록 핀의 글자·기호와 함께 쓴다 */}
      <mesh geometry={GEOMETRY.box} material={STATUS_MATERIAL[status]} position={[-width / 2, SECTOR.backWallHeight + 0.04, 0]} scale={[SECTOR.wallThickness + 0.04, 0.08, stripLength]} />
      <mesh geometry={GEOMETRY.box} material={STATUS_MATERIAL[status]} position={[width / 2 - 0.05, 0.06, 0]} scale={[0.1, 0.12, stripLength]} />
      {/* 누르는 영역 */}
      <mesh geometry={GEOMETRY.box} material={MATERIALS.hit} position={[0, SECTOR.wallHeight / 2, 0]} scale={[width, SECTOR.wallHeight, depth]} userData={{ castShadow: false }} />
    </group>
  );
}
