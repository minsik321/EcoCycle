import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api';
import { API_BASE, APP_VERSION } from '../../config/env';
import { connectionChanged, createAppStore, logoutUser, qualityModeChanged } from '../../store';
import { loadQualityMode } from '../../store/slices/ui';
import { ADMIN, NOW, OPERATOR, VIEWER, makeStore, renderWithStore } from '../../test/utils';
import { SettingsPage } from './SettingsPage';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  logout: vi.fn(async () => undefined),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('SettingsPage: 계정', () => {
  it('이름, 아이디, 권한 이름과 할 수 있는 조작을 보여 준다', () => {
    renderWithStore(<SettingsPage />, { me: OPERATOR });
    const card = screen.getByLabelText('계정');
    expect(within(card).getAllByText('작업자', { selector: 'dd' })).toHaveLength(2); // 이름과 권한 이름
    expect(within(card).getByText('operator')).toBeInTheDocument();
    expect(within(card).getByText('시작·일시정지·재개·정지')).toBeInTheDocument();
    expect(within(card).getByText('알람 확인 처리')).toBeInTheDocument();
    expect(within(card).queryByText('설정값 변경')).not.toBeInTheDocument();
    expect(within(card).getByText(/서버가 다시 확인/)).toBeInTheDocument();
  });

  it('관리자는 모든 조작이, 열람자는 조회만 가능하다고 보여 준다', () => {
    const { unmount } = renderWithStore(<SettingsPage />, { me: ADMIN });
    expect(within(screen.getByLabelText('계정')).getAllByRole('listitem')).toHaveLength(5);
    unmount();
    renderWithStore(<SettingsPage />, { me: VIEWER });
    expect(within(screen.getByLabelText('계정')).getByText('조회만 할 수 있습니다.')).toBeInTheDocument();
  });

  it('로그아웃하면 로그아웃된다', async () => {
    const { store } = renderWithStore(<SettingsPage />, { me: OPERATOR });
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    await vi.waitFor(() => expect(store.getState().auth.status).toBe('loggedOut'));
    expect(api.logout).toHaveBeenCalled();
  });
});

describe('SettingsPage: 화질 모드', () => {
  it('기본이 선택되어 있고 저사양으로 바꿀 수 있다', async () => {
    const { store } = renderWithStore(<SettingsPage />);
    const group = screen.getByRole('radiogroup', { name: '화질 모드' });
    expect(within(group).getByRole('radio', { name: /기본/ })).toBeChecked();

    await userEvent.click(within(group).getByRole('radio', { name: /저사양/ }));
    expect(within(group).getByRole('radio', { name: /저사양/ })).toBeChecked();
    expect(store.getState().ui.qualityMode).toBe('low');
  });

  it('바꾼 화질 모드를 이 기기에 기억하고 다음에 열 때 그대로 쓴다', async () => {
    renderWithStore(<SettingsPage />);
    await userEvent.click(screen.getByRole('radio', { name: /저사양/ }));
    expect(localStorage.getItem('ecocycle.qualityMode')).toBe('low');
    expect(loadQualityMode()).toBe('low');
    expect(createAppStore().getState().ui.qualityMode).toBe('low');

    await userEvent.click(screen.getByRole('radio', { name: /기본/ }));
    expect(loadQualityMode()).toBe('standard');
  });

  it('로그아웃으로 앱 상태가 초기화되어도 화질 모드는 유지된다', async () => {
    const store = makeStore();
    store.dispatch(qualityModeChanged('low'));
    await store.dispatch(logoutUser());
    expect(store.getState().ui.qualityMode).toBe('low');
  });

  it('저장소를 쓸 수 없어도 기본값으로 동작한다', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadQualityMode()).toBe('standard');
    spy.mockRestore();
  });

  it('알 수 없는 저장 값은 기본값으로 본다', () => {
    localStorage.setItem('ecocycle.qualityMode', 'ultra');
    expect(loadQualityMode()).toBe('standard');
  });
});

describe('SettingsPage: 앱 정보', () => {
  it('버전, 서버 주소, 서버 종류, 연결 상태를 보여 준다', () => {
    renderWithStore(<SettingsPage />);
    const card = screen.getByLabelText('앱 정보');
    expect(within(card).getByText(APP_VERSION)).toBeInTheDocument();
    expect(within(card).getByText(API_BASE)).toBeInTheDocument();
    expect(within(card).getByText('연결됨')).toBeInTheDocument();
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('연결이 끊기면 연결 끊김과 마지막 수신 시각을 보여 준다', () => {
    const { store } = renderWithStore(<SettingsPage />);
    act(() => {
      store.dispatch(connectionChanged({ status: 'offline', lastReceivedAt: NOW }));
    });
    const card = screen.getByLabelText('앱 정보');
    expect(within(card).getByText('연결 끊김')).toBeInTheDocument();
    expect(within(card).getByText(/마지막 수신/)).toBeInTheDocument();
  });
});
