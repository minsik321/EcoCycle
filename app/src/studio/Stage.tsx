import { Canvas, advance, useThree } from '@react-three/fiber';
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, TiltShift2, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { memo, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, ReactElement } from 'react';
import { NeutralToneMapping } from 'three';
import type { DeviceStatus, SectorGrade, TankId } from '@ecocycle/shared';
import type { QualityTier } from '../config/quality';
import type { ChainSpec } from './robot/chain';
import type { JointSource } from './robot/jointSource';
import { Bales, Forklift, Trucks, Workers } from './actors/Actors';
import { Robot } from './actors/Robot';
import { STUDIO_PROFILES } from './quality';
import type { StudioProfile } from './quality';
import type { Director } from './sim/director';
import { Pace } from './sim/pace';
import { C } from './theme';
import { EnvLight, PinLayer, Routes, SelectionBox, SelectionRing, Sim } from './three/Fx';
import type { PinElements } from './three/Fx';
import { Motion, MotionContext } from './three/motion';
import { Rig } from './three/Rig';
import type { RigApi } from './three/Rig';
import { BalerParts, Belt, DeviceHits, GateArms, Piles, World } from './world/Dynamic';
import { ParkedCars } from './world/ParkedCars';

// 스튜디오의 3D 무대. 데이터는 모두 props와 Director로 받는다 (store를 직접 읽지 않는다).
// 화질 단계(quality.ts)마다 그리는 것이 다르다: high는 실시간 부드러운 그림자·N8AO·빛 번짐·얕은 심도,
// standard는 반 해상도 N8AO와 2048 그림자, low는 후처리 없이 미리 구운 바닥 그림자.
// 필요할 때만 그린다 (frameloop="demand"): Pacer가 박자마다 월드 시계를 돌리고, 무엇이 움직였을 때만 한 장 그린다.
// 빛은 참고 화면(docs/reference/)처럼 밝고 차갑게. 노출을 너무 올리면 밝은 바닥들이 같은 흰색으로 뭉개진다.

export interface StageProps {
  director: Director;
  jointSource: JointSource;
  robotSpec: ChainSpec;
  /** 화질 단계 (studio/quality.ts) */
  tier: QualityTier;
  /** 연결 끊김: 월드 시계와 로봇을 멈추고 색을 뺀다. 카메라는 계속 움직일 수 있다 */
  frozen: boolean;
  /** 화면이 숨겨졌거나 CCTV가 열렸다: 그리기 자체를 멈춘다 */
  paused: boolean;
  selection: string | null;
  onSelect: (key: string | null) => void;
  pins: MutableRefObject<PinElements>;
  /** 경로 점선과 목적지 핀을 그릴 대상 (고른 차량·지게차) */
  routeKeys: MutableRefObject<string[]>;
  rig: MutableRefObject<RigApi | null>;
  inset: { right: number; bottom: number; top: number };
  balerStatus: DeviceStatus;
  grades: Partial<Record<TankId, SectorGrade>>;
  /** 셰이더를 미리 컴파일하고 첫 장을 그렸다 (그때까지 화면은 포스터를 보여 준다) */
  onReady?: () => void;
}

const SUN: [number, number, number] = [-22, 38, -19];
const SHADOW = 30;

/**
 * 박자 맞추기: 정해진 간격(단계의 프레임 상한)마다 월드 시계를 돌리고, 무엇이 움직였거나 깨우개가 부르면 한 장 그린다.
 * 끊기면(frozen) 시계를 돌리지 않는다. 화면이 숨겨지면(paused) 이 컴포넌트 자체를 내린다.
 */
function Pacer({ director, frozen, maxFps, motion }: { director: Director; frozen: boolean; maxFps: number; motion: Motion }) {
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  useEffect(() => {
    const pace = new Pace(director, motion, maxFps);
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // 같은 주사 안에서 바로 그린다 (invalidate로 다음 주사에 미루면 한 장씩 늦어져 상한 없는 단계가 절반 속도가 된다)
      if (pace.advance(now, frozenRef.current)) advance(now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [director, maxFps, motion]);
  return null;
}

/** 셰이더를 미리 컴파일한다 (첫 움직임에서 멈칫하지 않게). 끝나면 한 장 그리고 알린다 */
function WarmUp({ onReady }: { onReady?: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    let cancelled = false;
    // 자식들이 모두 장면에 붙은 뒤에 컴파일한다
    const start = requestAnimationFrame(() => {
      const compile = typeof gl.compileAsync === 'function' ? gl.compileAsync(scene, camera) : Promise.resolve(scene);
      void compile
        .catch(() => scene)
        .then(() => {
          if (cancelled) return;
          invalidate();
          // 그린 장이 화면에 나간 다음 포스터를 걷는다
          requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && ready.current?.()));
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(start);
    };
  }, [gl, scene, camera, invalidate]);
  return null;
}

/** 단계에 맞는 후처리 묶음. low는 쓰지 않는다 */
function Post({ profile, frozen }: { profile: StudioProfile; frozen: boolean }) {
  const effects: ReactElement[] = [];
  // 주변 차폐를 조금 진하게: 같은 밝기의 면들이 형태로 갈라지게
  if (profile.ao === 'n8ao') effects.push(<N8AO key="ao" aoRadius={1.8} distanceFalloff={1.2} intensity={2.5} quality="high" color="#5a6580" />);
  else effects.push(<N8AO key="ao" aoRadius={1.8} distanceFalloff={1.2} intensity={2.3} quality="low" halfRes color="#5a6580" />);
  if (profile.bloom) effects.push(<Bloom key="bloom" mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.32} radius={0.7} />);
  if (profile.tiltShift) effects.push(<TiltShift2 key="tilt" blur={0.012} taper={0.75} />);
  // 채도는 그대로 둔다. 회색 화면은 연결 끊김에만
  effects.push(<HueSaturation key="hue" saturation={frozen ? -0.92 : 0} />);
  effects.push(<BrightnessContrast key="bc" brightness={frozen ? -0.03 : 0.02} contrast={frozen ? -0.08 : 0.03} />);
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.NEUTRAL} />);
  effects.push(<SMAA key="aa" />);
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  );
}

