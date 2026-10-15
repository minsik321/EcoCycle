// @vitest-environment node
// 통합 테스트: 자동 로그인과 리프레시 토큰 규칙을 실제 모의 서버로 확인한다 (명세 6절 "토큰 보관과 자동 로그인").
//   - 웹: 쿠키 속성(HttpOnly·Secure·SameSite·Path), 자동 로그인이면 지속 쿠키(14일), 아니면 세션 쿠키, 본문에 리프레시 토큰 없음
//   - 교체: 리프레시할 때마다 새 토큰, 이전 토큰은 다시 못 쓴다
//   - 재사용 감지: 이미 쓴 토큰이 오면 그 세션의 모든 토큰이 폐기된다 (다른 세션은 그대로)
//   - 유예: 교체 직후(유예 시간 안) 바로 앞 토큰이 다시 오면 응답을 잃은 정상 요청으로 보고 같은 새 토큰 쌍을 다시 준다.
//     유예 시간이 지났거나 그 뒤 교체가 또 일어났으면 재사용으로 보고 폐기한다
//   - 로그아웃: 세션 폐기와 쿠키 삭제
//   - CORS: credentials 허용, 명시한 출처만
// 브라우저에서 새로고침해도 로그인이 유지되는지는 scripts/authReload.mjs가 실제 Chromium으로 본다.
// 실행: npm run test:integration
import { describe, expect, it } from 'vitest';
import { REFRESH_COOKIE_NAME } from '@ecocycle/shared';

const API = (process.env.VITE_API_BASE ?? 'http://localhost:4099/api/v1').replace(/\/$/, '');
/** 모의 서버의 CORS_ORIGINS에 들어 있는 출처 (scripts/integration.mjs가 넘긴다) */
const ORIGIN = process.env.INTEGRATION_APP_ORIGIN ?? 'http://localhost:5173';
/** 모의 서버의 리프레시 재사용 유예 시간 (scripts/integration.mjs가 짧게 줄여 넘긴다) */
const GRACE_MS = Number(process.env.INTEGRATION_REFRESH_GRACE_SEC ?? 30) * 1000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** 유예 시간이 지나기를 기다린다 */
const pastGrace = () => sleep(GRACE_MS + 500);

interface SetCookie {
  value: string;
  attrs: Record<string, string | true>;
}

function parseSetCookie(res: Response): SetCookie | null {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!line) return null;
  const [pair, ...rest] = line.split(';').map((s) => s.trim());
  const attrs: Record<string, string | true> = {};
  for (const part of rest) {
    const [k, v] = part.split('=');
    attrs[k!.toLowerCase()] = v ?? true;
  }
  return { value: decodeURIComponent(pair!.slice(REFRESH_COOKIE_NAME.length + 1)), attrs };
}

