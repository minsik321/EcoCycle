import { Canvas, useThree } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Mesh } from 'three';
import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, DeviceState, DeviceStatus } from '@ecocycle/shared';
import type { QualityProfile } from '../config/quality';
import { SITE, SUN } from '../config/sceneLayout';
import { CameraRig } from './camera/CameraRig';
import { FrameDriver } from './frame';
import { cameraPresetFor } from './layout';
import { BACKGROUND } from './materials';
import { Compressor } from './objects/Compressor';
import { Conveyor } from './objects/Conveyor';
import { RobotArm } from './objects/RobotArm';
import { Sector } from './objects/Sector';
import { StaticWorld } from './objects/StaticWorld';
import { PinProjector } from './pins/PinProjector';
import type { PinElements } from './pins/PinProjector';
import type { ChainSpec } from './robot/chain';
import type { JointSource } from './robot/jointSource';

// 조명: 위(바닥·지붕)가 가장 밝고, 카메라에서 보이는 두 옆면이 서로 다른 밝기로 보이도록 맞춘 값.
// 해는 화면 왼쪽에서 비춰 그림자가 물체 오른쪽으로 떨어지고, 해가 닿지 않는 면은 약한 보조광이 채운다(그림자 없음).
const AMBIENT_INTENSITY = 1.7;
const SUN_INTENSITY = 1.5;
const FILL_INTENSITY = 0.3;
const FILL_POSITION = [-3, 6, -8] as const;
const SUN_DISTANCE = 30;
const SUN_LENGTH = Math.hypot(...SUN.direction);
const SUN_POSITION = SUN.direction.map((v) => (v / SUN_LENGTH) * SUN_DISTANCE) as [number, number, number];
/** 그림자를 그릴 범위 (부지를 다 덮는 넉넉한 네모) */
const SHADOW_RANGE = Math.max(SITE.maxX - SITE.minX, SITE.maxZ - SITE.minZ) * 0.78;

/** 실시간 그림자를 쓰는 화질 단계에서 장면의 모든 메시가 그림자를 드리우고 받게 한다 (userData.castShadow가 false인 것은 받기만) */
function ShadowFlags() {
  const scene = useThree((state) => state.scene);
  useLayoutEffect(() => {
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      mesh.castShadow = mesh.userData.castShadow !== false;
    });
  }, [scene]);
  return null;
}

export interface HomeSceneProps {
  /** 기기 ID별 최신 상태 (store의 저빈도 값). 아직 못 받은 기기는 없을 수 있다 */
  devices: Partial<Record<DeviceId, DeviceState>>;
  selectedId: DeviceId | null;
  onSelect: (id: DeviceId | null) => void;
  /** 로봇 관절 값을 주는 곳 (실시간 / 시연 / 정지) */
  jointSource: JointSource;
  robotSpec: ChainSpec;
  quality: QualityProfile;
  /** 연결이 끊겼다: 움직임을 멈추고 상태 색을 "연결 끊김"으로 그린다 */
  frozen: boolean;
  /** 화면이 숨겨졌거나 CCTV가 열렸다: 그리기 루프를 멈춘다 */
  paused: boolean;
  /** HTML 핀 요소들 (features/home이 만들고, 장면이 위치를 써 넣는다) */
  pins: MutableRefObject<PinElements>;
}

/**
 * 홈 3D 장면: 공장 부지 전체를 내려다보는 밝은 저폴리 아이소메트릭.
 * - 그리기는 요청할 때만(frameloop="demand"), 초당 quality.maxFps번 이하.
 * - 그림자는 화질 단계에 따라 미리 그린 것(low)이거나 실시간(standard, high)이다. 투명 재질은 쓰지 않는다.
 * - 저빈도 값(상태·적재율)은 props로, 고빈도 관절 값은 jointSource로 받는다 (Redux를 매 프레임 구독하지 않는다).
 */
export function HomeScene({ devices, selectedId, onSelect, jointSource, robotSpec, quality, frozen, paused, pins }: HomeSceneProps) {
  const cameraBusy = useRef(false);
  const preset = useMemo(() => cameraPresetFor(selectedId), [selectedId]);
  const show = (status: DeviceStatus | undefined): DeviceStatus => (frozen || !status ? 'offline' : status);
  const realtimeShadows = quality.shadows !== 'baked';

  const robot = devices['robot-1'];
  const conveyor = devices['conveyor-z'];
  const compressor = devices['compressor-1'];
  const robotMoving = robot?.type === 'robot' && robot.status === 'running';
  const conveyorRunning = conveyor?.type === 'conveyor' && conveyor.running;
  const compressorRunning = compressor?.type === 'compressor' && compressor.running;
  // 시연 동작은 서버 상태와 상관없이 움직인다
  const animating = !frozen && (robotMoving || conveyorRunning || compressorRunning || jointSource.kind === 'demo');

  return (
    <Canvas
      orthographic
      flat
      frameloop="demand"
      shadows={realtimeShadows ? 'percentage' : false}
      dpr={[1, quality.maxPixelRatio]}
      gl={{ antialias: quality.antialias, alpha: false, powerPreference: 'low-power' }}
      camera={{ near: 0.1, far: 200 }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'pan-y' }}
    >
      <color attach="background" args={[BACKGROUND]} />
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight position={SUN_POSITION} intensity={SUN_INTENSITY} castShadow={realtimeShadows} shadow-mapSize={[quality.shadowMapSize || 512, quality.shadowMapSize || 512]} shadow-bias={-0.0006} shadow-normalBias={0.03} shadow-radius={quality.shadows === 'soft' ? 3 : 1}>
        <orthographicCamera attach="shadow-camera" args={[-SHADOW_RANGE, SHADOW_RANGE, SHADOW_RANGE, -SHADOW_RANGE, 1, SUN_DISTANCE * 2]} />
      </directionalLight>
      <directionalLight position={FILL_POSITION} intensity={FILL_INTENSITY} />

      <FrameDriver maxFps={quality.maxFps} animating={animating} paused={paused} busyRef={cameraBusy} />
      <CameraRig preset={preset} busyRef={cameraBusy} />

      <StaticWorld detail={quality.detail} bakedShadows={!realtimeShadows} groundPxPerM={quality.groundPxPerM} />
      {TANK_IDS.map((id) => {
        const tank = devices[id];
        return (
          <Sector
            key={id}
            id={id}
            fillPercent={tank?.type === 'tank' ? tank.fillPercent : 0}
            status={show(tank?.type === 'tank' ? tank.status : undefined)}
            maxChunks={quality.maxChunksPerTank}
            onSelect={onSelect}
          />
        );
      })}
      <RobotArm spec={robotSpec} source={jointSource} frozen={frozen} onSelect={() => onSelect('robot-1')} />
      <Conveyor
        running={!!conveyorRunning}
        loadPercent={conveyor?.type === 'conveyor' ? conveyor.loadPercent : 0}
        status={show(conveyor?.type === 'conveyor' ? conveyor.status : undefined)}
        slatCount={quality.beltSlats}
        frozen={frozen}
        onSelect={() => onSelect('conveyor-z')}
      />
      <Compressor
        running={!!compressorRunning}
        status={show(compressor?.type === 'compressor' ? compressor.status : undefined)}
        frozen={frozen}
        onSelect={() => onSelect('compressor-1')}
      />

      {realtimeShadows && <ShadowFlags />}
      <PinProjector pins={pins} />
    </Canvas>
  );
}
