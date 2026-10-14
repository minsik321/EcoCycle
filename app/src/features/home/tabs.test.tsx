import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { conveyorState, renderWithStore, robotState, tankState } from '../../test/utils';
import { HomePage } from './HomePage';
import { SceneDemoPage } from './SceneDemoPage';
import * as support from './sceneSupport';

// 홈 3D 영역의 탭 "기본" / "스튜디오". 3D 묶음 두 개(기존 장면, 스튜디오)는 가짜로 바꾸고 어느 쪽이 그려지는지만 본다.

vi.mock('../../scene/HomeScene', () => ({ HomeScene: () => <div data-testid="scene" /> }));

vi.mock('../../studio', () => {
  const Fake = ({ tabs }: { tabs?: ReactNode }) => (
    <div data-testid="studio">
      <div data-testid="studio-tabs">{tabs}</div>
    </div>
  );
  return { LiveStudio: Fake, DemoStudio: Fake };
});

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  getRobotModel: vi.fn(() => new Promise(() => {})),
}));

const devices = [tankState(), robotState(), conveyorState()];
const KEY = 'ecocycle.homeTab';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(support, 'supportsWebGL').mockReturnValue(true);
});

describe('홈: 기본 / 스튜디오 탭', () => {
  it('처음에는 "기본"이고 기존 장면과 홈 요소가 그대로 보인다', async () => {
    renderWithStore(<HomePage />, { devices });
    expect(await screen.findByTestId('scene')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '기본' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '스튜디오' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('region', { name: '함수율' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '작업 단계' })).toBeInTheDocument();
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument();
  });

  it('"스튜디오"를 누르면 스튜디오가 홈 전체를 대신하고, 그 안의 탭으로 "기본"에 돌아온다. 고른 탭은 기기에 기억한다', async () => {
    const user = userEvent.setup();
    renderWithStore(<HomePage />, { devices });
    await screen.findByTestId('scene');

    await user.click(screen.getByRole('tab', { name: '스튜디오' }));
    expect(await screen.findByTestId('studio')).toBeInTheDocument();
    expect(screen.queryByTestId('scene')).not.toBeInTheDocument();
    // 스튜디오는 자기 패널을 가지므로 기본 탭의 요약 카드·단계 바는 그리지 않는다
    expect(screen.queryByRole('region', { name: '함수율' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '작업 단계' })).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe('studio');

    await user.click(within(screen.getByTestId('studio-tabs')).getByRole('tab', { name: '기본' }));
    expect(await screen.findByTestId('scene')).toBeInTheDocument();
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBe('basic');
  });

  it('기억해 둔 탭으로 연다', async () => {
    localStorage.setItem(KEY, 'studio');
    renderWithStore(<HomePage />, { devices });
    expect(await screen.findByTestId('studio')).toBeInTheDocument();
    expect(within(screen.getByTestId('studio-tabs')).getByRole('tab', { name: '스튜디오' })).toHaveAttribute('aria-selected', 'true');
  });

  it('2D로 보거나 3D를 그릴 수 없는 기기에서는 탭이 없고, 기억한 탭과 상관없이 2D 카드를 보여 준다', async () => {
    localStorage.setItem(KEY, 'studio');
    vi.spyOn(support, 'supportsWebGL').mockReturnValue(false);
    renderWithStore(<HomePage />, { devices });
    expect(screen.getByRole('region', { name: '기기 상태' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('studio')).not.toBeInTheDocument();
  });

  it('탭을 바꿔도 3D/2D 표시 모드는 그대로다', async () => {
    const user = userEvent.setup();
    const { store } = renderWithStore(<HomePage />, { devices });
    await screen.findByTestId('scene');
    await user.click(screen.getByRole('button', { name: '2D' }));
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(store.getState().ui.homeView).toBe('cards');
    await user.click(screen.getByRole('button', { name: '3D' }));
    expect(screen.getByRole('tab', { name: '기본' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('/scene-demo: 같은 탭 전환', () => {
  it('기본 장면과 스튜디오를 오가고, 스튜디오에서도 연결 끊김 흉내와 프레임 수치를 볼 수 있다', async () => {
    const user = userEvent.setup();
    renderWithStore(<SceneDemoPage />, { me: null });
    expect(await screen.findByTestId('scene')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '스튜디오' }));
    expect(await screen.findByTestId('studio')).toBeInTheDocument();
    const slot = within(screen.getByTestId('studio-tabs'));
    expect(slot.getByRole('button', { name: '연결 끊김 흉내' })).toHaveAttribute('aria-pressed', 'false');
    expect(slot.getByRole('status', { name: '프레임 측정' })).toBeInTheDocument();

    await user.click(slot.getByRole('tab', { name: '기본' }));
    expect(await screen.findByTestId('scene')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: '화질 모드' })).toBeInTheDocument();
  });
});
