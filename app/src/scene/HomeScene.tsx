import { Canvas } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, DeviceState, DeviceStatus } from '@ecocycle/shared';
import type { QualityProfile } from '../config/quality';
import { CameraRig } from './camera/CameraRig';
import { FrameDriver } from './frame';
import { cameraPresetFor } from './layout';
import { BACKGROUND } from './materials';
import { Compressor } from './objects/Compressor';
import { Conveyor } from './objects/Conveyor';
import { RobotArm } from './objects/RobotArm';
import { Room } from './objects/Room';
import { Tank } from './objects/Tank';
import { PinProjector } from './pins/PinProjector';
import type { PinElements } from './pins/PinProjector';
import type { ChainSpec } from './robot/chain';
import type { JointSource } from './robot/jointSource';

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
 * 홈 3D 장면. 밝은 저폴리 아이소메트릭이고, 화려한 연출보다 저사양 태블릿에서 끊김 없이 도는 것이 목표다.
 * - 그리기는 요청할 때만(frameloop="demand"), 초당 quality.maxFps번 이하.
 * - 실시간 그림자·투명·발광 없음. 카메라 회전·핀치 확대 없음.
 * - 저빈도 값(상태·수위)은 props로, 고빈도 관절 값은 jointSource로 받는다 (Redux를 매 프레임 구독하지 않는다).
 */
export function HomeScene({ devices, selectedId, onSelect, jointSource, robotSpec, quality, frozen, paused, pins }: HomeSceneProps) {
  const cameraBusy = useRef(false);
  const preset = useMemo(() => cameraPresetFor(selectedId), [selectedId]);
  const show = (status: DeviceStatus | undefined): DeviceStatus => (frozen || !status ? 'offline' : status);

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
      frameloop="demand"
      dpr={[1, quality.maxPixelRatio]}
      gl={{ antialias: quality.antialias, alpha: false, powerPreference: 'low-power' }}
      camera={{ near: 0.1, far: 200 }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'pan-y' }}
    >
      <color attach="background" args={[BACKGROUND]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[6, 12, -8]} intensity={1.6} />

      <FrameDriver maxFps={quality.maxFps} animating={animating} paused={paused} busyRef={cameraBusy} />
      <CameraRig preset={preset} busyRef={cameraBusy} />

      <Room />
      {TANK_IDS.map((id) => {
        const tank = devices[id];
        return (
          <Tank
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

      <PinProjector pins={pins} />
    </Canvas>
  );
}
