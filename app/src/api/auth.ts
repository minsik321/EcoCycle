import type { LoginRequest, LoginResponse, LogoutRequest, Me, WsTicketResponse } from '@ecocycle/shared';
import { isUnavailable, refreshSession, request } from './http';
import { clearTokens, getRefreshToken, refreshTokenDelivery, setTokens } from './tokens';

/**
 * 로그인. remember(자동 로그인)면 웹은 지속 쿠키(14일), 안드로이드는 보안 저장소에 리프레시 토큰을 둔다.
 * 끄면 웹은 세션 쿠키(브라우저를 닫으면 사라짐), 안드로이드는 메모리에만 둔다.
 */
export async function login(id: string, password: string, remember = false): Promise<LoginResponse> {
  const cookie = refreshTokenDelivery() === 'cookie';
  const body: LoginRequest = { id, password, remember, refreshTokenDelivery: refreshTokenDelivery() };
  const res = await request<LoginResponse>('/auth/login', { method: 'POST', body, auth: false, withCredentials: cookie });
  await setTokens(res.accessToken, res.refreshToken, remember);
  return res;
}

/**
 * 서버에서 세션을 폐기하고(웹은 쿠키도 서버가 지운다) 기기의 토큰도 지운다.
 * 서버 요청이 실패해도 기기의 토큰은 지운다.
 */
export async function logout(): Promise<void> {
  try {
    if (refreshTokenDelivery() === 'cookie') {
      const body: LogoutRequest = {};
      await request<void>('/auth/logout', { method: 'POST', body, auth: false, withCredentials: true });
    } else {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        const body: LogoutRequest = { refreshToken };
        await request<void>('/auth/logout', { method: 'POST', body, auth: false });
      }
    }
  } finally {
    await clearTokens();
  }
}

export const getMe = (): Promise<Me> => request<Me>('/me');

/** WebSocket 연결용 1회용 티켓 (30초 유효). 토큰을 주소에 넣지 않고 이것을 쓴다. */
export const getWsTicket = (): Promise<WsTicketResponse> =>
  request<WsTicketResponse>('/auth/ws-ticket', { method: 'POST' });

/**
 * 앱 시작 때 세션 되살리기 결과.
 * restored: 로그인 화면 없이 들어간다(권한은 방금 받은 /me 기준). none: 되살릴 세션이 없거나 서버가 거부 → 로그인 화면.
 * unavailable: 서버에 닿지 못함·서버 오류 → 토큰은 지우지 않고 다시 시도하게 한다.
 */
export type RestoreResult = { kind: 'restored'; me: Me } | { kind: 'none' } | { kind: 'unavailable' };

/**
 * 앱을 켰을 때 리프레시로 세션을 되살린다. 웹은 쿠키가 있는지 스크립트가 알 수 없으므로 항상 시도하고,
 * 안드로이드는 보안 저장소에 토큰이 있을 때만 시도한다. 성공하면 액세스 토큰을 메모리에 두고 GET /me로 최신 권한을 받는다.
 */
export async function restoreSession(): Promise<RestoreResult> {
  if (refreshTokenDelivery() === 'body' && !(await getRefreshToken())) return { kind: 'none' };
  const outcome = await refreshSession();
  if (outcome === 'rejected') return { kind: 'none' };
  if (outcome === 'unavailable') return { kind: 'unavailable' };
  try {
    return { kind: 'restored', me: await getMe() };
  } catch (error) {
    // /me가 거부되면(세션이 그새 폐기됨) http.ts가 토큰을 정리한다
    return isUnavailable(error) ? { kind: 'unavailable' } : { kind: 'none' };
  }
}
