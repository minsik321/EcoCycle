// 토큰 보관. 액세스 토큰은 메모리에만 둔다. 리프레시 토큰은 교체 가능한 저장소에 둔다.
// 기본 저장소는 메모리라서 웹에서는 새로고침하면 다시 로그인해야 한다.
// 안드로이드 앱에서는 Capacitor 보안 저장소 구현으로 바꿔 끼운다 (setRefreshTokenStore).
// localStorage·URL에는 두지 않는다. 보관 방식은 서버 담당과 확인 필요.

export interface RefreshTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

export function createMemoryTokenStore(): RefreshTokenStore {
  let token: string | null = null;
  return {
    get: async () => token,
    set: async (value) => {
      token = value;
    },
    clear: async () => {
      token = null;
    },
  };
}

let accessToken: string | null = null;
let refreshStore: RefreshTokenStore = createMemoryTokenStore();

export function setRefreshTokenStore(store: RefreshTokenStore): void {
  refreshStore = store;
}

export const getAccessToken = (): string | null => accessToken;
export const getRefreshToken = (): Promise<string | null> => refreshStore.get();

/** 로그인·리프레시 응답의 새 토큰으로 바꾼다. 리프레시 토큰은 사용할 때마다 교체되므로 즉시 반영한다. */
export async function setTokens(access: string, refresh: string): Promise<void> {
  accessToken = access;
  await refreshStore.set(refresh);
}

export async function clearTokens(): Promise<void> {
  accessToken = null;
  await refreshStore.clear();
}
