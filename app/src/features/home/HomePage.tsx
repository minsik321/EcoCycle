import { useState } from 'react';
import type { DeviceId } from '@ecocycle/shared';
import { Button } from '../../components/common/Button';
import { homeViewChanged } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { DeviceCard, PendingCard } from './DeviceCards';
import { DeviceDetailPanel } from './DeviceDetailPanel';
import { HomeAlarms } from './HomeAlarms';
import { PhaseBar } from './PhaseBar';
import { LiveSceneView } from './SceneView';
import { SummaryCards } from './SummaryCards';
import { supportsWebGL } from './sceneSupport';

function Slot({ id }: { id: DeviceId }) {
  const device = useAppSelector(selectDevice(id));
  return device ? <DeviceCard device={device} /> : <PendingCard id={id} />;
}

/**
 * 홈 = "지금 정상인가". 한눈에 볼 요약, 알람, 기기별 핵심 값, 작업 단계를 보여 준다.
 * 기기 영역은 3D 장면(핀을 누르면 카메라가 이동하고 상세 카드가 열림) 또는 2D 카드로 본다.
 * 3D를 그릴 수 없는 기기나 3D에서 오류가 나면 같은 정보를 2D 카드로 보여 준다 (장면과 오버레이 정보는 분리되어 있다).
 */
export function HomePage() {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((state) => state.ui.selectedDeviceId);
  const homeView = useAppSelector((state) => state.ui.homeView);
  const [sceneFailed, setSceneFailed] = useState(false);

  const canShowScene = supportsWebGL() && !sceneFailed;
  const showScene = canShowScene && homeView === 'scene';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">홈</h1>
      <SummaryCards />
      <HomeAlarms />

      {canShowScene ? (
        <div role="group" aria-label="표시 모드" className="flex items-center justify-end gap-2">
          <Button variant={showScene ? 'primary' : 'secondary'} aria-pressed={showScene} onClick={() => dispatch(homeViewChanged('scene'))}>
            3D
          </Button>
          <Button variant={!showScene ? 'primary' : 'secondary'} aria-pressed={!showScene} onClick={() => dispatch(homeViewChanged('cards'))}>
            2D
          </Button>
        </div>
      ) : (
        homeView === 'scene' && (
          <p className="text-right text-xs text-slate-500">
            {sceneFailed ? '3D 장면을 그리는 중 문제가 생겨 2D로 보여 줍니다.' : '이 기기에서는 3D 장면을 표시할 수 없어 2D로 보여 줍니다.'}
          </p>
        )
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {showScene ? (
            <LiveSceneView onFailed={() => setSceneFailed(true)} />
          ) : (
            <section aria-label="기기 상태" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Slot id="tank-a1" />
              <Slot id="tank-a2" />
              <Slot id="tank-b1" />
              <Slot id="tank-b2" />
              <Slot id="robot-1" />
              <Slot id="conveyor-z" />
              <Slot id="compressor-1" />
            </section>
          )}
        </div>
        {selectedId && (
          <div className="lg:w-96 lg:shrink-0">
            <DeviceDetailPanel id={selectedId} />
          </div>
        )}
      </div>
      <PhaseBar />
    </div>
  );
}
