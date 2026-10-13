import type { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { isFullBleedPath } from '../../config/navigation';
import { CommandResultToast } from '../controls/CommandResultToast';
import { OfflineNotice } from '../status/OfflineNotice';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * 로그인한 뒤의 공통 틀: 메뉴, 상단 바, 연결 끊김 안내, 조작 결과 알림, 화면 내용(Outlet).
 * 연결 끊김 안내는 어느 화면에서나 보이도록 틀에 둔다 (값이 멈춘 화면을 정상처럼 보여 주지 않는다).
 * 홈처럼 화면을 가득 쓰는 곳(config/navigation.ts의 fullBleed)은 안쪽 여백 없이 내용을 깔고, 안내는 그 위에 띄운다.
 */
export interface AppShellProps {
  /** 상단 바 가운데에 둘 것(예: 홈의 검색·지역 전환) */
  headerCenter?: ReactNode;
  /** 상단 바에 더 둘 것(예: CCTV 버튼). 틀은 화면(features)을 직접 알지 못하므로 위에서 끼워 넣는다. */
  headerExtra?: ReactNode;
  /** 화면 위에 겹쳐 뜨는 것(예: CCTV 화면) */
  overlays?: ReactNode;
}

export function AppShell({ headerCenter, headerExtra, overlays }: AppShellProps = {}) {
  const bleed = isFullBleedPath(useLocation().pathname);

  return (
    <div className="flex h-full flex-col bg-paper text-ink md:flex-row">
      <Sidebar className="order-last md:order-first" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar center={headerCenter} extra={headerExtra} />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <OfflineNotice className={bleed ? 'absolute inset-x-4 top-3 z-20' : 'mx-4 mt-3'} />
          <main className={`min-h-0 flex-1 ${bleed ? 'overflow-hidden' : 'overflow-auto p-4'}`}>
            <Outlet />
          </main>
        </div>
      </div>
      <CommandResultToast />
      {overlays}
    </div>
  );
}
