import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { NAV_ITEMS } from './config/navigation';

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
      <Route element={<AppShell />}>
        {NAV_ITEMS.map((item) => (
          <Route key={item.id} path={item.path === '/' ? undefined : `${item.path}/*`} index={item.path === '/'} element={<Placeholder title={item.label} />} />
        ))}
        <Route path="*" element={<Placeholder title="찾을 수 없는 화면" />} />
      </Route>
    </Routes>
  );
}
