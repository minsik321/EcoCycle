import { Component, Suspense, lazy, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DeviceId, DeviceState, RobotModel } from '@ecocycle/shared';
import { QUALITY_PROFILES } from '../../config/quality';
import { chainSpecFor } from '../../scene/robot/chain';
import { demoSource, liveSource } from '../../scene/robot/jointSource';
import type { JointSource } from '../../scene/robot/jointSource';
import type { PinElements } from '../../scene/pins/PinProjector';
import { deviceSelected } from '../../store';
import type { QualityMode } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { getJointBuffer } from '../../store/realtimeClient';
import { selectIsDisconnected } from '../../store/selectors';
import { useRobotJointsSubscription } from '../../store/useRealtime';
import { useRobotModel } from '../robot/useRobot';
import { ScenePins } from './ScenePins';
import { useDocumentVisible } from './sceneSupport';

// 3D 라이브러리는 용량이 커서 3D 홈을 볼 때만 불러온다 (2D로 보는 기기는 내려받지 않는다)
const HomeScene = lazy(() => import('../../scene/HomeScene').then((m) => ({ default: m.HomeScene })));

/** 3D를 그리다 오류가 나면(그래픽 문제 등) 화면 전체가 죽지 않게 받아서 2D로 넘긴다 */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface SceneViewProps {
  devices: Partial<Record<DeviceId, DeviceState>>;
  selectedId: DeviceId | null;
  onSelect: (id: DeviceId | null) => void;
  jointSource: JointSource;
  robotModel?: RobotModel;
  qualityMode: QualityMode;
  /** 연결이 끊겼다: 움직임을 멈추고 모든 상태를 "연결 끊김"으로 보여 준다 */
  disconnected: boolean;
  /** 화면이 숨겨졌거나 CCTV가 열렸다: 그리기를 멈춘다 */
  paused: boolean;
  /** 3D를 그리지 못했을 때 부른다 (홈이 2D 카드로 바꾼다) */
  onFailed: () => void;
  className?: string;
}

/**
 * 3D 장면 영역: 장면(Canvas)과 그 위의 HTML 핀, 안내 표시. 데이터는 모두 props로 받는다.
 * (실제 데이터를 연결하는 것은 LiveSceneView, 서버 없이 보여 주는 것은 SceneDemoPage)
 */
export function SceneView({ devices, selectedId, onSelect, jointSource, robotModel, qualityMode, disconnected, paused, onFailed, className = '' }: SceneViewProps) {
  const pins = useRef<PinElements>({});
  const robotSpec = useMemo(() => chainSpecFor(robotModel), [robotModel]);

  return (
    <section aria-label="3D 장면" className={`relative h-[58vh] min-h-[360px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${className}`}>
      <SceneBoundary onError={onFailed}>
        <Suspense
          fallback={
            <div role="status" className="flex h-full items-center justify-center text-slate-500">
              3D 장면을 불러오는 중…
            </div>
          }
        >
          <HomeScene
            // 화질 모드가 바뀌면 그래픽 설정이 달라지므로 장면을 새로 만든다
            key={qualityMode}
            devices={devices}
            selectedId={selectedId}
            onSelect={onSelect}
            jointSource={jointSource}
            robotSpec={robotSpec}
            quality={QUALITY_PROFILES[qualityMode]}
            frozen={disconnected}
            paused={paused}
            pins={pins}
          />
        </Suspense>
      </SceneBoundary>
      <ScenePins pins={pins} devices={devices} selectedId={selectedId} disconnected={disconnected} onSelect={onSelect} />

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-2">
        {jointSource.kind === 'demo' && (
          <span className="rounded-full border border-slate-400 bg-white/95 px-3 py-1 text-xs font-semibold text-slate-800">
            시연 동작 (실제 로봇 값이 아닙니다)
          </span>
        )}
        {disconnected && (
          <span className="rounded-full border-2 border-status-offline bg-gray-100 px-3 py-1 text-xs font-semibold text-status-offline">
            – 연결 끊김 · 로봇팔과 설비의 움직임을 멈췄습니다
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * 홈의 3D 장면: 저빈도 값은 store에서 골라 넘기고, 관절 값은 jointBuffer를 장면이 직접 읽는다.
 * 이 화면에 있는 동안만 관절 값을 구독하고, 화면이 숨겨지거나 CCTV가 열리면 그리기를 멈춘다.
 */
export function LiveSceneView({ onFailed }: { onFailed: () => void }) {
  useRobotJointsSubscription();
  const dispatch = useAppDispatch();
  const devices = useAppSelector((state) => state.devices.byId);
  const selectedId = useAppSelector((state) => state.ui.selectedDeviceId);
  const qualityMode = useAppSelector((state) => state.ui.qualityMode);
  const cctvOpen = useAppSelector((state) => state.ui.cctvOpen);
  const disconnected = useAppSelector(selectIsDisconnected);
  const visible = useDocumentVisible();
  const model = useRobotModel();
  const [params] = useSearchParams();
  const demo = params.get('demo') === '1';

  // 주소에 ?demo=1 이 있으면 서버의 관절 값 대신 정해진 시연 동작을 보여 준다 (명세의 최후 수단)
  const jointSource = useMemo(() => (demo ? demoSource(Date.now()) : liveSource(getJointBuffer)), [demo]);

  return (
    <SceneView
      devices={devices}
      selectedId={selectedId}
      onSelect={(id) => dispatch(deviceSelected(id))}
      jointSource={jointSource}
      robotModel={model}
      qualityMode={qualityMode}
      disconnected={disconnected}
      paused={!visible || cctvOpen}
      onFailed={onFailed}
    />
  );
}
