import type { LoginRequest, LoginResponse, LogoutRequest, Me, WsTicketResponse } from '@ecocycle/shared';
import { request } from './http';
import { clearTokens, getRefreshToken, setTokens } from './tokens';

export async function login(id: string, password: string): Promise<LoginResponse> {
  const body: LoginRequest = { id, password };
  const res = await request<LoginResponse>('/auth/login', { method: 'POST', body, auth: false });
  await setTokens(res.accessToken, res.refreshToken);
  return res;
}

/** 서버에서 토큰을 폐기하고 기기의 토큰도 지운다. 서버 요청이 실패해도 기기의 토큰은 지운다. */
export async function logout(): Promise<void> {
  const refreshToken = await getRefreshToken();
  try {
    if (refreshToken) {
      const body: LogoutRequest = { refreshToken };
      await request<void>('/auth/logout', { method: 'POST', body, auth: false });
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
 * 앱을 켰을 때 저장된 리프레시 토큰으로 세션을 되살린다. 세션이 없으면 null.
 * (메모리 저장소에서는 항상 null이다. 보안 저장소를 쓰는 안드로이드 앱에서 의미가 있다.)
 */
export async function restoreSession(): Promise<Me | null> {
  if (!(await getRefreshToken())) return null;
  try {
    // 액세스 토큰이 없어 첫 요청이 401이 되고, 리프레시 후 재시도된다
    return await getMe();
  } catch {
    return null;
  }
}
