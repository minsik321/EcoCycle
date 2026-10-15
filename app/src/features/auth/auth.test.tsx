import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api';
import { AppShell } from '../../components/layout/AppShell';
import { restoreUserSession, sessionLost } from '../../store';
import { ADMIN, renderWithStore } from '../../test/utils';
import { LoginPage } from './LoginPage';
import { RequireAuth } from './RequireAuth';
import { loginErrorMessage } from './messages';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  login: vi.fn(),
  logout: vi.fn(async () => undefined),
  restoreSession: vi.fn(),
}));

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.pathname}</div>;
}

function app() {
  return (
    <>
      <Where />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<div>홈 내용</div>} />
            <Route path="alarms" element={<div>알람 내용</div>} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}

const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  vi.mocked(api.login).mockReset();
  vi.mocked(api.restoreSession).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loginErrorMessage', () => {
  const base = { code: 'X', message: '서버 메시지', status: 0 };
  it('상태 코드별로 이해하기 쉬운 문장을 만든다', () => {
    expect(loginErrorMessage({ ...base, status: 401 })).toContain('아이디 또는 비밀번호');
    expect(loginErrorMessage({ ...base, status: 429, retryAfterSec: 60 })).toContain('60초 뒤');
    expect(loginErrorMessage({ ...base, status: 429 })).toContain('잠시 뒤');
    expect(loginErrorMessage({ ...base, status: 0 })).toContain('서버에 연결할 수 없습니다');
    expect(loginErrorMessage({ ...base, status: 503 })).toContain('서버에 연결할 수 없습니다');
    expect(loginErrorMessage({ ...base, status: 422 })).toContain('모두 입력');
    expect(loginErrorMessage({ ...base, status: 500 })).toBe('서버 메시지');
  });

  it('아이디가 없는지 비밀번호가 틀렸는지는 구분해서 알려 주지 않는다', () => {
    expect(loginErrorMessage({ code: 'INVALID_CREDENTIALS', message: '', status: 401 })).toBe(
      '아이디 또는 비밀번호가 올바르지 않습니다.',
    );
  });
});

describe('RequireAuth', () => {
  it('로그인하지 않았으면 /login으로 보낸다', () => {
    renderWithStore(app(), { me: null, route: '/alarms' });
    expect(where()).toBe('/login');
    expect(screen.queryByText('알람 내용')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'EcoCycle' })).toBeInTheDocument();
  });

  it('세션을 확인하는 동안에는 로그인 화면으로 보내지도 내용을 보여 주지도 않는다', () => {
    renderWithStore(app(), { me: 'unknown', route: '/alarms' });
    expect(where()).toBe('/alarms');
    expect(screen.getByRole('status')).toHaveTextContent('로그인 확인 중…');
    expect(screen.queryByText('알람 내용')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('아이디')).not.toBeInTheDocument();
  });

  it('세션 확인이 서버에 닿지 못하면 다시 시도하거나 로그인 화면으로 갈 수 있다', async () => {
    vi.mocked(api.restoreSession).mockResolvedValue({ kind: 'unavailable' });
    const { store } = renderWithStore(app(), { me: 'unknown', route: '/alarms' });
    await act(async () => {
      await store.dispatch(restoreUserSession());
    });
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결할 수 없어');
    expect(where()).toBe('/alarms');

    // 다시 시도: 이번에는 되살아난다
    vi.mocked(api.restoreSession).mockResolvedValue({ kind: 'restored', me: ADMIN });
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    await vi.waitFor(() => expect(screen.getByRole('main')).toHaveTextContent('알람 내용'));
    expect(api.restoreSession).toHaveBeenCalledTimes(2);
  });

  it('세션 확인 실패 화면에서 로그인 화면으로 갈 수 있다', async () => {
    vi.mocked(api.restoreSession).mockResolvedValue({ kind: 'unavailable' });
    const { store } = renderWithStore(app(), { me: 'unknown', route: '/alarms' });
    await act(async () => {
      await store.dispatch(restoreUserSession());
    });
    await userEvent.click(screen.getByRole('button', { name: '로그인 화면으로' }));
    expect(where()).toBe('/login');
    expect(store.getState().auth.sessionExpired).toBe(false);
  });

  it('로그인되어 있으면 화면을 보여 준다', () => {
    renderWithStore(app(), { me: ADMIN, route: '/alarms' });
    expect(where()).toBe('/alarms');
    expect(screen.getByRole('main')).toHaveTextContent('알람 내용');
  });

  it('로그인 화면에 이미 로그인한 채로 들어오면 홈으로 보낸다', () => {
    renderWithStore(app(), { me: ADMIN, route: '/login' });
    expect(where()).toBe('/');
    expect(screen.getByRole('main')).toHaveTextContent('홈 내용');
  });

  it('로그아웃하면 로그인 화면으로 간다', async () => {
    renderWithStore(app(), { me: ADMIN, route: '/' });
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await vi.waitFor(() => expect(where()).toBe('/login'));
  });
});

