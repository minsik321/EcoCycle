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
}

const initialState: AuthState = { status: 'unknown', me: null, loginPending: false, loginError: null };

function toLoginError(error: unknown): LoginError {
  if (error instanceof api.ApiError) {
    const result: LoginError = { code: error.code, message: error.message, status: error.status };
    if (error.retryAfterSec !== undefined) result.retryAfterSec = error.retryAfterSec;
    return result;
  }
  return { code: 'UNKNOWN', message: '로그인에 실패했습니다.', status: 0 };
}

export const loginUser = createAsyncThunk<Me, { id: string; password: string }, { rejectValue: LoginError }>(
  'auth/login',
  async ({ id, password }, { rejectWithValue }) => {
    try {
      const res = await api.login(id, password);
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

/** 앱을 켤 때 저장된 리프레시 토큰으로 세션을 되살린다 (보안 저장소를 쓰는 안드로이드에서 의미가 있다) */
export const restoreUserSession = createAsyncThunk<Me | null, void>('auth/restore', async () => api.restoreSession());

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** 리프레시까지 거부되어 로그인이 필요해졌다 */
    sessionLost(state) {
      state.status = 'loggedOut';
      state.me = null;
    },
    clearLoginError(state) {
      state.loginError = null;
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
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loginPending = false;
        state.loginError = action.payload ?? { code: 'UNKNOWN', message: '로그인에 실패했습니다.', status: 0 };
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.status = 'loggedOut';
        state.me = null;
      })
      .addCase(restoreUserSession.fulfilled, (state, action) => {
        state.status = action.payload ? 'loggedIn' : 'loggedOut';
        state.me = action.payload;
      })
      .addCase(restoreUserSession.rejected, (state) => {
        state.status = 'loggedOut';
      });
  },
});

export const { sessionLost, clearLoginError } = slice.actions;
export default slice.reducer;
