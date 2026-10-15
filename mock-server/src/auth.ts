import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH, REFRESH_TOKEN_DELIVERIES } from '@ecocycle/shared';
import type {
  LoginRequest,
  LoginResponse,
  Me,
  RefreshErrorCode,
  RefreshRequest,
  RefreshResponse,
  RefreshTokenDelivery,
  WsTicketResponse,
} from '@ecocycle/shared';
import { config } from './config';
import { sendError } from './errors';
import { ACCOUNTS, ROLE_PERMISSIONS } from './fixtures/accounts';
import type { Account } from './fixtures/accounts';

const now = () => Date.now();
const newToken = (prefix: string) => `${prefix}_${randomBytes(24).toString('base64url')}`;

// 메모리 저장소: 서버를 다시 켜면 모두 로그아웃된다 (모의 서버라 의도된 동작, server-restart 시나리오가 흉내 낸다).
// 세션 = 로그인 한 번에서 이어진 토큰 묶음. 리프레시 토큰을 교체해도 같은 세션이고, 재사용이 감지되면 세션째 폐기한다.
interface Session {
  userId: string;
  remember: boolean;
  delivery: RefreshTokenDelivery;
}
const sessions = new Map<string, Session>();
const accessTokens = new Map<string, { userId: string; sessionId: string; expiresAt: number }>();
/** 리프레시 한 번이 준 토큰 쌍. 유예 시간 안에 이전 토큰이 다시 오면 이것을 그대로 다시 준다. */
interface IssuedPair {
  accessToken: string;
  refreshToken: string;
}
/**
 * usedAt이 있으면 이미 교체된 토큰이다. 다시 오면 재사용(탈취)으로 본다. 단, 교체 직후 유예 시간(config.refreshReuseGraceSec) 안이고
 * 그 교체로 준 새 토큰(rotatedTo)이 아직 쓰이지 않았으면 응답을 잃은 정상 요청으로 보고 같은 새 토큰 쌍을 다시 준다.
 * 만료되거나 세션이 폐기될 때까지 남겨 둔다.
 */
const refreshTokens = new Map<string, { sessionId: string; expiresAt: number; usedAt?: number; rotatedTo?: IssuedPair }>();
const wsTickets = new Map<string, { userId: string; sessionId: string; expiresAt: number }>();

// 세션이 폐기되면 그 세션의 WebSocket을 닫는다. stream.ts가 등록한다(stream이 auth를 import하므로 반대로는 부르지 않는다).
// null은 모든 세션(서버 재시작 흉내).
const revokeListeners: Array<(sessionId: string | null) => void> = [];
export function onSessionRevoked(listener: (sessionId: string | null) => void): void {
  revokeListeners.push(listener);
}

function revokeSession(sessionId: string): void {
  sessions.delete(sessionId);
  for (const [token, entry] of refreshTokens) if (entry.sessionId === sessionId) refreshTokens.delete(token);
  for (const [token, entry] of accessTokens) if (entry.sessionId === sessionId) accessTokens.delete(token);
  for (const [ticket, entry] of wsTickets) if (entry.sessionId === sessionId) wsTickets.delete(ticket);
  for (const listener of revokeListeners) listener(sessionId);
}

/** 서버 재시작 흉내: 모든 세션·토큰·티켓을 잃는다 (server-restart 시나리오) */
export function forgetAllSessions(): void {
  sessions.clear();
  accessTokens.clear();
  refreshTokens.clear();
  wsTickets.clear();
  for (const listener of revokeListeners) listener(null);
}

/** 만료된 토큰과 살아 있는 리프레시 토큰이 없는 세션을 정리한다 */
function pruneExpired(): void {
  const t = now();
  for (const [token, entry] of refreshTokens) if (entry.expiresAt <= t) refreshTokens.delete(token);
  for (const [token, entry] of accessTokens) if (entry.expiresAt <= t) accessTokens.delete(token);
  const alive = new Set([...refreshTokens.values()].filter((e) => e.usedAt === undefined).map((e) => e.sessionId));
  for (const sessionId of sessions.keys()) if (!alive.has(sessionId)) sessions.delete(sessionId);
}
setInterval(pruneExpired, 60_000).unref();

// 로그인 시도 제한: 아이디당 60초 안에 실패 5회가 넘으면 429
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_FAILURES = 5;
const loginFailures = new Map<string, number[]>();