describe('LoginPage', () => {
  const type = async (id: string, password: string) => {
    await userEvent.type(screen.getByLabelText('아이디'), id);
    await userEvent.type(screen.getByLabelText('비밀번호'), password);
  };

  it('아이디와 비밀번호 입력란이 있고 비밀번호는 가려진다', () => {
    renderWithStore(app(), { me: null, route: '/login' });
    expect(screen.getByLabelText('아이디')).toHaveFocus();
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('비어 있으면 서버에 보내지 않고 안내한다', async () => {
    renderWithStore(app(), { me: null, route: '/login' });
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByRole('alert')).toHaveTextContent('모두 입력');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('로그인에 성공하면 홈으로 간다', async () => {
    vi.mocked(api.login).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: ADMIN });
    const { store } = renderWithStore(app(), { me: null, route: '/login' });
    await type('admin', 'mock-admin');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    await vi.waitFor(() => expect(where()).toBe('/'));
    expect(api.login).toHaveBeenCalledWith('admin', 'mock-admin', false);
    expect(store.getState().auth.status).toBe('loggedIn');
    expect(screen.getByRole('main')).toHaveTextContent('홈 내용');
  });

  it('자동 로그인은 기본으로 꺼져 있다', () => {
    renderWithStore(app(), { me: null, route: '/login' });
    expect(screen.getByRole('checkbox', { name: '자동 로그인' })).not.toBeChecked();
  });

  it('자동 로그인을 켜고 로그인하면 remember: true로 보낸다', async () => {
    vi.mocked(api.login).mockResolvedValue({ accessToken: 'a', expiresIn: 900, user: ADMIN });
    renderWithStore(app(), { me: null, route: '/login' });
    await type('admin', 'mock-admin');
    await userEvent.click(screen.getByRole('checkbox', { name: '자동 로그인' }));
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    await vi.waitFor(() => expect(where()).toBe('/'));
    expect(api.login).toHaveBeenCalledWith('admin', 'mock-admin', true);
  });

  it('보호된 화면에서 튕겨 왔다면 로그인 후 그 화면으로 돌아간다', async () => {
    vi.mocked(api.login).mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: ADMIN });
    renderWithStore(app(), { me: null, route: '/alarms' });
    expect(where()).toBe('/login');
    await type('admin', 'mock-admin');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    await vi.waitFor(() => expect(where()).toBe('/alarms'));
  });

  it('틀린 비밀번호: 안내하고, 비밀번호는 지우고 아이디는 남기고, 비밀번호로 초점을 옮긴다', async () => {
    vi.mocked(api.login).mockRejectedValue(new api.ApiError(401, 'INVALID_CREDENTIALS', '틀림'));
    renderWithStore(app(), { me: null, route: '/login' });
    await type('admin', 'wrong');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('아이디 또는 비밀번호가 올바르지 않습니다.');
    expect(screen.getByLabelText('아이디')).toHaveValue('admin');
    expect(screen.getByLabelText('비밀번호')).toHaveValue('');
    expect(screen.getByLabelText('비밀번호')).toHaveFocus();
    expect(where()).toBe('/login');
  });

  it('고쳐 쓰기 시작하면 오류 문구가 사라진다', async () => {
    vi.mocked(api.login).mockRejectedValue(new api.ApiError(401, 'INVALID_CREDENTIALS', ''));
    renderWithStore(app(), { me: null, route: '/login' });
    await type('admin', 'wrong');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    await screen.findByRole('alert');
    await userEvent.type(screen.getByLabelText('아이디'), 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('서버에 연결하지 못하면 그렇게 안내한다', async () => {
    vi.mocked(api.login).mockRejectedValue(new api.ApiError(0, 'NETWORK_ERROR', '연결 안 됨'));
    renderWithStore(app(), { me: null, route: '/login' });
    await type('admin', 'x');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다');
  });

  it('로그인 중에는 다시 누를 수 없어서 한 번만 보낸다', async () => {
    let finish!: () => void;
    vi.mocked(api.login).mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: ADMIN }))),
    );
    renderWithStore(app(), { me: null, route: '/login' });
    await type('admin', 'x');
    const button = screen.getByRole('button', { name: '로그인' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    await userEvent.type(screen.getByLabelText('비밀번호'), '{Enter}');
    expect(api.login).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it('시도 횟수 제한(429)이 걸리면 남은 시간 동안 버튼을 막고 시간이 지나면 풀린다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(api.login).mockRejectedValue(new api.ApiError(429, 'TOO_MANY_REQUESTS', '', 3));
    renderWithStore(app(), { me: null, route: '/login' });
    await type('operator', 'x');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    const blocked = await screen.findByRole('button', { name: '3초 뒤에 다시 시도' });
    expect(blocked).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('3초 뒤에 다시 시도하세요');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('button', { name: '2초 뒤에 다시 시도' })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: '로그인' })).toBeEnabled();
  });

  it('토큰 갱신이 거부되어 세션을 잃고 돌아온 경우 이유를 알려 준다', () => {
    const { store } = renderWithStore(app(), { me: ADMIN, route: '/alarms' });
    act(() => {
      store.dispatch(sessionLost());
    });
    expect(where()).toBe('/login');
    expect(screen.getByRole('status')).toHaveTextContent('다시 로그인해야 합니다');
  });

  it('일반 로그아웃 뒤의 로그인 화면에는 만료 안내가 없다', async () => {
    renderWithStore(app(), { me: null, route: '/login' });
    expect(screen.queryByText(/다시 로그인해야 합니다/)).not.toBeInTheDocument();
  });
});
