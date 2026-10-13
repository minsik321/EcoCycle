import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';

/** 앱을 켠 직후 저장된 세션을 확인하는 동안의 화면 */
export function SessionCheck() {
  return (
    <div role="status" className="flex h-full items-center justify-center text-slate-600">
      세션을 확인하는 중…
    </div>
  );
}

/**
 * 로그인해야 볼 수 있는 화면을 감싼다. 로그인되어 있지 않으면 /login으로 보내고, 로그인하면 원래 가려던 화면으로 돌려보낸다.
 * 이것은 화면 보호일 뿐이고 데이터 접근은 서버가 토큰으로 막는다.
 */
export function RequireAuth() {
  const status = useAppSelector((state) => state.auth.status);
  const location = useLocation();

  if (status === 'unknown') return <SessionCheck />;
  if (status === 'loggedOut') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
