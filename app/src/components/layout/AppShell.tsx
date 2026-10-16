import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { isFullBleedPath } from '../../config/navigation';
import { CommandResultToast } from '../controls/CommandResultToast';
import { OfflineNotice } from '../status/OfflineNotice';
import { Sidebar } from './Sidebar';
import { ShellChromeContext } from './shellChrome';
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

export function AppShell({ headerCenter, headerExtra, overlays }: AppShellProps = {}) {
  const { pathname } = useLocation();
  const bleed = isFullBleedPath(pathname);
  // 3D 홈처럼 자기 상단 바 하나로 화면 전체를 쓰는 화면이 있으면 상단 바·끊김 안내를 그 화면에 맡긴다 (shellChrome.tsx). 주 메뉴는 남는다
  const [immersive, setImmersive] = useState(false);
  // 상단 바 가운데 칸: 화면이 포털로 자기 것(홈 전환)을 넣는다 (useHeaderSlot)
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const chrome = useMemo<ShellChrome>(() => ({ setImmersive, extra: headerExtra, headerSlot }), [headerExtra, headerSlot]);
  // 태블릿·데스크톱 사이드바: 3D 홈에서는 아이콘만(3D 자리를 지킨다), 누르면 3D 위로 펼친다. 다른 화면에서는 펼친 것이 기본
  const [expandedOver3d, setExpandedOver3d] = useState(false);
  const [collapsedElsewhere, setCollapsedElsewhere] = useState(false);
  const collapsed = immersive ? !expandedOver3d : collapsedElsewhere;
  useEffect(() => setExpandedOver3d(false), [pathname, immersive]);

  return (
    <div className="flex h-full flex-col bg-paper text-ink md:flex-row">
      <Sidebar
        className="order-last md:order-first"
        collapsed={collapsed}
        overlay={immersive}
        onToggle={() => (immersive ? setExpandedOver3d(!expandedOver3d) : setCollapsedElsewhere(!collapsedElsewhere))}
      />
      {/* isolate: 3D 홈 패널의 z-index가 이 안에서만 겨루게 해 3D 위로 펼친 메뉴가 늘 위에 온다 */}
      <div className="isolate flex min-h-0 min-w-0 flex-1 flex-col">
        {!immersive && (
          <TopBar
            center={
              <>
                <div ref={setHeaderSlot} className="flex min-w-0 items-center gap-2 empty:hidden" />
                {headerCenter}
              </>
            }
            extra={headerExtra}
          />
        )}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {!immersive && <OfflineNotice className={bleed ? 'absolute inset-x-4 top-3 z-20' : 'mx-4 mt-3'} />}
          {/* 틀을 넘겨받은 화면은 스스로 가득 채운다(홈은 안쪽 여백을 음수 여백으로 지운다). 스크롤만 막는다 */}
          <main className={`min-h-0 flex-1 ${bleed ? 'overflow-hidden' : immersive ? 'overflow-hidden p-4' : 'overflow-auto p-4'}`}>
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