function recentFailures(id: string): number[] {
  const list = (loginFailures.get(id) ?? []).filter((t) => now() - t < LOGIN_WINDOW_MS);
  loginFailures.set(id, list);
  return list;
}

export function toMe(account: Account): Me {
  return {
    id: account.id,
    name: account.name,
    role: account.role,
    permissions: [...ROLE_PERMISSIONS[account.role]],
  };
}

const findAccount = (id: string) => ACCOUNTS.find((a) => a.id === id);

const refreshTtlSec = (session: Session) =>
  session.remember ? config.refreshTokenTtlSec : config.sessionRefreshTokenTtlSec;

/** 리프레시 토큰 쿠키 속성: HttpOnly, Secure, SameSite(lax, 또는 다른 사이트면 none + Partitioned), Path는 인증 경로만 */
function cookieOptions(): CookieOptions {
  const sameSite = config.refreshCookieSameSite;
  return {
    httpOnly: true,
    secure: true,
    sameSite,
    path: REFRESH_COOKIE_PATH,
    ...(sameSite === 'none' ? { partitioned: true } : {}),
  };
}

function setRefreshCookie(res: Response, token: string, session: Session): void {
  // 자동 로그인이면 지속 쿠키, 아니면 Max-Age 없는 세션 쿠키(브라우저를 닫으면 사라진다)
  const options = cookieOptions();
  if (session.remember) options.maxAge = refreshTtlSec(session) * 1000;
  res.cookie(REFRESH_COOKIE_NAME, token, options);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}

/** 새 액세스·리프레시 토큰을 만든다 */
function createTokens(sessionId: string, session: Session): IssuedPair {
  const accessToken = newToken('at');
  const refreshToken = newToken('rt');
  accessTokens.set(accessToken, {
    userId: session.userId,
    sessionId,
    expiresAt: now() + config.accessTokenTtlSec * 1000,
  });
  refreshTokens.set(refreshToken, { sessionId, expiresAt: now() + refreshTtlSec(session) * 1000 });
  return { accessToken, refreshToken };
}

/** 토큰 쌍을 방식에 맞게 돌려준다 (cookie 방식이면 본문에 리프레시 토큰을 넣지 않는다). expiresIn은 액세스 토큰의 남은 시간 */
function sendTokens(res: Response, pair: IssuedPair, session: Session): RefreshResponse {
  const access = accessTokens.get(pair.accessToken);
  const expiresIn = access ? Math.max(1, Math.round((access.expiresAt - now()) / 1000)) : config.accessTokenTtlSec;
  if (session.delivery === 'cookie') {
    setRefreshCookie(res, pair.refreshToken, session);
    return { accessToken: pair.accessToken, expiresIn };
  }
  return { accessToken: pair.accessToken, refreshToken: pair.refreshToken, expiresIn };
}

function issueTokens(res: Response, sessionId: string, session: Session): RefreshResponse {
  return sendTokens(res, createTokens(sessionId, session), session);
}

/** 리프레시·로그아웃 요청의 토큰: 본문(앱)에 있으면 본문, 없으면 쿠키(웹) */
function presentedToken(req: Request): { token: string; delivery: RefreshTokenDelivery } | null {
  const { refreshToken } = (req.body ?? {}) as Partial<RefreshRequest>;
  if (typeof refreshToken === 'string' && refreshToken) return { token: refreshToken, delivery: 'body' };
  const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
  if (typeof cookie === 'string' && cookie) return { token: cookie, delivery: 'cookie' };
  return null;
}

/** 쿠키를 쓰는 요청은 허용한 출처에서 온 것만 받는다 (다른 사이트가 쿠키를 태워 보내는 것을 막는다). Origin이 없으면 브라우저 밖의 요청 */
function allowedOrigin(req: Request): boolean {
  const origin = req.header('Origin');
  return origin === undefined || config.corsOrigins.includes(origin);
}

type RefreshResult =
  /** rotated: 새 토큰 쌍을 만들었다. replayed: 유예 시간 안의 이전 토큰이라 방금 만든 쌍을 그대로 다시 준다 */
  | { ok: true; kind: 'rotated' | 'replayed'; sessionId: string; session: Session; pair: IssuedPair }
  | { ok: false; code: RefreshErrorCode; message: string };

