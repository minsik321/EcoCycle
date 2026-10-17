// 자동 로그인과 토큰 보관 (명세 6절 "토큰 보관과 자동 로그인").
// 웹(쿠키)과 안드로이드(보안 저장소) 두 구현이 같은 api 함수로 동작하는지, 어떤 토큰도 브라우저 저장소·주소에 남지 않는지 본다.
// 서버 쪽 동작(지속/세션 쿠키, 교체, 재사용 감지)은 실제 모의 서버로 src/integration/auth.integration.test.ts가 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMe, login, logout, restoreSession } from './auth';
import { request, setAuthLostHandler } from './http';
import {
  SECURE_REFRESH_KEY,
  clearTokens,
  createCookieTokenStore,
  createNativeTokenStore,
  getAccessToken,
  getRefreshToken,
  setRefreshTokenStore,
} from './tokens';
import type { SecureStorage } from './tokens';

type Call = { url: string; init: RequestInit };
type Handler = (path: string, init: RequestInit) => Response;

const ME = { id: 'operator', name: '작업자', role: 'operator', permissions: ['robot.control', 'alarm.ack'] };

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const rejected = (code: string) => json(401, { error: { code, message: '' } });

let calls: Call[];
function mockFetch(handler: Handler) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(new URL(url).pathname.replace(/^.*\/api\/v1/, ''), init);
    }),
  );
}
const bodyOf = (call: Call) => JSON.parse(String(call.init.body ?? 'null')) as Record<string, unknown> | null;
const callsTo = (path: string) => calls.filter((c) => c.url.endsWith(path));

/** 보안 저장소 흉내 (앱을 다시 켜도 남는 저장소) */
function fakeSecureStorage(): SecureStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

// 토큰이 브라우저 저장소에 들어가려 하면 잡는다
let storageWrites: string[];
beforeEach(async () => {
  storageWrites = [];
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    storageWrites.push(`${key}=${value}`);
    original.call(this, key, value);
  });
  localStorage.clear();
  sessionStorage.clear();
  setAuthLostHandler(null);
  setRefreshTokenStore(createCookieTokenStore());
  await clearTokens();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** 어떤 토큰 문자열도 localStorage·sessionStorage·요청 주소에 나타나지 않았다 */
function expectNoTokenLeak(tokens: string[]) {
  const stored = [
    ...Object.keys(localStorage).map((k) => `${k}=${localStorage.getItem(k)}`),
    ...Object.keys(sessionStorage).map((k) => `${k}=${sessionStorage.getItem(k)}`),
    ...storageWrites,
  ].join('\n');
  const urls = calls.map((c) => c.url).join('\n');
  for (const token of tokens) {
    expect(stored, `저장소에 ${token}`).not.toContain(token);
    expect(urls, `주소에 ${token}`).not.toContain(token);
  }
  expect(window.location.href).not.toMatch(/at_|rt_|token/i);
}

