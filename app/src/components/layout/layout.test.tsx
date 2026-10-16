import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../../api';
import { alarmReceived } from '../../store';
import type { NavItem } from '../../config/navigation';
import { ADMIN, OPERATOR, VIEWER, renderWithStore } from '../../test/utils';
import { AppShell } from './AppShell';
import { useImmersiveShell } from './shellChrome';
import { NAV_ACTIVE, Sidebar } from './Sidebar';
import { TopCards } from './TopCards';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  logout: vi.fn(async () => undefined),
}));

const names = () => within(screen.getByRole('navigation', { name: '주 메뉴' })).getAllByRole('link').map((a) => a.textContent);

describe('Sidebar', () => {
  it('명세 순서대로 메뉴를 보여 주고 각각 알맞은 주소로 이어진다', () => {
    renderWithStore(<Sidebar />);
    expect(names()).toEqual(['홈', '섹터', '로봇팔', '컨베이어', '압축기', '알람', '공정 기록', '설정']);
    expect(screen.getByRole('link', { name: '로봇팔' })).toHaveAttribute('href', '/robot');
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/');
  });

  it('지금 보는 화면을 표시한다 (홈은 다른 화면에서 켜지지 않는다)', () => {
    renderWithStore(<Sidebar />, { route: '/tanks/tank-a1' });
    expect(screen.getByRole('link', { name: '섹터' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
  });

  it('홈에서는 홈만 켜진다', () => {
    renderWithStore(<Sidebar />, { route: '/' });
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '섹터' })).not.toHaveAttribute('aria-current');
  });

  const guarded: NavItem[] = [
    { id: 'home', label: '홈', path: '/' },
    { id: 'hidden', label: '숨김메뉴', path: '/h', requires: 'settings.write' },
    { id: 'disabled', label: '비활성메뉴', path: '/d', requires: 'settings.write', whenDenied: 'disable' },
  ];

  it('권한이 없는 메뉴는 숨기거나 비활성화한다 (열람자)', () => {
    renderWithStore(<Sidebar items={guarded} />, { me: VIEWER });
    expect(screen.queryByText('숨김메뉴')).not.toBeInTheDocument();
    const disabled = screen.getByText('비활성메뉴').closest('[aria-disabled]')!;
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled.closest('a')).toBeNull();
    expect(names()).toEqual(['홈']);
  });

  it('권한이 있으면 모두 링크로 열린다 (관리자)', () => {
    renderWithStore(<Sidebar items={guarded} />, { me: ADMIN });
    expect(names()).toEqual(['홈', '숨김메뉴', '비활성메뉴']);
  });

  it('활성 알람 수를 알람 메뉴에 배지로 보여 준다 (확인한 알람은 세지 않는다)', () => {
    const { store } = renderWithStore(<Sidebar />);
    expect(screen.queryByLabelText(/활성 알람/)).not.toBeInTheDocument();

    act(() => {
      store.dispatch(alarmReceived({ id: 'a1', level: 'caution', deviceId: 'tank-a1', message: 'm', state: 'active', ts: '2026-10-13T05:00:00.000Z' }));
      store.dispatch(alarmReceived({ id: 'a2', level: 'alarm', deviceId: 'tank-b2', message: 'm', state: 'active', ts: '2026-10-13T05:01:00.000Z' }));
      store.dispatch(alarmReceived({ id: 'a3', level: 'caution', deviceId: 'tank-a2', message: 'm', state: 'acknowledged', ts: '2026-10-13T05:02:00.000Z' }));
    });
    expect(screen.getByLabelText('활성 알람 2건')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /알람/ })).toHaveTextContent('2');
  });

  it('터치하기 쉽게 메뉴마다 최소 48px 높이를 둔다 (폰 탭은 56px)', () => {
    renderWithStore(<Sidebar />);
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('min-h-14', 'md:min-h-12');
    expect(screen.getByRole('button', { name: '더 보기' })).toHaveClass('min-h-14');
  });

  it('지금 화면의 메뉴는 어디서나 같은 강조(NAV_ACTIVE)로 켜진다: 펼친 메뉴, 접힌 메뉴, 폰의 "더 보기"', async () => {
    const active = NAV_ACTIVE.split(' ');
    const { unmount } = renderWithStore(<Sidebar />, { route: '/robot' });
    expect(screen.getByRole('link', { name: '로봇팔' })).toHaveClass(...active);
    unmount();
    const collapsed = renderWithStore(<Sidebar collapsed onToggle={() => {}} />, { route: '/robot' });
    expect(screen.getByRole('link', { name: '로봇팔' })).toHaveClass(...active);
    collapsed.unmount();
    // 폰: "더 보기" 안의 화면을 보고 있으면 "더 보기" 버튼과 그 안의 줄이 같은 모양으로 켜진다
    renderWithStore(<Sidebar />, { route: '/conveyor' });
    const more = screen.getByRole('button', { name: '더 보기' });
    expect(more).toHaveClass(...active);
    await userEvent.click(more);
    expect(within(screen.getByRole('group', { name: '더 보기 메뉴' })).getByRole('link', { name: '컨베이어' })).toHaveClass(...active);
  });

  it('폰 탭 바에는 자주 쓰는 4개만 두고 나머지는 "더 보기" 안에 있다', async () => {
    renderWithStore(<Sidebar />);
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    const phoneVisible = within(nav)
      .getAllByRole('link')
      .filter((a) => !a.classList.contains('hidden'))
      .map((a) => a.textContent);
    expect(phoneVisible).toEqual(['홈', '섹터', '로봇팔', '알람']);
    expect(screen.queryByRole('group', { name: '더 보기 메뉴' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '더 보기' }));
    const group = screen.getByRole('group', { name: '더 보기 메뉴' });
    expect(within(group).getAllByRole('link').map((a) => a.textContent)).toEqual(['컨베이어', '압축기', '공정 기록', '설정']);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: '더 보기 메뉴' })).not.toBeInTheDocument();
  });

  it('접힌 사이드바는 그림만 보이지만 메뉴 이름은 화면 읽기용으로 남는다', () => {
    renderWithStore(<Sidebar collapsed onToggle={() => {}} />);
    const link = screen.getByRole('link', { name: '압축기' });
    expect(link).toHaveAttribute('title', '압축기');
    expect(within(link).getByText('압축기')).toHaveClass('md:sr-only');
    expect(screen.getByRole('button', { name: '메뉴 펼치기' })).toHaveAttribute('aria-expanded', 'false');
  });
});

