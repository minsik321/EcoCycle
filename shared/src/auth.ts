export const ROLES = ['admin', 'operator', 'viewer'] as const;
/** 실제 권한 종류는 대표님과 확정한다 (docs/questions.md A4). */
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = ['batch.control', 'robot.control', 'robot.manual', 'settings.write', 'alarm.ack'] as const;
/** 프론트는 이 목록으로 버튼 표시·비활성만 정한다. 차단은 서버가 한다. */
export type Permission = (typeof PERMISSIONS)[number];

/** GET /me */
export interface Me {
  id: string;
  name: string;
  role: Role;
  permissions: Permission[];
}

/**
 * 리프레시 토큰을 주고받는 방식 (명세 6절 "토큰 보관과 자동 로그인").
 * - cookie: 웹. 서버가 HttpOnly 쿠키로 심고 본문에는 넣지 않는다. 스크립트는 토큰을 볼 수 없다.
 * - body: 안드로이드 앱. 본문으로 주고받고 앱이 보안 저장소(Android Keystore)에 둔다.
 */
export const REFRESH_TOKEN_DELIVERIES = ['cookie', 'body'] as const;
export type RefreshTokenDelivery = (typeof REFRESH_TOKEN_DELIVERIES)[number];

/** 웹 리프레시 토큰 쿠키 이름과 경로 (인증 경로에만 전송된다) */
export const REFRESH_COOKIE_NAME = 'ecocycle_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** POST /auth/login */
export interface LoginRequest {
  id: string;
  password: string;
  /** 자동 로그인. true면 지속 쿠키(14일)·보안 저장소, false면 세션 쿠키·메모리. 빼면 false */
  remember?: boolean;
  /** 빼면 'body' */
  refreshTokenDelivery?: RefreshTokenDelivery;
}

export interface LoginResponse {
  accessToken: string;
  /** 'body' 방식에서만 온다. 'cookie' 방식에서는 Set-Cookie로만 온다. */
  refreshToken?: string;
  /** accessToken 유효 시간(초) */
  expiresIn: number;
  user: Me;
}

/**
 * POST /auth/refresh — 리프레시 토큰은 사용할 때마다 교체된다.
 * 'body' 방식은 refreshToken을 보내고, 'cookie' 방식은 빈 본문에 쿠키가 따라간다.
 * 이미 쓴 토큰이 다시 오면 그 세션 전체를 폐기한다(재사용 감지).
 */
export interface RefreshRequest {
  refreshToken?: string;
}

export interface RefreshResponse {
  accessToken: string;
  /** 'body' 방식에서만 온다 */
  refreshToken?: string;
  expiresIn: number;
}

/** POST /auth/logout — 그 세션의 토큰을 모두 폐기하고 쿠키를 지운다. 'cookie' 방식은 빈 본문 */
export interface LogoutRequest {
  refreshToken?: string;
}

/** 리프레시가 401로 거부될 때의 code (⚠ 서버와 합의 전, docs/questions.md B28) */
export const REFRESH_ERROR_CODES = [
  'REFRESH_TOKEN_MISSING',
  'REFRESH_TOKEN_EXPIRED',
  'REFRESH_TOKEN_REUSED',
  'UNAUTHORIZED',
] as const;
export type RefreshErrorCode = (typeof REFRESH_ERROR_CODES)[number];

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

