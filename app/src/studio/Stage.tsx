import { Canvas } from '@react-three/fiber';
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, TiltShift2, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { MutableRefObject } from 'react';
import type { DeviceStatus, SectorGrade, TankId } from '@ecocycle/shared';
import type { ChainSpec } from '../scene/robot/chain';
import type { JointSource } from '../scene/robot/jointSource';
import { Bales, Forklift, Trucks, Workers } from './actors/Actors';
import { Robot } from './actors/Robot';
import type { Director } from './sim/director';
import { C } from './theme';
import { EnvLight, PinLayer, Routes, SelectionRing, Sim } from './three/Fx';
import type { PinElements } from './three/Fx';
import { Rig } from './three/Rig';
import type { RigApi } from './three/Rig';
import { BalerParts, Belt, DeviceHits, GateArms, Piles, World } from './world/Dynamic';
import { ParkedCars } from './world/ParkedCars';

// 스튜디오의 3D 무대. 데이터는 모두 props와 Director로 받는다 (store를 직접 읽지 않는다).
// 여기는 성능보다 화질이 먼저다: 실시간 부드러운 그림자, 환경광, 주변 차폐(AO), 빛 번짐, 얕은 심도.

export interface StageProps {
  director: Director;
  jointSource: JointSource;
  robotSpec: ChainSpec;
  /** 연결 끊김: 월드 시계와 로봇을 멈추고 색을 뺀다. 카메라는 계속 움직일 수 있다 */
  frozen: boolean;
  /** 화면이 숨겨졌거나 CCTV가 열렸다: 그리기 자체를 멈춘다 */
  paused: boolean;
  selection: string | null;
  onSelect: (key: string | null) => void;
  pins: MutableRefObject<PinElements>;
  /** 경로 점선을 그릴 대상 */
  routeKeys: MutableRefObject<string[]>;
  rig: MutableRefObject<RigApi | null>;
  inset: { right: number; bottom: number; top: number };
  balerStatus: DeviceStatus;
  grades: Partial<Record<TankId, SectorGrade>>;
}

const SUN: [number, number, number] = [-22, 38, -19];
const SHADOW = 30;

export function Stage({ director, jointSource, robotSpec, frozen, paused, selection, onSelect, pins, routeKeys, rig, inset, balerStatus, grades }: StageProps) {
  return (
    <Canvas
      flat
      shadows="soft"
      frameloop={paused ? 'never' : 'always'}
      dpr={[1, 2]}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 20, near: 2, far: 420, position: [60, 60, -60] }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[C.bg]} />
      <fog attach="fog" args={[C.bg, 150, 300]} />
      <EnvLight intensity={0.36} />
      <hemisphereLight args={['#ffffff', '#efe3d2', 0.6]} />
      <directionalLight
        position={SUN}
        color="#fff0dc"
        intensity={2.6}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.035}
        shadow-radius={5}
      >
        <orthographicCamera attach="shadow-camera" args={[-SHADOW, SHADOW, SHADOW, -SHADOW, 1, 140]} />
      </directionalLight>
      <directionalLight position={[26, 18, 24]} color="#dfe9ff" intensity={0.22} />

      <Sim director={director} frozen={frozen} />
      <Rig director={director} focusKey={selection} api={rig} inset={inset} />

      <World />
      <ParkedCars />
      <Piles director={director} grades={grades} />
      <Belt director={director} />
      <BalerParts director={director} status={frozen ? 'offline' : balerStatus} />
      <GateArms director={director} />
      <Robot spec={robotSpec} source={jointSource} frozen={frozen} director={director} onSelect={onSelect} />
      <Trucks director={director} onSelect={onSelect} />
      <Forklift director={director} onSelect={onSelect} />
      <Bales director={director} onSelect={onSelect} />
      <Workers director={director} />
      <DeviceHits onSelect={onSelect} />

      <Routes director={director} keys={routeKeys} />
      <SelectionRing director={director} focusKey={selection} />
      <PinLayer director={director} pins={pins} />

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={1.5} distanceFalloff={1.1} intensity={2.6} quality="high" color="#4c566b" />
        <Bloom mipmapBlur luminanceThreshold={1.05} luminanceSmoothing={0.2} intensity={0.5} radius={0.7} />
        <TiltShift2 blur={0.022} taper={0.7} />
        <HueSaturation saturation={frozen ? -0.92 : 0.14} />
        <BrightnessContrast brightness={frozen ? -0.03 : 0.025} contrast={frozen ? -0.08 : 0.07} />
        <Vignette offset={0.32} darkness={0.32} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
