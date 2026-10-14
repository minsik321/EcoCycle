import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../../store';
import { loadHomeMode } from '../../store/slices/ui';
import { conveyorState, renderWithStore, robotState, tankState } from '../../test/utils';
import { HomePage } from './HomePage';
import { SceneDemoPage } from './SceneDemoPage';
import * as support from './sceneSupport';

// 홈 맨 위의 전환 "3D | 대시보드". 3D 묶음(studio)은 가짜로 바꾸고 어느 쪽이 그려지는지만 본다.

const failNow = vi.hoisted(() => ({ value: false }));
vi.mock('../../studio', async () => {
  const { useEffect } = await import('react');
  const Fake = ({ switcher, tabs, onFailed }: { switcher?: ReactNode; tabs?: ReactNode; onFailed: () => void }) => {
    useEffect(() => {
      if (failNow.value) onFailed();
    }, [onFailed]);
    return (
      <div data-testid="studio">
        <div data-testid="studio-switch">{switcher}</div>
        <div data-testid="studio-tabs">{tabs}</div>
      </div>
    );
  };
  return { LiveStudio: Fake, DemoStudio: Fake };
});

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getRobotModel: vi.fn(() => new Promise(() => {})),
  getPlantHistory: vi.fn(() => new Promise(() => {})),
}));

const devices = [tankState(), robotState(), conveyorState()];

beforeEach(() => {
  localStorage.clear();
  failNow.value = false;
  vi.restoreAllMocks();
  vi.spyOn(support, 'supportsWebGL').mockReturnValue(true);
});

describe('홈: 3D | 대시보드 전환', () => {
  it('처음에는 3D가 홈 전체를 쓰고, 전환은 3D 상단 바 안에 있다', async () => {
    renderWithStore(<HomePage />, { devices });
    expect(await screen.findByTestId('studio')).toBeInTheDocument();
    const tabs = within(screen.getByTestId('studio-switch')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['3D', '대시보드']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: '상태 요약' })).not.toBeInTheDocument();
  });

  it('대시보드를 고르면 3D를 내리고, 고른 쪽을 기기에 기억한다. 3D로 돌아올 수 있다', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore(<HomePage />, { devices });
    await screen.findByTestId('studio');
    await user.click(screen.getByRole('tab', { name: '대시보드' }));
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '상태 요약' })).toBeInTheDocument();
    expect(store.getState().ui.homeMode).toBe('dashboard');
    expect(localStorage.getItem('ecocycle.homeMode')).toBe('dashboard');

    await user.click(screen.getByRole('tab', { name: '3D' }));
    expect(await screen.findByTestId('studio')).toBeInTheDocument();
    expect(localStorage.getItem('ecocycle.homeMode')).toBe('3d');
  });

  it('3D를 그릴 수 없는 기기에서는 대시보드로 보여 주고, 3D를 누를 수 없게 하며 짧게 알린다', () => {
    vi.spyOn(support, 'supportsWebGL').mockReturnValue(false);
    renderWithStore(<HomePage />, { devices });
    expect(screen.getByRole('region', { name: '상태 요약' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '3D' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: '대시보드' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('이 기기에서는 3D를 표시할 수 없어 대시보드로 보여 줍니다.')).toBeInTheDocument();
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument();
  });

  it('3D에서 오류가 나면 대시보드로 바꾸고 알린다 (기억한 선택은 그대로 둔다)', async () => {
    failNow.value = true;
    const { store } = renderWithStore(<HomePage />, { devices });
    expect(await screen.findByText('3D를 그리는 중 문제가 생겨 대시보드로 보여 줍니다.')).toBeInTheDocument();
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: '상태 요약' })).toBeInTheDocument();
    expect(store.getState().ui.homeMode).toBe('3d');
  });
});

describe('옛 홈 설정 옮기기', () => {
  it('옛 2D 선택(homeView = cards)은 대시보드로 옮기고 옛 키를 지운다', () => {
    localStorage.setItem('ecocycle.homeView', 'cards');
    localStorage.setItem('ecocycle.homeTab', 'basic');
    expect(createAppStore().getState().ui.homeMode).toBe('dashboard');
    expect(localStorage.getItem('ecocycle.homeMode')).toBe('dashboard');
    expect(localStorage.getItem('ecocycle.homeView')).toBeNull();
    expect(localStorage.getItem('ecocycle.homeTab')).toBeNull();
  });

  it('옛 "기본" 탭이나 3D 선택은 3D로 옮긴다', () => {
    localStorage.setItem('ecocycle.homeTab', 'basic');
    expect(loadHomeMode()).toBe('3d');
    expect(localStorage.getItem('ecocycle.homeTab')).toBeNull();
    localStorage.clear();
    localStorage.setItem('ecocycle.homeView', 'scene');
    localStorage.setItem('ecocycle.homeTab', 'studio');
    expect(loadHomeMode()).toBe('3d');
    expect(localStorage.length).toBe(1);
  });

  it('새 키가 있으면 그것을 따르고, 아무것도 없으면 3D', () => {
    expect(loadHomeMode()).toBe('3d');
    expect(localStorage.length).toBe(0);
    localStorage.setItem('ecocycle.homeMode', 'dashboard');
    localStorage.setItem('ecocycle.homeView', 'scene');
    expect(loadHomeMode()).toBe('dashboard');
  });
});

describe('/scene-demo', () => {
  it('3D 홈만 보여 주고, 연결 끊김 흉내와 프레임 수치를 상단 바에 둔다', async () => {
    renderWithStore(<SceneDemoPage />, { me: null });
    expect(await screen.findByTestId('studio')).toBeInTheDocument();
    const slot = within(screen.getByTestId('studio-tabs'));
    expect(slot.getByRole('button', { name: '연결 끊김 흉내' })).toHaveAttribute('aria-pressed', 'false');
    expect(slot.getByRole('status', { name: '프레임 측정' })).toBeInTheDocument();
  });
});
