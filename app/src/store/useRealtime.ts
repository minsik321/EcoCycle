import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './hooks';
import { acquireJoints, setAppVisible, startRealtime, stopRealtime } from './realtimeClient';

/**
 * 앱 최상단에서 한 번만 쓴다. 로그인되어 있는 동안 실시간 연결을 유지하고, 로그아웃하면 닫는다.
 * 앱이 화면에서 사라지면(visibilitychange) 관절 구독을 해제하고, 돌아오면 다시 구독하고 REST로 맞춘다.
 */
export function useRealtime(): void {
  const dispatch = useAppDispatch();
  const loggedIn = useAppSelector((state) => state.auth.status === 'loggedIn');

  useEffect(() => {
    if (!loggedIn) return;
    startRealtime(dispatch);
    const onVisibility = () => setAppVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopRealtime();
    };
  }, [loggedIn, dispatch]);
}

/** 로봇 관절 값이 필요한 화면(홈, 로봇 확대)에서 쓴다. 화면에 있는 동안만 구독한다. */
export function useRobotJointsSubscription(): void {
  useEffect(() => acquireJoints(), []);
}
