import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type {
  LoginRequest,
  LoginResponse,
  Me,
  RefreshRequest,
  RefreshResponse,
  WsTicketResponse,
} from '@ecocycle/shared';
import { config } from './config';
import { sendError } from './errors';
import { ACCOUNTS, ROLE_PERMISSIONS } from './fixtures/accounts';
import type { Account } from './fixtures/accounts';

const now = () => Date.now();
const newToken = (prefix: string) => `${prefix}_${randomBytes(24).toString('base64url')}`;

// 메모리 저장소: 서버를 다시 켜면 모두 로그아웃된다 (모의 서버라 의도된 동작).
const accessTokens = new Map<string, { userId: string; expiresAt: number }>();
const refreshTokens = new Map<string, { userId: string; expiresAt: number }>();
const wsTickets = new Map<string, { userId: string; expiresAt: number }>();

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

function issueTokens(account: Account): RefreshResponse {
  const accessToken = newToken('at');
  const refreshToken = newToken('rt');
  accessTokens.set(accessToken, {
    userId: account.id,
    expiresAt: now() + config.accessTokenTtlSec * 1000,
  });
  refreshTokens.set(refreshToken, {
    userId: account.id,
    expiresAt: now() + config.refreshTokenTtlSec * 1000,
  });
  return { accessToken, refreshToken, expiresIn: config.accessTokenTtlSec };
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
  next();
}

/** 1회용 WebSocket 티켓을 소비하고 계정을 돌려준다. 없거나 만료되면 undefined */
export function consumeWsTicket(ticket: string): Account | undefined {
  const entry = wsTickets.get(ticket);
  wsTickets.delete(ticket);
  if (!entry || entry.expiresAt <= now()) return undefined;
  return findAccount(entry.userId);
}

export const authRouter = Router();

authRouter.post('/auth/login', (req, res) => {
  const { id, password } = (req.body ?? {}) as Partial<LoginRequest>;
  if (typeof id !== 'string' || typeof password !== 'string' || !id || !password) {
    return sendError(res, 422, 'VALIDATION_FAILED', 'id와 password가 필요합니다.');
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
  const body: LoginResponse = { ...issueTokens(account), user: toMe(account) };
  res.json(body);
});

// 리프레시 토큰은 사용할 때마다 교체된다. 이미 쓴 토큰을 다시 쓰면 401.
authRouter.post('/auth/refresh', (req, res) => {
  const { refreshToken } = (req.body ?? {}) as Partial<RefreshRequest>;
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return sendError(res, 422, 'VALIDATION_FAILED', 'refreshToken이 필요합니다.');
  }
  const entry = refreshTokens.get(refreshToken);
  refreshTokens.delete(refreshToken);
  const account = entry && entry.expiresAt > now() ? findAccount(entry.userId) : undefined;
  if (!account) return sendError(res, 401, 'UNAUTHORIZED', '다시 로그인해야 합니다.');
  const body: RefreshResponse = issueTokens(account);
  res.json(body);
});

authRouter.post('/auth/logout', (req, res) => {
  const { refreshToken } = (req.body ?? {}) as Partial<RefreshRequest>;
  if (typeof refreshToken === 'string') refreshTokens.delete(refreshToken);
  res.status(204).end();
});

authRouter.post('/auth/ws-ticket', requireAuth, (_req, res) => {
  const account = res.locals.account as Account;
  const ticket = newToken('wt');
  wsTickets.set(ticket, { userId: account.id, expiresAt: now() + config.wsTicketTtlSec * 1000 });
  const body: WsTicketResponse = { ticket, expiresIn: config.wsTicketTtlSec };
  res.json(body);
});

authRouter.get('/me', requireAuth, (_req, res) => {
  res.json(toMe(res.locals.account as Account));
});
