import { useEffect, useState } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { restoreSkipped, restoreUserSession } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';

/**
 * 앱을 켠 직후 저장된 세션(웹 쿠키·안드로이드 보안 저장소)을 확인하는 동안의 짧은 화면.
 * 확인이 끝나기 전에는 로그인 화면을 잠깐이라도 보여 주지 않는다.
 * 서버에 닿지 못하면 토큰을 지우지 않고 다시 시도하거나 로그인 화면으로 갈 수 있게 한다.
 */
export function SessionCheck() {
  const dispatch = useAppDispatch();
  const unavailable = useAppSelector((state) => state.auth.restoreUnavailable);

  if (unavailable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center text-slate-700">
        <p role="alert">서버에 연결할 수 없어 로그인을 확인하지 못했습니다.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => void dispatch(restoreUserSession())}>
            다시 시도
          </Button>
          <Button onClick={() => dispatch(restoreSkipped())}>로그인 화면으로</Button>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex h-full items-center justify-center text-slate-600">
      로그인 확인 중…
    </div>
  );
}

/**
 * 로그인해야 볼 수 있는 화면을 감싼다. 새로 로그인하거나 앱 시작 시 세션을 복원하면 홈에서 시작한다.
 * 이것은 화면 보호일 뿐이고 데이터 접근은 서버가 토큰으로 막는다.
 */
export function RequireAuth() {
  const status = useAppSelector((state) => state.auth.status);
  const navigate = useNavigate();
  const [restoring, setRestoring] = useState(status === 'unknown');

  useEffect(() => {
    if (restoring && status === 'loggedIn') {
      navigate('/', { replace: true });
      setRestoring(false);
    }
  }, [navigate, restoring, status]);

  if (status === 'unknown') return <SessionCheck />;
  if (status === 'loggedOut') return <Navigate to="/login" replace />;
  if (restoring) return <SessionCheck />;
  return <Outlet />;
}
