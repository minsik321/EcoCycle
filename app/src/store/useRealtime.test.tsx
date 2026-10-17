import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api';
import { createAppStore, loginUser, logoutUser } from './index';
import * as client from './realtimeClient';
import { useRealtime, useRobotJointsSubscription } from './useRealtime';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('./realtimeClient', () => ({
  startRealtime: vi.fn(),
  stopRealtime: vi.fn(),
  setAppVisible: vi.fn(),
  acquireJoints: vi.fn(() => release),
}));

const release = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.login).mockResolvedValue({
    accessToken: 'a',
    refreshToken: 'r',
    expiresIn: 900,
    user: { id: 'operator', name: '작업자', role: 'operator', permissions: ['robot.control'] },
  });
  vi.mocked(api.logout).mockResolvedValue(undefined);
});

const wrapperFor = (store: ReturnType<typeof createAppStore>) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };

describe('useRealtime', () => {
  it('로그인 전에는 연결하지 않고, 로그인하면 연결하고, 로그아웃하면 닫는다', async () => {
    const store = createAppStore();
    renderHook(() => useRealtime(), { wrapper: wrapperFor(store) });
    expect(client.startRealtime).not.toHaveBeenCalled();

    await store.dispatch(loginUser({ id: 'operator', password: 'x' }));
    await vi.waitFor(() => expect(client.startRealtime).toHaveBeenCalledTimes(1));
    expect(client.stopRealtime).not.toHaveBeenCalled();

    await store.dispatch(logoutUser());
    await vi.waitFor(() => expect(client.stopRealtime).toHaveBeenCalledTimes(1));
  });

  it('앱이 화면에서 사라지면 보이지 않음으로, 돌아오면 보임으로 알린다', async () => {
    const store = createAppStore();
    await store.dispatch(loginUser({ id: 'operator', password: 'x' }));
    renderHook(() => useRealtime(), { wrapper: wrapperFor(store) });
    await vi.waitFor(() => expect(client.startRealtime).toHaveBeenCalled());

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(client.setAppVisible).toHaveBeenLastCalledWith(false);

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(client.setAppVisible).toHaveBeenLastCalledWith(true);
  });
});

describe('useRobotJointsSubscription', () => {
  it('화면에 있는 동안만 관절 값을 구독하고 나가면 해제한다', () => {
    const { unmount } = renderHook(() => useRobotJointsSubscription());
    expect(client.acquireJoints).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
