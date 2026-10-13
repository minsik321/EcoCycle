import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import type { DeviceStatus } from '@ecocycle/shared';
import { COMPRESSOR } from '../../config/sceneLayout';
import { GEOMETRY, MATERIALS, STATUS_MATERIAL } from '../materials';

const PRESS_TRAVEL = 0.35;
const PRESS_PERIOD_SEC = 2.4;

export interface CompressorProps {
  running: boolean;
  status: DeviceStatus;
  frozen: boolean;
  onSelect: () => void;
}

/** 압축기: 몸통, 위에서 오르내리는 압축판(가동 중일 때만 움직임), 상태 색 표시 */
export function Compressor({ running, status, frozen, onSelect }: CompressorProps) {
  const press = useRef<Mesh>(null);
  const phase = useRef(0);
  const topY = COMPRESSOR.height;

  useFrame((_state, delta) => {
    if (!running || frozen || !press.current) return;
    phase.current = (phase.current + Math.min(delta, 0.1) / PRESS_PERIOD_SEC) % 1;
    // 0~1을 오르내리는 값으로
    const k = 0.5 - 0.5 * Math.cos(phase.current * Math.PI * 2);
    press.current.position.y = topY + 0.5 - k * PRESS_TRAVEL;
  });

  return (
    <group
      position={[COMPRESSOR.x, 0, COMPRESSOR.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <mesh geometry={GEOMETRY.box} material={MATERIALS.machine} position={[0, COMPRESSOR.height / 2, 0]} scale={[COMPRESSOR.width, COMPRESSOR.height, COMPRESSOR.depth]} />
      {/* 압축판과 기둥 */}
      <mesh ref={press} geometry={GEOMETRY.box} material={MATERIALS.machineDark} position={[0, topY + 0.5, 0]} scale={[COMPRESSOR.width * 0.7, 0.18, COMPRESSOR.depth * 0.7]} />
      <mesh geometry={GEOMETRY.box} material={MATERIALS.machineDark} position={[0, topY + 0.45, 0]} scale={[0.16, 0.9, 0.16]} />
      {/* 상태 색 표시 (앞쪽 모서리) */}
      <mesh geometry={GEOMETRY.box} material={STATUS_MATERIAL[status]} position={[COMPRESSOR.width / 2 + 0.03, COMPRESSOR.height * 0.75, COMPRESSOR.depth / 2 - 0.25]} scale={[0.06, 0.3, 0.3]} />
    </group>
  );
}
