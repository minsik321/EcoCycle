// 토큰 보관 (명세 6절 "토큰 보관과 자동 로그인", docs/decisions.md 2026-10-15).
// - 액세스 토큰: 메모리에만.
// - 리프레시 토큰: 저장소 인터페이스 하나(RefreshTokenStore)에 구현 둘.
//   웹(기본): 서버가 HttpOnly 쿠키로 보관한다. 스크립트는 토큰을 보지도 저장하지도 않는다.
//   안드로이드: Android Keystore 기반 보안 저장소(Capacitor 플러그인). 자동 로그인을 끄면 메모리에만 둔다.
// 어떤 토큰도 localStorage·sessionStorage·URL에 두지 않는다.
import type { RefreshTokenDelivery } from '@ecocycle/shared';

export interface RefreshTokenStore {
  /** cookie: 서버 쿠키(웹, 요청에 credentials: 'include'). body: 앱이 들고 있다가 요청 본문으로 보낸다(안드로이드) */
  readonly delivery: RefreshTokenDelivery;
  /** 들고 있는 리프레시 토큰. cookie 방식은 스크립트가 볼 수 없으므로 항상 null */
  get(): Promise<string | null>;
  /**
   * 새 토큰을 둔다. remember는 로그인할 때만 넘기고, 교체(리프레시) 때는 빼서 처음 정한 방식을 유지한다.
   * cookie 방식은 서버가 Set-Cookie로 바꾸므로 할 일이 없다.
   */
  set(token: string | undefined, remember?: boolean): Promise<void>;
  /** cookie 방식은 서버가 로그아웃 응답에서 쿠키를 지운다 */
  clear(): Promise<void>;
}

/** 웹: 리프레시 토큰은 HttpOnly 쿠키라 스크립트가 다루지 않는다 */
export function createCookieTokenStore(): RefreshTokenStore {
  return {
    delivery: 'cookie',
    get: async () => null,
    set: async () => undefined,
    clear: async () => undefined,
  };
}

/** 메모리 전용(body 방식). 앱을 닫으면 사라진다. 단위 테스트와 자동 로그인을 끈 안드로이드 세션에 쓴다. */
export function createMemoryTokenStore(): RefreshTokenStore {
  let token: string | null = null;
  return {
    delivery: 'body',
    get: async () => token,
    set: async (value) => {
      token = value ?? null;
    },
    clear: async () => {
      token = null;
    },
  };
}

/**
 * 보안 저장소 플러그인이 해 줘야 하는 일. 안드로이드 빌드 단계에서 고른 Capacitor 플러그인(Android Keystore로 암호화)을
 * 이 모양으로 감싸 넘긴다. 플러그인 선택은 docs/decisions.md 2026-10-15 "자동 로그인" 참고.
 */
export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const SECURE_REFRESH_KEY = 'ecocycle.refreshToken';

/**
 * 안드로이드: 자동 로그인이면 보안 저장소에, 아니면 메모리에만 둔다(앱을 닫으면 다시 로그인).
 * 앱을 켰을 때 보안 저장소에 토큰이 있으면 자동 로그인 세션이다.
 */
export function createNativeTokenStore(secure: SecureStorage): RefreshTokenStore {
  let memory: string | null = null;
  /** null: 아직 모름(앱 시작 직후) → 보안 저장소를 본다 */
  let persist: boolean | null = null;
  return {
    delivery: 'body',
    async get() {
      if (persist === false) return memory;
      const stored = await secure.get(SECURE_REFRESH_KEY);
      if (persist === null && stored) persist = true;
      return stored;
    },
    async set(token, remember) {
      if (remember !== undefined) persist = remember;
      if (!token) return;
      if (persist) {
        memory = null;
        await secure.set(SECURE_REFRESH_KEY, token);
      } else {
        memory = token;
        await secure.remove(SECURE_REFRESH_KEY);
      }
    },
    async clear() {
      memory = null;
      persist = null;
      await secure.remove(SECURE_REFRESH_KEY);
    },
  };
}

let accessToken: string | null = null;
let refreshStore: RefreshTokenStore = createCookieTokenStore();

/** 안드로이드 앱 시작 때 createNativeTokenStore(...)로 바꿔 끼운다. 기본은 웹 쿠키 방식 */
export function setRefreshTokenStore(store: RefreshTokenStore): void {
  refreshStore = store;
}

export const getAccessToken = (): string | null => accessToken;
export const getRefreshToken = (): Promise<string | null> => refreshStore.get();
export const refreshTokenDelivery = (): RefreshTokenDelivery => refreshStore.delivery;

/**
 * 로그인·리프레시 응답의 새 토큰으로 바꾼다. 리프레시 토큰은 사용할 때마다 교체되므로 즉시 반영한다.
 * remember는 로그인할 때만 넘긴다. cookie 방식에서는 refresh가 없다(서버가 쿠키로 바꾼다).
 */
export async function setTokens(access: string, refresh: string | undefined, remember?: boolean): Promise<void> {
  accessToken = access;
  await refreshStore.set(refresh, remember);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  await refreshStore.clear();
}
