import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { NAV_ITEMS } from './config/navigation';
import { LoginPage, RequireAuth } from './features/auth';
import { AlarmsPage } from './features/alarms';
import { CctvButton, CctvOverlay } from './features/cctv';
import { CompressorPage } from './features/compressor';
import { ConveyorPage } from './features/conveyor';
import { DesignPage } from './features/design/DesignPage';
import { HomePage } from './features/home/HomePage';
import { RobotPage } from './features/robot';
import { SettingsPage } from './features/settings';
import { TankListPage, TankPage } from './features/tank';

// 시연·측정 화면은 점검할 때만 쓰므로 처음 묶음에 넣지 않고 그 주소를 열 때 불러온다
const SceneDemoPage = lazy(() => import('./features/home/SceneDemoPage').then((m) => ({ default: m.SceneDemoPage })));

// 별도 라우트를 가진 화면. 나머지는 아래 Placeholder로 이어진다.
const IMPLEMENTED = new Set(['tanks', 'robot', 'conveyor', 'compressor', 'alarms', 'settings']);

// 화면(features)을 하나씩 만들면서 아래 Placeholder를 실제 화면으로 바꾼다.
function Placeholder({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-slate-600">이 화면은 아직 만들지 않았습니다.</p>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* 서버·로그인 없이 3D 장면만 보여 주는 시연·측정 페이지 (값은 모두 가짜) */}
      <Route
        path="/scene-demo"
        element={
          <Suspense fallback={null}>
            <SceneDemoPage />
          </Suspense>
        }
      />
      {/* 디자인 토큰과 공용 컴포넌트 미리 보기 (개발용, 값은 모두 예시) */}
      <Route path="/design" element={<DesignPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell headerExtra={<CctvButton />} overlays={<CctvOverlay />} />}>
          {NAV_ITEMS.filter((item) => !IMPLEMENTED.has(item.id)).map((item) => (
            <Route
              key={item.id}
              path={item.path === '/' ? undefined : `${item.path}/*`}
              index={item.path === '/'}
              element={item.id === 'home' ? <HomePage /> : <Placeholder title={item.label} />}
            />
          ))}
          <Route path="/tanks" element={<TankListPage />} />
          <Route path="/tanks/:id" element={<TankPage />} />
          <Route path="/alarms" element={<AlarmsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/robot" element={<RobotPage />} />
          <Route path="/conveyor" element={<ConveyorPage />} />
          <Route path="/compressor" element={<CompressorPage />} />
          <Route path="*" element={<Placeholder title="찾을 수 없는 화면" />} />
        </Route>
      </Route>
    </Routes>
  );
}
