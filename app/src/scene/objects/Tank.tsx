import { useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D } from 'three';
import type { InstancedMesh } from 'three';
import type { DeviceStatus, TankId } from '@ecocycle/shared';
import { TANK } from '../../config/sceneLayout';
import { tankPosition } from '../layout';
import { GEOMETRY, MATERIALS, STATUS_MATERIAL } from '../materials';
import { chunkSlots, visibleChunkCount } from './chunks';

const CHUNK_SIZE = 0.16;
const INNER_RADIUS = TANK.radius - TANK.wallThickness;
const BAND_HEIGHT = 0.12;
const dummy = new Object3D();

export interface TankProps {
  id: TankId;
  /** 수위(%). 값을 아직 못 받았으면 0으로 그린다 */
  fillPercent: number;
  status: DeviceStatus;
  maxChunks: number;
  onSelect: (id: TankId) => void;
}

/**
 * 탱크 하나: 불투명 몸통, 상태 색 띠, 안에 쌓인 파지 조각.
 * 조각은 InstancedMesh 하나로 그리고 수위에 맞춰 보이는 개수만 바꾼다 (조각 위치는 한 번만 계산).
 */
export function Tank({ id, fillPercent, status, maxChunks, onSelect }: TankProps) {
  const position = useMemo(() => tankPosition(id), [id]);
  const slots = useMemo(() => chunkSlots(INNER_RADIUS, TANK.height - 0.08, CHUNK_SIZE, maxChunks), [maxChunks]);
  const chunks = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  // 조각 자리는 처음 한 번만 넣는다
  useLayoutEffect(() => {
    const mesh = chunks.current;
    if (!mesh) return;
    slots.forEach((slot, i) => {
      dummy.position.set(slot.x, slot.y, slot.z);
      dummy.rotation.set(0, slot.rotationY, 0);
      dummy.scale.setScalar(CHUNK_SIZE);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [slots]);

  // 수위가 바뀌면 보이는 개수만 바꾸고 한 번 그린다
  useLayoutEffect(() => {
    const mesh = chunks.current;
    if (!mesh) return;
    mesh.count = visibleChunkCount(fillPercent, slots.length);
    invalidate();
  }, [fillPercent, slots, invalidate]);

  return (
    <group
      position={[position[0], 0, position[2]]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
    >
      <mesh geometry={GEOMETRY.tube} material={MATERIALS.tankBody} position={[0, TANK.height / 2, 0]} scale={[TANK.radius, TANK.height, TANK.radius]} />
      {/* 상태 색 띠: 색만으로 구분하지 않도록 핀의 글자·기호와 함께 쓴다 */}
      <mesh
        geometry={GEOMETRY.tube}
        material={STATUS_MATERIAL[status]}
        position={[0, TANK.height - BAND_HEIGHT / 2, 0]}
        scale={[TANK.radius + 0.02, BAND_HEIGHT, TANK.radius + 0.02]}
      />
      <instancedMesh ref={chunks} args={[GEOMETRY.box, MATERIALS.chunk, slots.length]} frustumCulled={false} />
    </group>
  );
}
