import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { ROLE_TEXT } from '../../config/display';
import { logoutUser } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectMe } from '../../store/selectors';
import { Button } from '../common/Button';
import { CommandResultToast } from '../controls/CommandResultToast';
import { OfflineNotice } from '../status/OfflineNotice';
import { Sidebar } from './Sidebar';

/**
 * 로그인한 뒤의 공통 틀: 메뉴, 상단 사용자 줄, 연결 끊김 안내, 조작 결과 알림, 화면 내용(Outlet).
 * 연결 끊김 안내는 어느 화면에서나 보이도록 틀에 둔다 (값이 멈춘 화면을 정상처럼 보여 주지 않는다).
 */
export interface AppShellProps {
  /** 상단 줄에 더 둘 것(예: CCTV 버튼). 틀은 화면(features)을 직접 알지 못하므로 위에서 끼워 넣는다. */
  headerExtra?: ReactNode;
  /** 화면 위에 겹쳐 뜨는 것(예: CCTV 화면) */
  overlays?: ReactNode;
}

export function AppShell({ headerExtra, overlays }: AppShellProps = {}) {
  const me = useAppSelector(selectMe);
  const dispatch = useAppDispatch();

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900 md:flex-row">
      <Sidebar className="order-last md:order-first" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <div className="text-lg font-bold tracking-tight">EcoCycle</div>
          {me && (
            <div className="flex items-center gap-3">
              {headerExtra}
              <span className="text-sm text-slate-700">
                {me.name} <span className="text-slate-500">({ROLE_TEXT[me.role]})</span>
              </span>
              <Button variant="quiet" onClick={() => void dispatch(logoutUser())}>
                로그아웃
              </Button>
            </div>
          )}
        </header>
        <OfflineNotice className="mx-4 mt-3" />
        <main className="min-h-0 flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
      <CommandResultToast />
      {overlays}
    </div>
  );
}