async function post(path: string, body: object, { cookie, origin = ORIGIN }: { cookie?: string; origin?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: origin };
  if (cookie !== undefined) headers.Cookie = `${REFRESH_COOKIE_NAME}=${encodeURIComponent(cookie)}`;
  return fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function webLogin(remember: boolean) {
  const res = await post('/auth/login', { id: 'operator', password: 'mock-operator', remember, refreshTokenDelivery: 'cookie' });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { accessToken: string; refreshToken?: string };
  const cookie = parseSetCookie(res);
  expect(cookie, 'Set-Cookie').not.toBeNull();
  return { res, body, cookie: cookie! };
}

async function bodyLogin(remember = true) {
  const res = await post('/auth/login', { id: 'operator', password: 'mock-operator', remember, refreshTokenDelivery: 'body' });
  expect(res.status).toBe(200);
  return (await res.json()) as { accessToken: string; refreshToken: string };
}

const meStatus = async (accessToken: string) =>
  (await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${accessToken}` } })).status;

const errorCode = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

describe('자동 로그인: 쿠키 (웹)', () => {
  it('자동 로그인을 켜면 14일짜리 지속 쿠키: HttpOnly, Secure, SameSite=Lax, Path=/api/v1/auth, 본문에 리프레시 토큰 없음', async () => {
    const { body, cookie } = await webLogin(true);
    expect(body.refreshToken).toBeUndefined();
    expect(cookie.attrs.httponly).toBe(true);
    expect(cookie.attrs.secure).toBe(true);
    expect(String(cookie.attrs.samesite).toLowerCase()).toBe('lax');
    expect(cookie.attrs.path).toBe('/api/v1/auth');
    expect(Number(cookie.attrs['max-age'])).toBe(14 * 24 * 60 * 60);
    expect(cookie.attrs.expires).toBeDefined();
  });

  it('자동 로그인을 끄면 세션 쿠키 (Max-Age·Expires 없음 → 브라우저를 닫으면 사라진다)', async () => {
    const { cookie } = await webLogin(false);
    expect(cookie.attrs['max-age']).toBeUndefined();
    expect(cookie.attrs.expires).toBeUndefined();
    expect(cookie.attrs.httponly).toBe(true);
  });

  it('쿠키로 리프레시하면 새 액세스 토큰과 새 쿠키(교체), 지속/세션 여부는 그대로', async () => {
    for (const remember of [true, false]) {
      const { cookie } = await webLogin(remember);
      const res = await post('/auth/refresh', {}, { cookie: cookie.value });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { accessToken: string; refreshToken?: string };
      expect(body.refreshToken).toBeUndefined();
      expect(await meStatus(body.accessToken)).toBe(200);
      const next = parseSetCookie(res)!;
      expect(next.value).not.toBe(cookie.value);
      expect(next.attrs['max-age'] !== undefined).toBe(remember);
    }
  });

  it('쿠키가 없으면 401 REFRESH_TOKEN_MISSING', async () => {
    const res = await post('/auth/refresh', {});
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('REFRESH_TOKEN_MISSING');
  });

  it('재사용 감지: 이미 쓴 쿠키가 다시 오면 그 세션의 모든 토큰이 폐기되고 쿠키가 지워진다. 다른 세션은 그대로', async () => {
    const victim = await webLogin(true);
    const other = await webLogin(true);
    const first = await post('/auth/refresh', {}, { cookie: victim.cookie.value });
    const newAccess = ((await first.json()) as { accessToken: string }).accessToken;
    const newCookie = parseSetCookie(first)!.value;

    // 유예 시간이 지난 뒤 훔친(이미 쓴) 쿠키를 다시 보낸다
    await pastGrace();
    const replay = await post('/auth/refresh', {}, { cookie: victim.cookie.value });
    expect(replay.status).toBe(401);
    expect(await errorCode(replay)).toBe('REFRESH_TOKEN_REUSED');
    const cleared = parseSetCookie(replay)!;
    expect(cleared.value).toBe('');

    // 정상 사용자가 가진 새 쿠키와 새 액세스 토큰도 더는 안 된다 (세션째 폐기)
    expect((await post('/auth/refresh', {}, { cookie: newCookie })).status).toBe(401);
    expect(await meStatus(newAccess)).toBe(401);
    expect(await meStatus(victim.body.accessToken)).toBe(401);

    // 다른 로그인 세션은 영향이 없다
    expect(await meStatus(other.body.accessToken)).toBe(200);
    expect((await post('/auth/refresh', {}, { cookie: other.cookie.value })).status).toBe(200);
  });

  it('응답을 잃은 리프레시: 유예 시간 안에 이전 쿠키가 다시 오면 같은 새 토큰을 다시 주고 세션은 그대로', async () => {
    const { cookie } = await webLogin(true);
    // 요청은 서버에 닿아 교체되었지만 응답을 잃었다 (새로고침·이동·네트워크 끊김) → 브라우저에는 이전 쿠키가 남는다
    const lost = await post('/auth/refresh', {}, { cookie: cookie.value });
    expect(lost.status).toBe(200);
    const lostAccess = ((await lost.json()) as { accessToken: string }).accessToken;
    const lostCookie = parseSetCookie(lost)!;

    const retry = await post('/auth/refresh', {}, { cookie: cookie.value });
    expect(retry.status).toBe(200);
    const retryBody = (await retry.json()) as { accessToken: string; refreshToken?: string; expiresIn: number };
    expect(retryBody.accessToken).toBe(lostAccess);
    expect(retryBody.refreshToken).toBeUndefined();
    expect(retryBody.expiresIn).toBeGreaterThan(0);
    const retryCookie = parseSetCookie(retry)!;
    expect(retryCookie.value).toBe(lostCookie.value);
    expect(retryCookie.attrs.httponly).toBe(true);
    expect(retryCookie.attrs['max-age']).toBe(lostCookie.attrs['max-age']);
    expect(await meStatus(retryBody.accessToken)).toBe(200);

    // 세션은 살아 있고 교체가 이어진다: 다시 받은 쿠키로 리프레시하면 새 토큰
    const next = await post('/auth/refresh', {}, { cookie: retryCookie.value });
    expect(next.status).toBe(200);
    const nextAccess = ((await next.json()) as { accessToken: string }).accessToken;
    expect(parseSetCookie(next)!.value).not.toBe(retryCookie.value);
    expect(await meStatus(nextAccess)).toBe(200);
  });

  it('유예 시간 안이어도 그 뒤 교체가 또 일어났으면(바로 앞 토큰이 아니면) 재사용으로 보고 폐기한다', async () => {
    const { cookie } = await webLogin(true);
    const first = await post('/auth/refresh', {}, { cookie: cookie.value });
    const second = await post('/auth/refresh', {}, { cookie: parseSetCookie(first)!.value });
    expect(second.status).toBe(200);
    const secondAccess = ((await second.json()) as { accessToken: string }).accessToken;

    const replay = await post('/auth/refresh', {}, { cookie: cookie.value });
    expect(replay.status).toBe(401);
    expect(await errorCode(replay)).toBe('REFRESH_TOKEN_REUSED');
    expect(await meStatus(secondAccess)).toBe(401);
  });

  it('유예 시간이 지난 뒤 이전 쿠키가 오면 재사용으로 보고 세션을 폐기한다 (응답을 잃었어도)', async () => {
    const { cookie } = await webLogin(true);
    const lost = await post('/auth/refresh', {}, { cookie: cookie.value });
    const lostAccess = ((await lost.json()) as { accessToken: string }).accessToken;
    const lostCookie = parseSetCookie(lost)!.value;
    // 유예 시간 안에는 같은 토큰을 다시 받는다
    expect((await post('/auth/refresh', {}, { cookie: cookie.value })).status).toBe(200);

    await pastGrace();
    const late = await post('/auth/refresh', {}, { cookie: cookie.value });
    expect(late.status).toBe(401);
    expect(await errorCode(late)).toBe('REFRESH_TOKEN_REUSED');
    expect(parseSetCookie(late)!.value).toBe('');
    expect((await post('/auth/refresh', {}, { cookie: lostCookie })).status).toBe(401);
    expect(await meStatus(lostAccess)).toBe(401);
  });

  it('로그아웃: 204, 쿠키를 지우고 세션의 토큰을 모두 폐기한다', async () => {
    const { body, cookie } = await webLogin(true);
    const res = await post('/auth/logout', {}, { cookie: cookie.value });
    expect(res.status).toBe(204);
    const cleared = parseSetCookie(res)!;
    expect(cleared.value).toBe('');
    expect(cleared.attrs.path).toBe('/api/v1/auth');
    expect(new Date(String(cleared.attrs.expires)).getTime()).toBeLessThan(Date.now());
    expect((await post('/auth/refresh', {}, { cookie: cookie.value })).status).toBe(401);
    expect(await meStatus(body.accessToken)).toBe(401);
  });

  it('허용하지 않은 출처에서 쿠키로 리프레시·로그인하면 403', async () => {
    const { cookie } = await webLogin(true);
    expect((await post('/auth/refresh', {}, { cookie: cookie.value, origin: 'https://evil.example' })).status).toBe(403);
    const login = await post(
      '/auth/login',
      { id: 'operator', password: 'mock-operator', refreshTokenDelivery: 'cookie' },
      { origin: 'https://evil.example' },
    );
    expect(login.status).toBe(403);
  });

  it('CORS: 허용한 출처에는 credentials를 허용하고, 다른 출처에는 허용 헤더를 주지 않는다', async () => {
    const preflight = (origin: string) =>
      fetch(`${API}/auth/refresh`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      });
    const ok = await preflight(ORIGIN);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    const evil = await preflight('https://evil.example');
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('자동 로그인: 본문 (안드로이드)', () => {
  it('본문으로 주고받고 쿠키는 쓰지 않는다. 교체 후 이전 토큰을 다시 쓰면 세션 전체 폐기', async () => {
    const login = await post('/auth/login', { id: 'operator', password: 'mock-operator', remember: true, refreshTokenDelivery: 'body' });
    expect(parseSetCookie(login)).toBeNull();
    const first = (await login.json()) as { accessToken: string; refreshToken: string };
    expect(first.refreshToken).toMatch(/^rt_/);

    const rotated = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(rotated.status).toBe(200);
    expect(parseSetCookie(rotated)).toBeNull();
    const second = (await rotated.json()) as { accessToken: string; refreshToken: string };
    expect(second.refreshToken).not.toBe(first.refreshToken);

    await pastGrace();
    const replay = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    expect(await errorCode(replay)).toBe('REFRESH_TOKEN_REUSED');
    expect((await post('/auth/refresh', { refreshToken: second.refreshToken })).status).toBe(401);
    expect(await meStatus(second.accessToken)).toBe(401);
  });

  it('본문 방식도 응답을 잃으면 유예 시간 안에는 같은 새 토큰 쌍을 다시 받는다', async () => {
    const first = await bodyLogin();
    const lost = (await (await post('/auth/refresh', { refreshToken: first.refreshToken })).json()) as { accessToken: string; refreshToken: string };
    const retry = await post('/auth/refresh', { refreshToken: first.refreshToken });
    expect(retry.status).toBe(200);
    expect(parseSetCookie(retry)).toBeNull();
    const again = (await retry.json()) as { accessToken: string; refreshToken: string };
    expect(again).toMatchObject({ accessToken: lost.accessToken, refreshToken: lost.refreshToken });
    expect((await post('/auth/refresh', { refreshToken: again.refreshToken })).status).toBe(200);
  });

  it('로그아웃하면 본문의 토큰이 속한 세션이 폐기된다', async () => {
    const { accessToken, refreshToken } = await bodyLogin();
    expect((await post('/auth/logout', { refreshToken })).status).toBe(204);
    expect((await post('/auth/refresh', { refreshToken })).status).toBe(401);
    expect(await meStatus(accessToken)).toBe(401);
  });

  it('옛 클라이언트처럼 remember·방식을 빼면 본문 방식으로 동작한다', async () => {
    const res = await post('/auth/login', { id: 'viewer', password: 'mock-viewer' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { refreshToken?: string }).refreshToken).toMatch(/^rt_/);
  });

  it('잘못된 remember·방식은 422', async () => {
    expect((await post('/auth/login', { id: 'viewer', password: 'mock-viewer', remember: 'yes' })).status).toBe(422);
    expect((await post('/auth/login', { id: 'viewer', password: 'mock-viewer', refreshTokenDelivery: 'url' })).status).toBe(422);
  });
});
