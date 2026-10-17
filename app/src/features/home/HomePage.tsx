import { Suspense, lazy, useEffect, useState } from 'react';
import { homeModeChanged } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { HomeSwitch } from './HomeSwitch';
import { Dashboard } from './dashboard/Dashboard';
import { POSTER, claimStudioFiles } from '../../studio/preload';
import { supportsWebGL } from './sceneSupport';
import type { PlantMetric } from '@ecocycle/shared';
import { KpiDetailContext, KpiDetailOpenContext } from '../../components/charts/KpiDetailContext';
import { KpiDetail } from './KpiDetail';

// 3D 홈(studio)은 3D를 고를 때만 불러온다. 대시보드만 쓰는 기기는 three.js를 내려받지 않는다.
// 이 조각(패널)은 작고 three가 없다. three.js와 장면은 그 안에서 한 번 더 나눠 받는다(studio/StudioScene)
const LiveStudio = lazy(() => import('../../studio').then((m) => ({ default: m.LiveStudio })));

/**
 * 홈 = "지금 정상인가". 맨 위 전환 하나로 3D(3D 홈, 화면 전체)와 대시보드(3D 없는 화면)를 오간다.
 * 로그인 후 시작 화면은 폰은 대시보드, 그 밖은 3D다. 접속 중에는 원하는 모드로 전환할 수 있다. 3D를 그릴 수 없는 기기(WebGL 없음)나 3D에서 오류가 나면
 * 기억한 값은 그대로 두고 대시보드로 보여 주며 짧게 알린다.
 */
export function HomePage() {
  const [metric, setMetric] = useState<PlantMetric | null>(null);
  return <KpiDetailContext.Provider value={setMetric}>
    <KpiDetailOpenContext.Provider value={metric !== null}>
    <HomeContent />
    {metric && <KpiDetail key={metric} metric={metric} onClose={() => setMetric(null)} />}
    </KpiDetailOpenContext.Provider>
  </KpiDetailContext.Provider>;
}

function HomeContent() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.ui.homeMode);
  const [failed, setFailed] = useState(false);

  const can3d = supportsWebGL() && !failed;
  const show3d = can3d && mode === '3d';
  // 3D 파일은 패널이 뜬 뒤 StudioView가 받기 시작한다: 앱 틀의 "한가할 때 받기"가 그 전에 끼어들지 않게 한다
  // (자식 효과가 부모보다 먼저 돈다). 로그인 화면에서 이미 받았으면 그대로 쓴다
  useEffect(() => {
    if (show3d) claimStudioFiles();
  }, [show3d]);
  const switcher = <HomeSwitch mode={show3d ? '3d' : 'dashboard'} can3d={can3d} onChange={(next) => dispatch(homeModeChanged(next))} />;

  if (show3d) {
    return (
      // 3D 홈은 홈 화면 전체를 쓴다 (틀을 넘겨받은 동안 틀은 안쪽 여백을 두지 않는다)
      <div className="h-full">
        <h1 className="sr-only">홈</h1>
        <Suspense fallback={<StudioFallback />}>
          <LiveStudio switcher={switcher} onFailed={() => setFailed(true)} />
        </Suspense>
      </div>
    );
  }

  const notice =
    mode === '3d' && !can3d ? (failed ? '3D를 그리는 중 문제가 생겨 대시보드로 보여 줍니다.' : '이 기기에서는 3D를 표시할 수 없어 대시보드로 보여 줍니다.') : null;
  return <Dashboard switcher={switcher} notice={notice} />;
}

/**
 * 패널 조각을 받는 동안(보통 미리 받아 두어 아주 짧다): 3D 홈의 준비 화면과 같은 모양(빈 장면 포스터 + 옅은 막 + 문구).
 * 스튜디오 스타일(studio.css)은 아직 없으므로 앱 클래스로 그린다.
 */
function StudioFallback() {
  return (
    <div role="status" aria-label="3D 장면을 준비하는 중" className="relative h-full overflow-hidden bg-[#eceff3]">
      <picture>
        <source media={POSTER.portraitQuery} srcSet={POSTER.tall} />
        <img src={POSTER.wide} alt="" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      <span className="absolute inset-0 bg-white/45 backdrop-blur-[2px]" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-white/90 px-3.5 py-2 text-xs text-ink-soft shadow-soft-1">
        3D 장면을 준비하는 중…
      </span>
    </div>
  );
}