describe('웹: 리프레시 토큰은 서버 쿠키 (스크립트가 다루지 않는다)', () => {
  it('로그인: remember와 cookie 방식을 보내고, 쿠키를 받도록 credentials: include', async () => {
    mockFetch(() => json(200, { accessToken: 'at_1', expiresIn: 900, user: ME }));
    await login('operator', 'pw', true);
    expect(bodyOf(calls[0]!)).toEqual({ id: 'operator', password: 'pw', remember: true, refreshTokenDelivery: 'cookie' });
    expect(calls[0]!.init.credentials).toBe('include');
    expect(getAccessToken()).toBe('at_1');
    expect(await getRefreshToken()).toBeNull();
  });

  it('자동 로그인을 끄면 remember: false로 보낸다 (서버가 세션 쿠키를 준다)', async () => {
    mockFetch(() => json(200, { accessToken: 'at_1', expiresIn: 900, user: ME }));
    await login('operator', 'pw');
    expect(bodyOf(calls[0]!)).toMatchObject({ remember: false, refreshTokenDelivery: 'cookie' });
  });

  it('앱 시작: 쿠키로 리프레시가 되면 액세스 토큰을 메모리에 두고 /me로 최신 권한을 받는다', async () => {
    const changed = { ...ME, permissions: [] };
    mockFetch((path) => (path === '/auth/refresh' ? json(200, { accessToken: 'at_2', expiresIn: 900 }) : json(200, changed)));
    const result = await restoreSession();
    expect(result).toEqual({ kind: 'restored', me: changed });
    expect(bodyOf(callsTo('/auth/refresh')[0]!)).toEqual({});
    expect(callsTo('/auth/refresh')[0]!.init.credentials).toBe('include');
    expect((callsTo('/me')[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer at_2');
    expect(getAccessToken()).toBe('at_2');
  });

  it('앱 시작: 쿠키가 없거나 거부되면 로그인 화면 (세션 만료 알림은 보내지 않는다)', async () => {
    const lost = vi.fn();
    setAuthLostHandler(lost);
    mockFetch(() => rejected('REFRESH_TOKEN_MISSING'));
    expect(await restoreSession()).toEqual({ kind: 'none' });
    expect(callsTo('/me')).toHaveLength(0);
    expect(lost).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
  });

  it('앱 시작: 서버에 닿지 못하거나 5xx면 unavailable (로그아웃하지 않는다)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await restoreSession()).toEqual({ kind: 'unavailable' });
    mockFetch(() => json(500, { error: { code: 'X', message: '' } }));
    expect(await restoreSession()).toEqual({ kind: 'unavailable' });
  });

  it('액세스 토큰이 만료되면 쿠키로 조용히 리프레시하고 원래 요청을 다시 보낸다', async () => {
    mockFetch(() => json(200, { accessToken: 'at_1', expiresIn: 900, user: ME }));
    await login('operator', 'pw', true);
    mockFetch((path, init) => {
      if (path === '/auth/refresh') return json(200, { accessToken: 'at_2', expiresIn: 900 });
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer at_2' ? json(200, ME) : rejected('TOKEN_EXPIRED');
    });
    await expect(getMe()).resolves.toEqual(ME);
    expect(callsTo('/auth/refresh')).toHaveLength(1);
    expect(callsTo('/auth/refresh')[0]!.init.credentials).toBe('include');
  });

  it('리프레시가 거부(재사용 감지 등)되면 로그인이 풀렸다고 알린다', async () => {
    const lost = vi.fn();
    setAuthLostHandler(lost);
    mockFetch(() => json(200, { accessToken: 'at_1', expiresIn: 900, user: ME }));
    await login('operator', 'pw', true);
    mockFetch((path) => (path === '/auth/refresh' ? rejected('REFRESH_TOKEN_REUSED') : rejected('UNAUTHORIZED')));
    await expect(request('/devices')).rejects.toMatchObject({ status: 401 });
    expect(lost).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('로그아웃: 쿠키와 함께 서버에 폐기를 요청하고 메모리의 액세스 토큰을 지운다', async () => {
    mockFetch(() => json(200, { accessToken: 'at_1', expiresIn: 900, user: ME }));
    await login('operator', 'pw', true);
    mockFetch(() => json(204));
    await logout();
    expect(callsTo('/auth/logout')).toHaveLength(1);
    expect(callsTo('/auth/logout')[0]!.init.credentials).toBe('include');
    expect(bodyOf(callsTo('/auth/logout')[0]!)).toEqual({});
    expect(getAccessToken()).toBeNull();
  });

  it('로그아웃 요청이 실패해도 메모리의 토큰은 지운다', async () => {
    mockFetch(() => json(200, { accessToken: 'at_1', expiresIn: 900, user: ME }));
    await login('operator', 'pw', true);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(logout()).rejects.toMatchObject({ status: 0 });
    expect(getAccessToken()).toBeNull();
  });

  it('로그인 → 리프레시 → 로그아웃 내내 어떤 토큰도 localStorage·sessionStorage·주소에 들어가지 않는다', async () => {
    // 서버가 실수로 본문에 리프레시 토큰을 넣어도 웹은 저장하지 않는다
    mockFetch((path) => {
      if (path === '/auth/login') return json(200, { accessToken: 'at_login', refreshToken: 'rt_login', expiresIn: 900, user: ME });
      if (path === '/auth/refresh') return json(200, { accessToken: 'at_next', refreshToken: 'rt_next', expiresIn: 900 });
      return json(204);
    });
    await login('operator', 'pw', true);
    expect(await getRefreshToken()).toBeNull();
    await restoreSession();
    await logout();
    expectNoTokenLeak(['at_login', 'rt_login', 'at_next', 'rt_next']);
  });
});

describe('안드로이드: 리프레시 토큰은 보안 저장소 (본문으로 주고받는다)', () => {
  it('자동 로그인을 켜면 보안 저장소에 두고, 앱을 다시 켜도(새 저장소 객체) 되살린다', async () => {
    const secure = fakeSecureStorage();
    setRefreshTokenStore(createNativeTokenStore(secure));
    mockFetch(() => json(200, { accessToken: 'at_1', refreshToken: 'rt_1', expiresIn: 900, user: ME }));
    await login('operator', 'pw', true);
    expect(bodyOf(calls[0]!)).toMatchObject({ remember: true, refreshTokenDelivery: 'body' });
    expect(calls[0]!.init.credentials).toBeUndefined();
    expect(secure.data.get(SECURE_REFRESH_KEY)).toBe('rt_1');

    // 앱을 껐다 켬: 메모리는 비고 보안 저장소만 남는다
    setRefreshTokenStore(createNativeTokenStore(secure));
    mockFetch((path) => (path === '/auth/refresh' ? json(200, { accessToken: 'at_2', refreshToken: 'rt_2', expiresIn: 900 }) : json(200, ME)));
    expect(await restoreSession()).toEqual({ kind: 'restored', me: ME });
    expect(bodyOf(callsTo('/auth/refresh')[0]!)).toEqual({ refreshToken: 'rt_1' });
    // 교체된 새 토큰으로 바로 바뀐다 (자동 로그인 유지)
    expect(secure.data.get(SECURE_REFRESH_KEY)).toBe('rt_2');
  });

  it('자동 로그인을 끄면 메모리에만 두고 보안 저장소에는 쓰지 않는다 (교체돼도 그대로)', async () => {
    const secure = fakeSecureStorage();
    secure.data.set(SECURE_REFRESH_KEY, 'rt_old_session');
    setRefreshTokenStore(createNativeTokenStore(secure));
    mockFetch((path) =>
      path === '/auth/login'
        ? json(200, { accessToken: 'at_1', refreshToken: 'rt_1', expiresIn: 900, user: ME })
        : json(200, { accessToken: 'at_2', refreshToken: 'rt_2', expiresIn: 900 }),
    );
    await login('operator', 'pw', false);
    expect(secure.data.has(SECURE_REFRESH_KEY)).toBe(false);
    expect(await getRefreshToken()).toBe('rt_1');
    await restoreSession();
    expect(await getRefreshToken()).toBe('rt_2');
    expect(secure.data.has(SECURE_REFRESH_KEY)).toBe(false);
  });

  it('보안 저장소에 토큰이 없으면 서버에 묻지 않고 로그인 화면', async () => {
    setRefreshTokenStore(createNativeTokenStore(fakeSecureStorage()));
    mockFetch(() => json(500));
    expect(await restoreSession()).toEqual({ kind: 'none' });
    expect(calls).toHaveLength(0);
  });

  it('리프레시가 거부되면 보안 저장소에서도 지운다 (네트워크 오류면 남긴다)', async () => {
    const secure = fakeSecureStorage();
    secure.data.set(SECURE_REFRESH_KEY, 'rt_1');
    setRefreshTokenStore(createNativeTokenStore(secure));
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await restoreSession()).toEqual({ kind: 'unavailable' });
    expect(secure.data.get(SECURE_REFRESH_KEY)).toBe('rt_1');

    mockFetch(() => rejected('REFRESH_TOKEN_EXPIRED'));
    expect(await restoreSession()).toEqual({ kind: 'none' });
    expect(secure.data.has(SECURE_REFRESH_KEY)).toBe(false);
  });

  it('로그아웃: 본문의 토큰으로 서버에 폐기를 요청하고 보안 저장소와 메모리를 비운다', async () => {
    const secure = fakeSecureStorage();
    setRefreshTokenStore(createNativeTokenStore(secure));
    mockFetch(() => json(200, { accessToken: 'at_1', refreshToken: 'rt_1', expiresIn: 900, user: ME }));
    await login('operator', 'pw', true);
    mockFetch(() => json(204));
    await logout();
    expect(bodyOf(callsTo('/auth/logout')[0]!)).toEqual({ refreshToken: 'rt_1' });
    expect(secure.data.size).toBe(0);
    expect(getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  it('안드로이드에서도 토큰은 브라우저 저장소·주소에 들어가지 않는다', async () => {
    setRefreshTokenStore(createNativeTokenStore(fakeSecureStorage()));
    mockFetch((path) =>
      path === '/auth/login'
        ? json(200, { accessToken: 'at_a', refreshToken: 'rt_a', expiresIn: 900, user: ME })
        : path === '/auth/refresh'
          ? json(200, { accessToken: 'at_b', refreshToken: 'rt_b', expiresIn: 900 })
          : json(204),
    );
    await login('operator', 'pw', true);
    await restoreSession();
    await logout();
    expectNoTokenLeak(['at_a', 'rt_a', 'at_b', 'rt_b']);
  });
});
