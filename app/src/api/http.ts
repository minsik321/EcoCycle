import type { ApiErrorBody, RefreshRequest, RefreshResponse } from '@ecocycle/shared';
import { API_BASE } from '../config/env';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens';

/** 서버 오류를 { code, message, status }로 통일한다. status 0은 네트워크 오류(서버에 닿지 못함). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** 429에서 서버가 알려 준 대기 시간(초) */
  readonly retryAfterSec: number | undefined;

  constructor(status: number, code: string, message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

/** 서버에 닿지 못했거나(0) 서버가 준비되지 않았다(503). 화면은 "연결 끊김"으로 표시한다. */
export const isUnavailable = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 0 || error.status === 503);

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  /** false이면 토큰을 붙이지 않고 401 재시도도 하지 않는다 (로그인·리프레시) */
  auth?: boolean;
  responseType?: 'json' | 'blob';
  signal?: AbortSignal;
}

// 리프레시까지 실패해 로그인이 필요해졌을 때 부르는 곳(store가 등록한다). api는 store를 import하지 않는다.
let authLostHandler: (() => void) | null = null;
export function setAuthLostHandler(handler: (() => void) | null): void {
  authLostHandler = handler;
}

const MAX_429_RETRIES = 2;
const MAX_429_WAIT_SEC = 5;

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `${url}?${text}` : url;
}

async function toApiError(res: Response): Promise<ApiError> {
  const header = res.headers.get('Retry-After');
  const parsed = header === null ? NaN : Number(header);
  const retryAfterSec = Number.isFinite(parsed) ? parsed : undefined;
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body.error?.code) {
      return new ApiError(res.status, body.error.code, body.error.message ?? '', retryAfterSec);
    }
  } catch {
    // 본문이 JSON이 아니면 아래 기본 오류로 처리한다
  }
  return new ApiError(res.status, 'HTTP_ERROR', `요청이 실패했습니다 (${res.status})`, retryAfterSec);
}

/** 요청 하나를 보낸다. 401 재시도 같은 정책은 없다. */
async function rawRequest<T>(path: string, options: RequestOptions, token: string | null): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.responseType !== 'blob') headers.Accept = 'application/json';
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : null,
      signal: options.signal ?? null,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR', '서버에 연결할 수 없습니다.');
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (options.responseType === 'blob' ? await res.blob() : await res.json()) as T;
}

// --- 리프레시: 여러 요청이 동시에 401을 받아도 리프레시는 한 번만 실행하고 나머지는 기다린다 ---

let refreshing: Promise<boolean> | null = null;

async function loseSession(): Promise<void> {
  await clearTokens();
  authLostHandler?.();
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    await loseSession();
    return false;
  }
  try {
    const body: RefreshRequest = { refreshToken };
    const res = await rawRequest<RefreshResponse>('/auth/refresh', { method: 'POST', body }, null);
    await setTokens(res.accessToken, res.refreshToken);
    return true;
  } catch (error) {
    // 서버가 토큰을 거부했을 때만 로그아웃한다. 네트워크 문제나 서버 오류로는 로그아웃하지 않는다.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
      await loseSession();
    }
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 429는 서버가 알려 준 시간만큼 기다렸다가 다시 시도한다. 다시 보내도 안전한 요청(GET, Idempotency-Key가 있는 명령)만,
 * 대기 시간이 길면(로그인 시도 제한 등) 기다리지 않고 바로 오류를 낸다.
 */
async function retryOn429<T>(safe: boolean, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429 || !safe) throw error;
      const waitSec = error.retryAfterSec ?? 1;
      if (attempt >= MAX_429_RETRIES || waitSec > MAX_429_WAIT_SEC) throw error;
      await sleep(waitSec * 1000);
    }
  }
}

/** 서버 요청의 기본 함수. 토큰 첨부, 401이면 리프레시 후 1회 재시도, 오류는 ApiError로 던진다. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const auth = options.auth ?? true;
  const safe = (options.method ?? 'GET') === 'GET' || options.headers?.['Idempotency-Key'] !== undefined;

  return retryOn429(safe, async () => {
    if (!auth) return rawRequest<T>(path, options, null);

    const usedToken = getAccessToken();
    try {
      return await rawRequest<T>(path, options, usedToken);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      // 기다리는 사이에 다른 요청이 이미 토큰을 바꿨으면 리프레시 없이 새 토큰으로 다시 보낸다
      if (getAccessToken() === usedToken && !(await refreshOnce())) throw error;
      return rawRequest<T>(path, options, getAccessToken());
    }
  });
}