/**
 * 유예 시간 안에 다시 온 바로 앞 토큰이면 그 교체로 준 새 쌍을 돌려준다. 새 리프레시 토큰이 이미 쓰였거나(그다음 교체가 일어남)
 * 사라졌으면 유예하지 않는다: 그때는 응답을 잃은 경우가 아니다.
 */
function graceReplay(entry: { usedAt?: number; rotatedTo?: IssuedPair }): IssuedPair | null {
  const pair = entry.rotatedTo;
  if (entry.usedAt === undefined || !pair) return null;
  if (now() - entry.usedAt > config.refreshReuseGraceSec * 1000) return null;
  const next = refreshTokens.get(pair.refreshToken);
  if (!next || next.usedAt !== undefined || next.expiresAt <= now()) return null;
  const access = accessTokens.get(pair.accessToken);
  if (!access || access.expiresAt <= now()) return null;
  return pair;
}

/**
 * 리프레시 토큰 하나를 소비한다. 이미 교체된 토큰이 다시 오면 그 세션 전체를 폐기한다(재사용 감지).
 * 단, 교체 직후 유예 시간 안에 바로 앞 토큰이 다시 오면 같은 새 토큰 쌍을 다시 준다(응답을 잃은 정상 요청).
 * refresh-reuse 시나리오도 이것으로 "훔친 토큰"을 다시 써 본다.
 */
export function consumeRefreshToken(token: string): RefreshResult {
  const entry = refreshTokens.get(token);
  const session = entry ? sessions.get(entry.sessionId) : undefined;
  if (!entry || !session) return { ok: false, code: 'UNAUTHORIZED', message: '다시 로그인해야 합니다.' };
  if (entry.usedAt !== undefined) {
    const pair = graceReplay(entry);
    if (pair) {
      console.log(`[auth] 교체 ${((now() - entry.usedAt) / 1000).toFixed(1)}초 뒤 이전 리프레시 토큰이 다시 옴 → 유예 시간 안이라 같은 새 토큰을 다시 줌 (${session.userId})`);
      return { ok: true, kind: 'replayed', sessionId: entry.sessionId, session, pair };
    }
    revokeSession(entry.sessionId);
    console.warn(`[auth] 이미 쓴 리프레시 토큰이 다시 왔다 → 세션 폐기 (${session.userId})`);
    return { ok: false, code: 'REFRESH_TOKEN_REUSED', message: '보안을 위해 로그인이 해제되었습니다. 다시 로그인하세요.' };
  }
  if (entry.expiresAt <= now()) {
    revokeSession(entry.sessionId);
    return { ok: false, code: 'REFRESH_TOKEN_EXPIRED', message: '로그인 시간이 지났습니다. 다시 로그인하세요.' };
  }
  entry.usedAt = now();
  entry.rotatedTo = createTokens(entry.sessionId, session);
  return { ok: true, kind: 'rotated', sessionId: entry.sessionId, session, pair: entry.rotatedTo };
}

// 교체될 때마다 이전 토큰을 알린다 (refresh-reuse 시나리오가 이전 토큰을 기억해 두었다가 다시 쓴다)
const rotateListeners: Array<(oldToken: string) => void> = [];
export function onRefreshRotated(listener: (oldToken: string) => void): void {
  rotateListeners.push(listener);
}

/** 요청마다 토큰을 검증하고 `res.locals.account`에 계정을 넣는다. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const session = accessTokens.get(token);
  if (!session) {
    return sendError(res, 401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  }
  if (session.expiresAt <= now()) {
    accessTokens.delete(token);
    return sendError(res, 401, 'TOKEN_EXPIRED', '토큰이 만료되었습니다.');
  }
  const account = findAccount(session.userId);
  if (!account) return sendError(res, 401, 'UNAUTHORIZED', '로그인이 필요합니다.');
  res.locals.account = account;
  res.locals.sessionId = session.sessionId;
  next();
}

/** 1회용 WebSocket 티켓을 소비하고 계정과 세션을 돌려준다. 없거나 만료되면 undefined */
export function consumeWsTicket(ticket: string): { account: Account; sessionId: string } | undefined {
  const entry = wsTickets.get(ticket);
  wsTickets.delete(ticket);
  if (!entry || entry.expiresAt <= now() || !sessions.has(entry.sessionId)) return undefined;
  const account = findAccount(entry.userId);
  return account ? { account, sessionId: entry.sessionId } : undefined;
}

