import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import { Object3D } from 'three';
import type { InstancedMesh } from 'three';
import type { DeviceStatus } from '@ecocycle/shared';
import { BELT, CONVEYOR } from '../../config/sceneLayout';
import { conveyorCenter, conveyorLength } from '../layout';
import { GEOMETRY, MATERIALS, STATUS_MATERIAL } from '../materials';

const MAX_LUMPS = 6;
const LUMP_SIZE = 0.32;
const dummy = new Object3D();

export interface ConveyorProps {
  running: boolean;
  /** 적재 정도(%) */
  loadPercent: number;
  status: DeviceStatus;
  slatCount: number;
  /** 연결이 끊겼다: 벨트를 움직이지 않는다 (추측으로 움직이지 않는다) */
  frozen: boolean;
  onSelect: () => void;
}

/**
 * 컨베이어(Section Z)의 움직이는 부분: 벨트 줄무늬와 그 위의 파지 뭉치, 상태 색 띠. 틀과 다리는 고정물(world)이 그린다.
 * 가동 중이면 줄무늬와 뭉치가 압축기 쪽(-X)으로 흐른다. 줄무늬와 뭉치는 각각 InstancedMesh 하나다.
 */
export function Conveyor({ running, loadPercent, status, slatCount, frozen, onSelect }: ConveyorProps) {
  const slats = useRef<InstancedMesh>(null);
  const lumps = useRef<InstancedMesh>(null);
  const offset = useRef(0);
  const lumpCount = Math.round((Math.min(100, Math.max(0, loadPercent)) / 100) * MAX_LUMPS);

  // 벨트 위의 것들을 지금 offset에 맞춰 놓는다
  const place = () => {
    const slatMesh = slats.current;
    if (slatMesh) {
      const gap = conveyorLength / slatCount;
      for (let i = 0; i < slatCount; i += 1) {
        const along = (offset.current + i * gap) % conveyorLength;
        dummy.position.set(CONVEYOR.startX - along, CONVEYOR.topY + 0.005, CONVEYOR.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.05, 0.02, CONVEYOR.width * 0.9);
        dummy.updateMatrix();
        slatMesh.setMatrixAt(i, dummy.matrix);
      }
      slatMesh.instanceMatrix.needsUpdate = true;
    }
    const lumpMesh = lumps.current;
    if (lumpMesh) {
      const gap = conveyorLength / MAX_LUMPS;
      for (let i = 0; i < MAX_LUMPS; i += 1) {
        const along = (offset.current + i * gap) % conveyorLength;
        dummy.position.set(CONVEYOR.startX - along, CONVEYOR.topY + LUMP_SIZE * 0.35, CONVEYOR.z);
        dummy.rotation.set(0, i * 0.7, 0);
        dummy.scale.set(LUMP_SIZE * 1.3, LUMP_SIZE * 0.7, LUMP_SIZE);
        dummy.updateMatrix();
        lumpMesh.setMatrixAt(i, dummy.matrix);
      }
      lumpMesh.count = lumpCount;
      lumpMesh.instanceMatrix.needsUpdate = true;
    }
  };

  useLayoutEffect(place);

  useFrame((_state, delta) => {
    if (!running || frozen) return;
    offset.current = (offset.current + BELT.speedMps * Math.min(delta, 0.1)) % conveyorLength;
    place();
  });

  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {/* 카메라 쪽 옆 테두리: 상태 색 */}
      <mesh
        geometry={GEOMETRY.box}
        material={STATUS_MATERIAL[status]}
        position={[conveyorCenter[0], CONVEYOR.topY + 0.01, CONVEYOR.z - CONVEYOR.width / 2 - 0.03]}
        scale={[conveyorLength, 0.14, 0.06]}
      />
      <instancedMesh ref={slats} args={[GEOMETRY.box, MATERIALS.slat, slatCount]} frustumCulled={false} />
      <instancedMesh ref={lumps} args={[GEOMETRY.box, MATERIALS.bale, MAX_LUMPS]} frustumCulled={false} />
      {/* 누르는 영역 */}
      <mesh
        geometry={GEOMETRY.box}
        material={MATERIALS.hit}
        position={[conveyorCenter[0], CONVEYOR.topY / 2 + 0.2, CONVEYOR.z]}
        scale={[conveyorLength, CONVEYOR.topY + 0.4, CONVEYOR.width + 0.1]}
        userData={{ castShadow: false }}
      />
    </group>
  );
}
