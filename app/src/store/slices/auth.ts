import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { Me } from '@ecocycle/shared';
import * as api from '../../api';

// 로그인 여부와 내 정보(권한 포함). 권한 판단은 selectors의 selectCan 하나로만 한다.

/** unknown: 아직 저장된 세션을 확인하는 중(앱 시작 직후), loggedOut, loggedIn */
export type AuthStatus = 'unknown' | 'loggedOut' | 'loggedIn';

export interface LoginError {
  code: string;
  message: string;
  status: number;
  /** 429일 때 서버가 알려 준 대기 시간(초) */
  retryAfterSec?: number;
}

export interface AuthState {
  status: AuthStatus;
  me: Me | null;
  loginPending: boolean;
  loginError: LoginError | null;
  /** 토큰 갱신이 거부되어 로그인이 풀렸다 (로그인 화면에서 이유를 알려 준다) */
  sessionExpired: boolean;
  /** 앱 시작 때 세션을 확인하려 했지만 서버에 닿지 못했다 (status는 unknown 그대로, 다시 시도하게 한다) */
  restoreUnavailable: boolean;
}

const initialState: AuthState = {
  status: 'unknown',
  me: null,
  loginPending: false,
  loginError: null,
  sessionExpired: false,
  restoreUnavailable: false,
};

function toLoginError(error: unknown): LoginError {
  if (error instanceof api.ApiError) {
    const result: LoginError = { code: error.code, message: error.message, status: error.status };
    if (error.retryAfterSec !== undefined) result.retryAfterSec = error.retryAfterSec;
    return result;
  }
  return { code: 'UNKNOWN', message: '로그인에 실패했습니다.', status: 0 };
}

/** remember: 자동 로그인 (새로고침·앱을 다시 켜도 비밀번호를 묻지 않는다) */
export const loginUser = createAsyncThunk<Me, { id: string; password: string; remember?: boolean }, { rejectValue: LoginError }>(
  'auth/login',
  async ({ id, password, remember = false }, { rejectWithValue }) => {
    try {
      const res = await api.login(id, password, remember);
      return res.user;
    } catch (error) {
      return rejectWithValue(toLoginError(error));
    }
  },
);

/** 서버와 기기의 토큰을 지운다. 서버 요청이 실패해도 로그아웃은 된다. */
export const logoutUser = createAsyncThunk<void, void>('auth/logout', async () => {
  try {
    await api.logout();
  } catch {
    // 서버에 닿지 못해도 기기의 토큰은 api.logout이 지운다
  }
});

/** 앱을 켤 때 리프레시 토큰(웹 쿠키·안드로이드 보안 저장소)으로 세션을 되살린다. 권한은 그때 받은 /me를 쓴다 */
export const restoreUserSession = createAsyncThunk<api.RestoreResult, void>('auth/restore', async () => api.restoreSession());

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** 리프레시까지 거부되어 로그인이 필요해졌다 */
    sessionLost(state) {
      state.status = 'loggedOut';
      state.me = null;
      state.sessionExpired = true;
    },
    clearLoginError(state) {
      state.loginError = null;
    },
    /** 세션 확인이 서버에 닿지 못했을 때 기다리지 않고 로그인 화면으로 간다 */
    restoreSkipped(state) {
      state.status = 'loggedOut';
      state.restoreUnavailable = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loginPending = true;
        state.loginError = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loginPending = false;
        state.status = 'loggedIn';
        state.me = action.payload;
        state.sessionExpired = false;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loginPending = false;
        state.loginError = action.payload ?? { code: 'UNKNOWN', message: '로그인에 실패했습니다.', status: 0 };
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.status = 'loggedOut';
        state.me = null;
      })
      .addCase(restoreUserSession.pending, (state) => {
        state.restoreUnavailable = false;
      })
      .addCase(restoreUserSession.fulfilled, (state, action) => {
        // 확인하는 사이에 이미 로그인했거나 로그인이 풀렸으면 그대로 둔다
        if (state.status !== 'unknown') return;
        const result = action.payload;
        if (result.kind === 'restored') {
          state.status = 'loggedIn';
          state.me = result.me;
        } else if (result.kind === 'none') {
          state.status = 'loggedOut';
        } else {
          state.restoreUnavailable = true;
        }
      })
      .addCase(restoreUserSession.rejected, (state) => {
        if (state.status === 'unknown') state.status = 'loggedOut';
      });
  },
});

export const { sessionLost, clearLoginError, restoreSkipped } = slice.actions;
export default slice.reducer;
