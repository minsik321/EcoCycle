import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D } from 'three';
import type { InstancedMesh } from 'three';
import type { DeviceStatus } from '@ecocycle/shared';
import { BELT, CONVEYOR } from '../../config/sceneLayout';
import { conveyorCenter, conveyorLength } from '../layout';
import { GEOMETRY, MATERIALS, STATUS_MATERIAL } from '../materials';

const MAX_BALES = 6;
const BALE_SIZE = 0.3;
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
 * 컨베이어(Section Z): 로봇 옆에서 압축기까지 이어지는 긴 벨트 하나.
 * 가동 중이면 벨트 줄무늬와 그 위의 파지 묶음이 압축기 쪽(-X)으로 흐른다. 줄무늬와 묶음은 각각 InstancedMesh 하나다.
 */
export function Conveyor({ running, loadPercent, status, slatCount, frozen, onSelect }: ConveyorProps) {
  const slats = useRef<InstancedMesh>(null);
  const bales = useRef<InstancedMesh>(null);
  const offset = useRef(0);
  const legs = useMemo(() => {
    const xs: number[] = [];
    for (let x = CONVEYOR.startX - 0.3; x > CONVEYOR.endX; x -= CONVEYOR.legSpacing) xs.push(x);
    return xs;
  }, []);
  const baleCount = Math.round((Math.min(100, Math.max(0, loadPercent)) / 100) * MAX_BALES);

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
    const baleMesh = bales.current;
    if (baleMesh) {
      const gap = conveyorLength / MAX_BALES;
      for (let i = 0; i < MAX_BALES; i += 1) {
        const along = (offset.current + i * gap) % conveyorLength;
        dummy.position.set(CONVEYOR.startX - along, CONVEYOR.topY + BALE_SIZE / 2, CONVEYOR.z);
        dummy.rotation.set(0, i * 0.7, 0);
        dummy.scale.setScalar(BALE_SIZE);
        dummy.updateMatrix();
        baleMesh.setMatrixAt(i, dummy.matrix);
      }
      baleMesh.count = baleCount;
      baleMesh.instanceMatrix.needsUpdate = true;
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
      <mesh geometry={GEOMETRY.box} material={MATERIALS.belt} position={[conveyorCenter[0], conveyorCenter[1], conveyorCenter[2]]} scale={[conveyorLength, CONVEYOR.thickness, CONVEYOR.width]} />
      {/* 옆 테두리: 상태 색 */}
      <mesh
        geometry={GEOMETRY.box}
        material={STATUS_MATERIAL[status]}
        position={[conveyorCenter[0], CONVEYOR.topY - 0.03, CONVEYOR.z + CONVEYOR.width / 2 + 0.03]}
        scale={[conveyorLength, 0.1, 0.06]}
      />
      {legs.map((x) => (
        <mesh
          key={x}
          geometry={GEOMETRY.box}
          material={MATERIALS.conveyorFrame}
          position={[x, (CONVEYOR.topY - CONVEYOR.thickness) / 2, CONVEYOR.z]}
          scale={[0.12, CONVEYOR.topY - CONVEYOR.thickness, CONVEYOR.width * 0.8]}
        />
      ))}
      <instancedMesh ref={slats} args={[GEOMETRY.box, MATERIALS.slat, slatCount]} frustumCulled={false} />
      <instancedMesh ref={bales} args={[GEOMETRY.box, MATERIALS.bale, MAX_BALES]} frustumCulled={false} />
    </group>
  );
}