function shell(route: string, me = OPERATOR) {
  return renderWithStore(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<div>홈 내용</div>} />
        <Route path="alarms" element={<div>알람 내용</div>} />
      </Route>
    </Routes>,
    { route, me },
  );
}

describe('AppShell', () => {
  it('메뉴와 현재 화면 내용을 함께 보여 준다', () => {
    shell('/alarms');
    expect(screen.getByRole('navigation', { name: '주 메뉴' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('알람 내용');
    expect(screen.queryByText('홈 내용')).not.toBeInTheDocument();
  });

  it('메뉴를 누르면 화면이 바뀐다', async () => {
    shell('/');
    expect(screen.getByRole('main')).toHaveTextContent('홈 내용');
    await userEvent.click(screen.getByRole('link', { name: '알람' }));
    expect(screen.getByRole('main')).toHaveTextContent('알람 내용');
  });

  it('상단 바의 사용자 메뉴에 이름과 권한 이름, 설정(화질), 로그아웃이 있다', async () => {
    shell('/', { ...OPERATOR, name: '김현장' });
    const bar = document.querySelector<HTMLElement>('[data-topbar="page"]')!;
    await userEvent.click(within(bar).getByRole('button', { name: '김현장 (작업자) 메뉴' }));
    const menu = screen.getByRole('menu', { name: '사용자 메뉴' });
    expect(menu).toHaveTextContent('김현장 (작업자)');
    expect(within(menu).getByRole('menuitem', { name: /설정/ })).toHaveAttribute('href', '/settings');
    expect(within(menu).getByRole('menuitem', { name: '로그아웃' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('상단 바 하나: 로고 · 연결과 시계 · 알람 · 사용자. 연결이 끊기면 같은 자리에 "연결 끊김"과 마지막 수신 시각', () => {
    const { store } = shell('/alarms');
    const bar = document.querySelector<HTMLElement>('[data-topbar="page"]')!;
    // 3D 홈과 같은 떠 있는 둥근 판(높이·모서리·그림자), 일반 화면에서는 흰 단색
    expect(bar).toHaveClass('h-14', 'rounded-panel', 'shadow-soft-2', 'bg-surface');
    expect(bar).not.toHaveClass('glass');
    expect(within(bar).getByText('EcoCycle')).toBeInTheDocument();
    expect(within(bar).getByRole('link', { name: /알람 보기/ })).toHaveAttribute('href', '/alarms');
    act(() => {
      store.dispatch({ type: 'connection/connectionChanged', payload: { status: 'online', lastReceivedAt: '2026-10-13T05:23:11.250Z' } });
    });
    expect(within(bar).getByRole('status')).toHaveTextContent('연결됨');
    expect(within(bar).getByLabelText('현재 시각')).toBeInTheDocument();
    act(() => {
      store.dispatch({ type: 'connection/connectionChanged', payload: { status: 'offline', lastReceivedAt: '2026-10-13T05:23:11.250Z' } });
    });
    expect(within(bar).getByRole('status')).toHaveTextContent('연결 끊김');
    expect(within(bar).getByLabelText('마지막 수신 시각')).toHaveAttribute('datetime', '2026-10-13T05:23:11.250Z');
  });

  it('로그아웃 버튼을 누르면 로그아웃된다', async () => {
    const { store } = shell('/');
    await userEvent.click(screen.getByRole('button', { name: /메뉴$/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: '로그아웃' }));
    await vi.waitFor(() => expect(store.getState().auth.status).toBe('loggedOut'));
    expect(api.logout).toHaveBeenCalled();
  });

  it('연결이 끊기면 어느 화면에서나 끊김 안내가 보인다', () => {
    const { store } = shell('/alarms');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => {
      store.dispatch({ type: 'connection/connectionChanged', payload: { status: 'offline', lastReceivedAt: '2026-10-13T05:23:11.250Z' } });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('연결 끊김');
    expect(screen.getByRole('main')).toHaveTextContent('알람 내용'); // 화면은 그대로 두되 끊김을 알린다
  });

  it('좁은 화면에서는 메뉴가 아래로 가도록 순서 클래스를 갖는다', () => {
    shell('/');
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(nav).toHaveClass('order-last', 'md:order-first');
  });
});

/** 틀을 넘겨받는 화면 (홈의 스튜디오 탭처럼): 받은 extra를 자기 자리에 그린다 */
function Immersive() {
  const chrome = useImmersiveShell();
  return <div>몰입 화면 {chrome?.extra}</div>;
}

describe('AppShell: 화면이 틀을 넘겨받는다 (shellChrome)', () => {
  it('넘겨받은 화면이 있는 동안 상단 바·끊김 안내를 숨기고 틀의 extra를 그 화면에 넘긴다. 주 메뉴는 그대로 남는다', async () => {
    const { store } = renderWithStore(
      <Routes>
        <Route element={<AppShell headerExtra={<button type="button">CCTV</button>} />}>
          <Route index element={<Immersive />} />
          <Route path="alarms" element={<div>알람 내용</div>} />
        </Route>
      </Routes>,
      { route: '/', me: OPERATOR },
    );
    const nav = screen.getByRole('navigation', { name: '주 메뉴' });
    expect(within(nav).getByRole('button', { name: '메뉴 펼치기' })).toBeInTheDocument();
    expect(document.querySelector('[data-topbar]')).toBeNull();
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'CCTV' })).toBeInTheDocument();
    // 끊김 안내는 넘겨받은 화면이 스스로 보여 준다 (스튜디오의 "연결 끊김" 알림)
    act(() => {
      store.dispatch({ type: 'connection/connectionChanged', payload: { status: 'offline', lastReceivedAt: '2026-10-13T05:23:11.250Z' } });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('그 화면을 벗어나면 틀의 바가 돌아오고, 사이드바 폭은 바뀌지 않는다', async () => {
    renderWithStore(
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <>
                <Immersive />
                <Link to="/alarms">알람으로</Link>
              </>
            }
          />
          <Route path="alarms" element={<div>알람 내용</div>} />
        </Route>
      </Routes>,
      { route: '/', me: OPERATOR },
    );
    const nav = () => screen.getByRole('navigation', { name: '주 메뉴' });
    const width = nav().className;
    const collapsed = nav().getAttribute('data-collapsed');
    await userEvent.click(screen.getByRole('link', { name: '알람으로' }));
    expect(screen.getByRole('main')).toHaveTextContent('알람 내용');
    expect(nav().className).toBe(width);
    expect(nav().getAttribute('data-collapsed')).toBe(collapsed);
    expect(document.querySelector('[data-topbar="page"]')).not.toBeNull();
  });
});

describe('AppShell: 사이드바 접기 (기기에 기억)', () => {
  const routes = (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          index
          element={
            <>
              <Immersive />
              <Link to="/alarms">알람으로</Link>
            </>
          }
        />
        <Route path="alarms" element={<Link to="/">홈으로</Link>} />
      </Route>
    </Routes>
  );
  const nav = () => screen.getByRole('navigation', { name: '주 메뉴' });

  it('고른 적이 없으면 태블릿(xl 미만)은 아이콘만, 데스크톱(xl 이상)은 펼침', () => {
    const view = renderWithStore(routes, { route: '/alarms', me: OPERATOR });
    expect(nav()).toHaveAttribute('data-collapsed', 'true');
    view.unmount();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('80rem'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      renderWithStore(routes, { route: '/alarms', me: OPERATOR });
      expect(nav()).not.toHaveAttribute('data-collapsed');
      expect(nav()).toHaveClass('md:w-48');
    } finally {
      window.matchMedia = original;
    }
  });

  it('접기·펼치기는 3D 홈을 포함한 모든 화면에 같이 적용되고 다시 열어도 기억한다', async () => {
    const view = renderWithStore(routes, { route: '/', me: OPERATOR });
    await userEvent.click(within(nav()).getByRole('button', { name: '메뉴 펼치기' }));
    expect(nav()).not.toHaveAttribute('data-collapsed');
    expect(nav()).toHaveClass('md:w-48');
    expect(localStorage.getItem('ecocycle.sidebar')).toBe('expanded');
    // 메뉴는 3D 위에 뜨지 않고 자리를 차지한다: 3D를 눌러도 접히지 않는다
    await userEvent.click(screen.getByText('몰입 화면'));
    expect(nav()).not.toHaveAttribute('data-collapsed');
    await userEvent.click(screen.getByRole('link', { name: '알람으로' }));
    expect(nav()).not.toHaveAttribute('data-collapsed');
    // 접기 단추는 어느 화면에서나 같은 자리(메뉴 맨 위)에 같은 모양이다
    const button = within(nav()).getByRole('button', { name: '메뉴 접기' });
    expect(nav().firstElementChild?.firstElementChild).toBe(button);
    await userEvent.click(button);
    expect(localStorage.getItem('ecocycle.sidebar')).toBe('collapsed');
    view.unmount();
    renderWithStore(routes, { route: '/', me: OPERATOR });
    expect(nav()).toHaveAttribute('data-collapsed', 'true');
    expect(nav()).toHaveClass('md:w-[4.5rem]');
  });
});

describe('useImmersiveShell', () => {
  it('틀 밖에서는 아무 일도 하지 않는다', () => {
    renderWithStore(<Immersive />, { me: OPERATOR });
    expect(screen.getByText('몰입 화면')).toBeInTheDocument();
  });
});

describe('TopCards', () => {
  it('카드들을 한 묶음으로 보여 준다', () => {
    renderWithStore(
      <TopCards>
        <div>함수율</div>
        <div>적재율</div>
        <div>시스템</div>
      </TopCards>,
    );
    const group = screen.getByRole('group', { name: '요약' });
    expect(within(group).getAllByText(/함수율|적재율|시스템/)).toHaveLength(3);
  });
});
