import { Suspense, lazy, useState } from 'react';
import type { DeviceId } from '@ecocycle/shared';
import { Button } from '../../components/common/Button';
import { homeViewChanged } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectDevice } from '../../store/selectors';
import { DeviceCard, PendingCard } from './DeviceCards';
import { DeviceDetailPanel } from './DeviceDetailPanel';
import { HomeAlarms } from './HomeAlarms';
import { HomeTabs } from './HomeTabs';
import { PhaseBar } from './PhaseBar';
import { LiveSceneView } from './SceneView';
import { SummaryCards } from './SummaryCards';
import { useHomeTab } from './homeTab';
import { supportsWebGL } from './sceneSupport';

// 스튜디오 탭(새 고화질 시안)은 용량이 커서 탭을 열 때만 불러온다. 기본 탭만 쓰는 기기는 내려받지 않는다
const LiveStudio = lazy(() => import('../../studio').then((m) => ({ default: m.LiveStudio })));

function Slot({ id }: { id: DeviceId }) {
  const device = useAppSelector(selectDevice(id));
  return device ? <DeviceCard device={device} /> : <PendingCard id={id} />;
}

/**
 * 홈 = "지금 정상인가". 한눈에 볼 요약, 알람, 기기별 핵심 값, 작업 단계를 보여 준다.
 * 기기 영역은 3D 장면(핀을 누르면 카메라가 이동하고 상세 카드가 열림) 또는 2D 카드로 본다.
 * 3D를 그릴 수 없는 기기나 3D에서 오류가 나면 같은 정보를 2D 카드로 보여 준다 (장면과 오버레이 정보는 분리되어 있다).
 * 3D 영역 위의 탭으로 "기본"(이 화면)과 "스튜디오"(studio/, 화면 전체를 쓰는 별도 시안)를 오간다. 고른 탭은 기기에 기억한다.
 */
export function HomePage() {
  const dispatch = useAppDispatch();
  const selectedId = useAppSelector((state) => state.ui.selectedDeviceId);
  const homeView = useAppSelector((state) => state.ui.homeView);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [studioFailed, setStudioFailed] = useState(false);
  const [tab, setTab] = useHomeTab();

  const canShowScene = supportsWebGL() && !sceneFailed;
  const showScene = canShowScene && homeView === 'scene';
  const tabs = <HomeTabs tab={tab} onChange={setTab} />;

  if (showScene && tab === 'studio' && !studioFailed) {
    return (
      // 스튜디오는 홈 화면 전체를 쓴다 (틀의 안쪽 여백을 지운다)
      <div className="-m-4 h-[calc(100%+2rem)]">
        <h1 className="sr-only">홈</h1>
        <Suspense
          fallback={
            <div role="status" className="flex h-full items-center justify-center text-slate-500">
              스튜디오를 불러오는 중…
            </div>
          }
        >
          <LiveStudio tabs={tabs} onFailed={() => setStudioFailed(true)} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">홈</h1>
      <SummaryCards />
      <HomeAlarms />

      {canShowScene ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showScene && !studioFailed ? tabs : <span />}
          {studioFailed && <p className="text-xs text-slate-500">스튜디오를 그리는 중 문제가 생겨 기본 장면으로 보여 줍니다.</p>}
          <div role="group" aria-label="표시 모드" className="flex items-center justify-end gap-2">
            <Button variant={showScene ? 'primary' : 'secondary'} aria-pressed={showScene} onClick={() => dispatch(homeViewChanged('scene'))}>
              3D
            </Button>
            <Button variant={!showScene ? 'primary' : 'secondary'} aria-pressed={!showScene} onClick={() => dispatch(homeViewChanged('cards'))}>
              2D
            </Button>
          </div>
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
