import { Suspense, lazy, useState } from 'react';
import { homeModeChanged } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { HomeSwitch } from './HomeSwitch';
import { Dashboard } from './dashboard/Dashboard';
import { supportsWebGL } from './sceneSupport';

// 3D 홈(studio)은 용량이 커서 3D를 고를 때만 불러온다. 대시보드만 쓰는 기기는 three.js를 내려받지 않는다
const LiveStudio = lazy(() => import('../../studio').then((m) => ({ default: m.LiveStudio })));

/**
 * 홈 = "지금 정상인가". 맨 위 전환 하나로 3D(3D 홈, 화면 전체)와 대시보드(3D 없는 화면)를 오간다.
 * 고른 쪽은 기기에 기억하고(ui.homeMode) 기본은 3D다. 3D를 그릴 수 없는 기기(WebGL 없음)나 3D에서 오류가 나면
 * 기억한 값은 그대로 두고 대시보드로 보여 주며 짧게 알린다.
 */
export function HomePage() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.ui.homeMode);
  const [failed, setFailed] = useState(false);

  const can3d = supportsWebGL() && !failed;
  const show3d = can3d && mode === '3d';
  const switcher = <HomeSwitch mode={show3d ? '3d' : 'dashboard'} can3d={can3d} onChange={(next) => dispatch(homeModeChanged(next))} />;

  if (show3d) {
    return (
      // 3D 홈은 홈 화면 전체를 쓴다 (틀의 안쪽 여백을 지운다)
      <div className="-m-4 h-[calc(100%+2rem)]">
        <h1 className="sr-only">홈</h1>
        <Suspense
          fallback={
            <div role="status" className="flex h-full items-center justify-center text-ink-soft">
              3D 장면을 불러오는 중…
            </div>
          }
        >
          <LiveStudio switcher={switcher} onFailed={() => setFailed(true)} />
        </Suspense>
      </div>
    );
  }

  const notice =
    mode === '3d' && !can3d ? (failed ? '3D를 그리는 중 문제가 생겨 대시보드로 보여 줍니다.' : '이 기기에서는 3D를 표시할 수 없어 대시보드로 보여 줍니다.') : null;
  return <Dashboard switcher={switcher} notice={notice} />;
}
