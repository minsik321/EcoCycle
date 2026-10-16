import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { isFullBleedPath } from '../../config/navigation';
import { CommandResultToast } from '../controls/CommandResultToast';
import { OfflineNotice } from '../status/OfflineNotice';
import { Sidebar } from './Sidebar';
import { ShellChromeContext } from './shellChrome';
import { useSidebarCollapsed } from './sidebarPref';
import type { ShellChrome } from './shellChrome';
import { TopBar } from './TopBar';

/**
 * 로그인한 뒤의 공통 틀: 주 메뉴, 상단 바, 연결 끊김 안내, 조작 결과 알림, 화면 내용(Outlet).
 * 주 메뉴는 어느 화면에서나 같은 하나다(폰 아래 탭 바, 태블릿·데스크톱 왼쪽 사이드바, Sidebar.tsx).
 * 연결 끊김 안내는 어느 화면에서나 보이도록 틀에 둔다 (값이 멈춘 화면을 정상처럼 보여 주지 않는다).
 * 홈처럼 화면을 가득 쓰는 곳(config/navigation.ts의 fullBleed)은 안쪽 여백 없이 내용을 깔고, 안내는 그 위에 띄운다.
 */
export interface AppShellProps {
  /** 상단 바 가운데에 둘 것. 화면이 넣는 것(홈 전환)은 useHeaderSlot으로 */
  headerCenter?: ReactNode;
  /** 상단 바에 더 둘 것(예: CCTV 버튼). 틀은 화면(features)을 직접 알지 못하므로 위에서 끼워 넣는다. */
  headerExtra?: ReactNode;
  /** 화면 위에 겹쳐 뜨는 것(예: CCTV 화면) */
  overlays?: ReactNode;
}

/**
 * 화면 가장자리와 떠 있는 상단 바 사이, 바와 내용 사이의 간격. 3D 홈의 --st-gap(폰 8px, 그 밖 10px)과 같다.
 * 폰 기기 페이지의 아래 조작 줄(components/device/DevicePage)이 좌우 여백을 이 값만큼 되돌린다. 틀 밖 미리 보기(/design)도 같은 값을 쓴다.
 */
export const SHELL_GAP_X = 'px-2 sm:px-2.5';
export const SHELL_GAP_TOP = 'pt-2 sm:pt-2.5';

export function AppShell({ headerCenter, headerExtra, overlays }: AppShellProps = {}) {
  const { pathname } = useLocation();
  const bleed = isFullBleedPath(pathname);
  // 3D 홈처럼 자기 상단 바 하나로 화면 전체를 쓰는 화면이 있으면 상단 바·끊김 안내를 그 화면에 맡긴다 (shellChrome.tsx). 주 메뉴는 남는다
  const [immersive, setImmersive] = useState(false);
  // 상단 바 가운데 칸: 화면이 포털로 자기 것(홈 전환)을 넣는다 (useHeaderSlot)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const chrome = useMemo<ShellChrome>(() => ({ setImmersive, extra: headerExtra, headerSlot }), [headerExtra, headerSlot]);
  // 태블릿·데스크톱 사이드바: 어느 화면에서나(3D 홈 포함) 같은 폭. 접기·펼치기는 기기에 기억한다 (sidebarPref.ts)
  const [collapsed, toggleSidebar] = useSidebarCollapsed();

  return (
    <div className="flex h-full flex-col bg-paper text-ink md:flex-row">
      <Sidebar className="order-last md:order-first" collapsed={collapsed} onToggle={toggleSidebar} />
      {/* isolate: 3D 홈 패널의 z-index가 이 안에서만 겨루게 해 3D 위로 펼친 메뉴가 늘 위에 온다 */}
      <div className="isolate flex min-h-0 min-w-0 flex-1 flex-col">
        {/* 떠 있는 상단 바: 화면 가장자리에서 SHELL_GAP만큼 떨어진 둥근 판. 3D 홈의 바(studio.css st-topbar)와 같은 자리·모양이다 */}
        {!immersive && (
          <div className={`${SHELL_GAP_X} ${SHELL_GAP_TOP}`}>
            <TopBar
              center={
                <>
                  <div ref={setHeaderSlot} className="flex min-w-0 items-center gap-2 empty:hidden" />
                  {headerCenter}
                </>
              }
              extra={headerExtra}
            />
          </div>
        )}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {!immersive && <OfflineNotice className={bleed ? 'absolute inset-x-2 top-2 z-20 sm:inset-x-2.5 sm:top-2.5' : `${SHELL_GAP_X} ${SHELL_GAP_TOP}`} />}
          {/* 내용은 바 아래 같은 간격(3D 홈 패널과 같다)에서 시작하고, 좌우 끝을 바와 맞춘다.
              틀을 넘겨받은 화면(3D 홈)은 여백 없이 스스로 가득 채운다. 스크롤만 막는다 */}
          <main className={`min-h-0 flex-1 ${bleed || immersive ? 'overflow-hidden' : `overflow-auto pb-4 ${SHELL_GAP_X} ${SHELL_GAP_TOP}`}`}>
            <ShellChromeContext.Provider value={chrome}>
              <Outlet />
            </ShellChromeContext.Provider>
          </main>
        </div>
      </div>
      <CommandResultToast />
      {overlays}
    </div>
  );
}
