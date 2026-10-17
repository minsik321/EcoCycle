import { setAuthLostHandler } from '../api';
import type { AppStore } from './index';
import { restoreUserSession, sessionLost } from './slices/auth';

/**
 * 앱 시작 때 한 번: 토큰 갱신이 거부되면 로그인 화면으로 돌아가게 연결하고, 저장된 세션이 있으면 되살린다.
 * (store를 import하지 않는 api가 알릴 곳을 여기서 등록한다)
 */
export function initApp(store: AppStore): void {
  setAuthLostHandler(() => store.dispatch(sessionLost()));
  void store.dispatch(restoreUserSession());
}
