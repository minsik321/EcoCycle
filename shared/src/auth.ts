export const ROLES = ['admin', 'operator', 'viewer'] as const;
/** 실제 권한 종류는 대표님과 확정한다 (docs/questions.md A4). */
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = ['robot.control', 'robot.manual', 'settings.write', 'alarm.ack'] as const;
/** 프론트는 이 목록으로 버튼 표시·비활성만 정한다. 차단은 서버가 한다. */
export type Permission = (typeof PERMISSIONS)[number];

/** GET /me */
export interface Me {
  id: string;
  name: string;
  role: Role;
  permissions: Permission[];
}

/** POST /auth/login */
export interface LoginRequest {
  id: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  /** accessToken 유효 시간(초) */
  expiresIn: number;
  user: Me;
}

/** POST /auth/refresh — 리프레시 토큰은 사용할 때마다 교체된다. */
export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** POST /auth/logout */
export interface LogoutRequest {
  refreshToken: string;
}

/** POST /auth/ws-ticket — 1회용, 30초 유효. 토큰은 주소에 넣지 않고 티켓을 쓴다. */
export interface WsTicketResponse {
  ticket: string;
  /** 티켓 유효 시간(초) */
  expiresIn: number;
}

/** POST /push/register */
export interface PushRegisterRequest {
  fcmToken: string;
  platform: 'android';
}

