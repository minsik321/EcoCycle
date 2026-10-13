import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import type { DeviceStatus } from '@ecocycle/shared';
import { COMPRESSOR } from '../../config/sceneLayout';
import { GEOMETRY, MATERIALS, STATUS_MATERIAL } from '../materials';

const PRESS_PERIOD_SEC = 2.4;
const PLATE_THICKNESS = 0.12;
/** 압축실 끝(+Z)에서 본 램의 자리: 물러난 곳과 끝까지 민 곳 */
const RAM_BACK = COMPRESSOR.ramGap - PLATE_THICKNESS / 2 - 0.04;
const RAM_FRONT = PLATE_THICKNESS / 2 + 0.03;

export interface CompressorProps {
  running: boolean;
  status: DeviceStatus;
  frozen: boolean;
  onSelect: () => void;
}

/**
 * 압축기의 움직이는 부분: 프레스 램(압축실과 유압 장치 사이에서 앞뒤로 움직이는 판과 막대), 상태 표시등.
 * 몸체(투입구·압축실·결속부·배출 슬라이드)는 고정물(world)이 그린다. 가동 중일 때만 움직이고, 끊기면 그 자리에서 멈춘다.
 */
export function Compressor({ running, status, frozen, onSelect }: CompressorProps) {
  const plate = useRef<Mesh>(null);
  const rod = useRef<Mesh>(null);
  const phase = useRef(0);
  const chamberMaxZ = COMPRESSOR.z + COMPRESSOR.depth / 2;
  const unitZ = chamberMaxZ + COMPRESSOR.ramGap;

  const place = (k: number) => {
    const at = chamberMaxZ + RAM_BACK + (RAM_FRONT - RAM_BACK) * k;
    if (plate.current) plate.current.position.z = at;
    if (rod.current) {
      // 막대는 유압 장치에서 판까지 이어진다
      rod.current.position.z = (at + unitZ) / 2;
      rod.current.scale.y = Math.max(0.01, unitZ - at);
    }
  };

  useFrame((_state, delta) => {
    if (!running || frozen) return;
    phase.current = (phase.current + Math.min(delta, 0.1) / PRESS_PERIOD_SEC) % 1;
    // 0~1을 오가는 값으로
    place(0.5 - 0.5 * Math.cos(phase.current * Math.PI * 2));
  });

  const plateHeight = COMPRESSOR.height * 0.62;
  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh
        ref={plate}
        geometry={GEOMETRY.box}
        material={MATERIALS.ram}
        position={[COMPRESSOR.x, 0.2 + plateHeight / 2, chamberMaxZ + RAM_BACK]}
        scale={[COMPRESSOR.width * 0.7, plateHeight, PLATE_THICKNESS]}
      />
      <mesh
        ref={rod}
        geometry={GEOMETRY.cylinder}
        material={MATERIALS.rod}
        position={[COMPRESSOR.x, 0.2 + plateHeight / 2, (chamberMaxZ + RAM_BACK + unitZ) / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.09, unitZ - chamberMaxZ - RAM_BACK, 0.09]}
      />
      {/* 상태 표시등: 결속부 문형 틀 위 */}
      <mesh
        geometry={GEOMETRY.cylinder}
        material={STATUS_MATERIAL[status]}
        position={[COMPRESSOR.x + COMPRESSOR.width / 2 - 0.03, 1.7, COMPRESSOR.z - COMPRESSOR.depth / 2 - COMPRESSOR.strapDepth / 2 - 0.06]}
        scale={[0.1, 0.2, 0.1]}
      />
      {/* 누르는 영역 */}
      <mesh
        geometry={GEOMETRY.box}
        material={MATERIALS.hit}
        position={[COMPRESSOR.x, 0.8, COMPRESSOR.z + 0.2]}
        scale={[COMPRESSOR.width + 0.2, 1.6, COMPRESSOR.depth + 2.4]}
        userData={{ castShadow: false }}
      />
    </group>
  );
}
