import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE } from '../config/env';
import { ApiError, isUnavailable, request, setAuthLostHandler } from './http';
import { clearTokens, createMemoryTokenStore, getAccessToken, getRefreshToken, setRefreshTokenStore, setTokens } from './tokens';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
const errorBody = (code: string, message = '오류') => ({ error: { code, message } });
const bearer = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

let calls: Array<{ url: string; init: RequestInit }>;

function mockFetch(handler: Handler) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }),
  );
}
const countCalls = (suffix: string) => calls.filter((c) => c.url.includes(suffix)).length;

beforeEach(async () => {
  setRefreshTokenStore(createMemoryTokenStore());
  await clearTokens();
  setAuthLostHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('Bearer 토큰과 쿼리를 붙이고 JSON을 돌려준다', async () => {
    await setTokens('at-1', 'rt-1');
    mockFetch(() => json(200, [{ id: 'al-1' }]));

    const result = await request<unknown[]>('/alarms', { query: { state: 'active', from: undefined } });

    expect(result).toEqual([{ id: 'al-1' }]);
    expect(calls[0]!.url).toBe(`${API_BASE}/alarms?state=active`);
    expect(bearer(calls[0]!.init)).toBe('Bearer at-1');
  });

  it('auth: false이면 토큰을 붙이지 않는다', async () => {
    await setTokens('at-1', 'rt-1');
    mockFetch(() => json(200, {}));
    await request('/auth/login', { method: 'POST', body: { id: 'a' }, auth: false });
    expect(bearer(calls[0]!.init)).toBeUndefined();
  });

  it('오류 본문을 ApiError({ status, code, message })로 바꾼다', async () => {
    mockFetch(() => json(403, errorBody('FORBIDDEN', '권한이 없습니다.')));
    const error = await request('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', message: '권한이 없습니다.' });
  });

  it('서버에 닿지 못하면 status 0의 ApiError이고 연결 끊김으로 취급한다', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const error = await request('/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(isUnavailable(error)).toBe(true);
    expect(isUnavailable(new ApiError(503, 'X', ''))).toBe(true);
    expect(isUnavailable(new ApiError(409, 'X', ''))).toBe(false);
  });
});

describe('401 처리', () => {
  it('리프레시로 재발급하고 원래 요청을 새 토큰으로 한 번 다시 보낸다 (리프레시 토큰은 교체된다)', async () => {
    await setTokens('old', 'rt-old');
    mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'new', refreshToken: 'rt-new', expiresIn: 900 });
      return bearer(init) === 'Bearer new' ? json(200, { ok: true }) : json(401, errorBody('TOKEN_EXPIRED'));
    });

    expect(await request('/me')).toEqual({ ok: true });
    expect(getAccessToken()).toBe('new');
    expect(await getRefreshToken()).toBe('rt-new');
    expect(JSON.parse(calls.find((c) => c.url.endsWith('/auth/refresh'))!.init.body as string)).toEqual({
      refreshToken: 'rt-old',
    });
  });

  it('동시에 여러 요청이 401이어도 리프레시는 한 번만 실행한다', async () => {
    await setTokens('old', 'rt-old');
    mockFetch(async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        await new Promise((r) => setTimeout(r, 20));
        return json(200, { accessToken: 'new', refreshToken: 'rt-new', expiresIn: 900 });
      }
      return bearer(init) === 'Bearer new' ? json(200, { ok: true }) : json(401, errorBody('TOKEN_EXPIRED'));
    });

    const results = await Promise.all([request('/a'), request('/b'), request('/c')]);

    expect(results).toHaveLength(3);
    expect(countCalls('/auth/refresh')).toBe(1);
  });

  it('리프레시가 거부되면 로그아웃 처리하고 원래 401을 던진다', async () => {
    await setTokens('old', 'rt-old');
    const lost = vi.fn();
    setAuthLostHandler(lost);
    mockFetch((url) => (url.endsWith('/auth/refresh') ? json(401, errorBody('UNAUTHORIZED')) : json(401, errorBody('TOKEN_EXPIRED'))));

    const error = await request('/me').catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it('리프레시 토큰이 없으면 바로 로그아웃 처리한다', async () => {
    const lost = vi.fn();
    setAuthLostHandler(lost);
    mockFetch(() => json(401, errorBody('UNAUTHORIZED')));

    await expect(request('/me')).rejects.toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
    expect(countCalls('/auth/refresh')).toBe(0);
  });

  it('리프레시 중 네트워크 오류가 나도 로그아웃하지 않는다', async () => {
    await setTokens('old', 'rt-old');
    const lost = vi.fn();
    setAuthLostHandler(lost);
    mockFetch((url) => {
      if (url.endsWith('/auth/refresh')) throw new TypeError('Failed to fetch');
      return json(401, errorBody('TOKEN_EXPIRED'));
    });

    await expect(request('/me')).rejects.toMatchObject({ status: 401 });
    expect(lost).not.toHaveBeenCalled();
    expect(await getRefreshToken()).toBe('rt-old');
  });
});

describe('429 처리', () => {
  it('GET은 서버가 알려 준 시간(Retry-After) 뒤에 다시 시도한다', async () => {
    await setTokens('at', 'rt');
    let n = 0;
    mockFetch(() => (n++ === 0 ? json(429, errorBody('TOO_MANY_REQUESTS'), { 'Retry-After': '0' }) : json(200, { ok: true })));
    expect(await request('/devices')).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('대기 시간이 길면 기다리지 않고 retryAfterSec와 함께 오류를 낸다', async () => {
    mockFetch(() => json(429, errorBody('TOO_MANY_REQUESTS'), { 'Retry-After': '60' }));
    const error = await request('/auth/login', { method: 'POST', body: {}, auth: false }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, retryAfterSec: 60 });
    expect(calls).toHaveLength(1);
  });

  it('Idempotency-Key가 없는 POST는 자동으로 다시 보내지 않는다', async () => {
    await setTokens('at', 'rt');
    mockFetch(() => json(429, errorBody('TOO_MANY_REQUESTS'), { 'Retry-After': '0' }));
    await expect(request('/x', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(1);
  });
});