export const authRouter = Router();

authRouter.post('/auth/login', (req, res) => {
  const { id, password, remember = false, refreshTokenDelivery = 'body' } = (req.body ?? {}) as Partial<LoginRequest>;
  if (typeof id !== 'string' || typeof password !== 'string' || !id || !password) {
    return sendError(res, 422, 'VALIDATION_FAILED', 'id와 password가 필요합니다.');
  }
  if (typeof remember !== 'boolean' || !(REFRESH_TOKEN_DELIVERIES as readonly unknown[]).includes(refreshTokenDelivery)) {
    return sendError(res, 422, 'VALIDATION_FAILED', 'remember는 true/false, refreshTokenDelivery는 cookie 또는 body여야 합니다.');
  }
  if (refreshTokenDelivery === 'cookie' && !allowedOrigin(req)) {
    return sendError(res, 403, 'ORIGIN_NOT_ALLOWED', '허용되지 않은 출처입니다.');
  }
  if (recentFailures(id).length >= LOGIN_MAX_FAILURES) {
    res.setHeader('Retry-After', String(LOGIN_WINDOW_MS / 1000));
    return sendError(res, 429, 'TOO_MANY_REQUESTS', '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.');
  }
  const account = findAccount(id);
  if (!account || account.password !== password) {
    recentFailures(id).push(now());
    return sendError(res, 401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  loginFailures.delete(id);
  const sessionId = newToken('ss');
  const session: Session = { userId: account.id, remember, delivery: refreshTokenDelivery };
  sessions.set(sessionId, session);
  const body: LoginResponse = { ...issueTokens(res, sessionId, session), user: toMe(account) };
  res.json(body);
});

// 리프레시 토큰은 사용할 때마다 교체된다. 이미 쓴 토큰이 다시 오면 세션 전체를 폐기하고 401.
// 단, 교체 직후 유예 시간 안에 바로 앞 토큰이 다시 오면 같은 새 토큰 쌍을 다시 준다(응답을 잃은 경우).
authRouter.post('/auth/refresh', (req, res) => {
  const presented = presentedToken(req);
  if (!presented) return sendError(res, 401, 'REFRESH_TOKEN_MISSING', '다시 로그인해야 합니다.');
  if (presented.delivery === 'cookie' && !allowedOrigin(req)) {
    return sendError(res, 403, 'ORIGIN_NOT_ALLOWED', '허용되지 않은 출처입니다.');
  }
  const result = consumeRefreshToken(presented.token);
  if (!result.ok) {
    if (presented.delivery === 'cookie') clearRefreshCookie(res);
    return sendError(res, 401, result.code, result.message);
  }
  if (!findAccount(result.session.userId)) {
    revokeSession(result.sessionId);
    return sendError(res, 401, 'UNAUTHORIZED', '다시 로그인해야 합니다.');
  }
  // 받은 방식 그대로 돌려준다 (웹 쿠키는 쿠키로, 앱 본문은 본문으로)
  result.session.delivery = presented.delivery;
  const body: RefreshResponse = sendTokens(res, result.pair, result.session);
  if (result.kind === 'rotated') for (const listener of rotateListeners) listener(presented.token);
  res.json(body);
});

// 로그아웃: 그 세션의 토큰을 모두 폐기하고 쿠키를 지운다. 모르는 토큰이어도 204.
authRouter.post('/auth/logout', (req, res) => {
  const presented = presentedToken(req);
  if (presented?.delivery === 'cookie' && !allowedOrigin(req)) {
    return sendError(res, 403, 'ORIGIN_NOT_ALLOWED', '허용되지 않은 출처입니다.');
  }
  const entry = presented ? refreshTokens.get(presented.token) : undefined;
  if (entry) revokeSession(entry.sessionId);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/auth/ws-ticket', requireAuth, (_req, res) => {
  const account = res.locals.account as Account;
  const ticket = newToken('wt');
  wsTickets.set(ticket, {
    userId: account.id,
    sessionId: res.locals.sessionId as string,
    expiresAt: now() + config.wsTicketTtlSec * 1000,
  });
  const body: WsTicketResponse = { ticket, expiresIn: config.wsTicketTtlSec };
  res.json(body);
});

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json(toMe(res.locals.account as Account));
});