function StageImpl({ director, jointSource, robotSpec, tier, frozen, paused, selection, onSelect, pins, routeKeys, rig, inset, balerStatus, grades, onReady }: StageProps) {
  const profile = STUDIO_PROFILES[tier];
  const motion = useMemo(() => new Motion(), []);
  const baked = profile.shadowMap === 0;

  // 한 번 일어나는 변화(고르기, 끊김, 등급·상태 색, 패널 여백)는 몇 장만 다시 그린다
  useEffect(() => motion.kick(4), [motion, selection, frozen, grades, balerStatus, inset, tier]);

  return (
    <Canvas
      // 단계가 바뀌면 렌더러 설정(그림자·톤 매핑·배율)이 달라지므로 새로 만든다
      key={tier}
      flat={profile.post}
      shadows={profile.shadowMap > 0 ? 'soft' : false}
      frameloop={paused ? 'never' : 'demand'}
      dpr={[1, profile.maxDpr]}
      gl={{ antialias: !profile.post && profile.maxDpr > 1, alpha: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={({ gl }) => {
        // 후처리가 없으면 톤 매핑은 렌더러가 한다 (후처리가 있으면 ToneMapping 효과가 한다)
        if (!profile.post) gl.toneMapping = NeutralToneMapping;
      }}
      camera={{ fov: 20, near: 2, far: 420, position: [60, 60, -60] }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <MotionContext.Provider value={motion}>
        <color attach="background" args={[C.bg]} />
        {/* 먼 곳은 바탕색으로 옅어진다: 밝고 살짝 뿌연 공기 (부지 안의 밝기 단계는 지우지 않게 멀리서 시작) */}
        <fog attach="fog" args={[C.bg, 110, 260]} />
        <EnvLight intensity={0.4} />
        <hemisphereLight args={['#ffffff', '#e9edf4', baked ? 0.78 : 0.62]} />
        {/* 해는 약하게, 그림자는 옅고 부드럽게 (진한 그림자 대신 주변 차폐로 형태를 잡는다) */}
        <directionalLight
          position={SUN}
          color="#fffaf2"
          intensity={1.2}
          castShadow={profile.shadowMap > 0}
          shadow-mapSize={[profile.shadowMap || 512, profile.shadowMap || 512]}
          shadow-bias={-0.0003}
          shadow-normalBias={0.035}
          shadow-radius={8}
          shadow-intensity={0.42}
        >
          <orthographicCamera attach="shadow-camera" args={[-SHADOW, SHADOW, SHADOW, -SHADOW, 1, 140]} />
        </directionalLight>
        <directionalLight position={[26, 18, 24]} color="#eef3ff" intensity={0.3} />

        <Sim />
        {!paused && <Pacer director={director} frozen={frozen} maxFps={profile.maxFps} motion={motion} />}
        <WarmUp onReady={onReady} />
        <Rig director={director} focusKey={selection} api={rig} inset={inset} />

        <World baked={baked} />
        <ParkedCars />
        <Piles director={director} grades={grades} />
        <Belt director={director} />
        <BalerParts director={director} status={frozen ? 'offline' : balerStatus} />
        <GateArms director={director} />
        <Robot spec={robotSpec} source={jointSource} frozen={frozen} director={director} onSelect={onSelect} />
        <Trucks director={director} onSelect={onSelect} blobs={baked} />
        <Forklift director={director} onSelect={onSelect} blobs={baked} />
        <Bales director={director} onSelect={onSelect} />
        <Workers director={director} />
        <DeviceHits onSelect={onSelect} />

        <Routes director={director} keys={routeKeys} />
        <SelectionRing director={director} focusKey={selection} />
        <SelectionBox director={director} focusKey={selection} />
        <PinLayer director={director} pins={pins} />

        {profile.post && <Post profile={profile} frozen={frozen} />}
      </MotionContext.Provider>
    </Canvas>
  );
}

/**
 * 패널(시계·측정 문구)이 1초마다 다시 그려져도 무대는 다시 그리지 않는다
 * (r3f는 새로 만든 배열 props를 바뀐 값으로 보고 한 장을 더 그린다: 필요할 때만 그리기가 깨진다).
 */
export const Stage = memo(StageImpl);
