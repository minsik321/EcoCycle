import { useEffect } from 'react';
import { prefetchStudioWhenIdle } from '../../studio/preload';
import { useAppSelector } from '../../store/hooks';
import { supportsWebGL } from './sceneSupport';

/**
 * 앱 틀에서 한 번 쓴다: 홈을 3D로 기억해 둔 기기면 로그인 화면을 보는 동안(그리고 로그인 뒤 한가할 때) 3D 홈 파일을 미리 받는다.
 * 정적 파일만 받고 API·WebSocket은 부르지 않는다(studio/preload.ts). 세션을 되살리는 중에는 기다린다
 * (곧 홈이 같은 파일을 직접 받기 시작한다). 3D 홈이 열려 있으면 홈이 받으므로 물러선다(claimStudioFiles).
 */
export function useStudioPrefetch(): void {
  const mode = useAppSelector((state) => state.ui.homeMode);
  const auth = useAppSelector((state) => state.auth.status);
  useEffect(() => {
    if (mode !== '3d' || auth === 'unknown' || !supportsWebGL()) return;
    return prefetchStudioWhenIdle();
  }, [mode, auth]);
}
