import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * 화면이 틀의 상단 바를 잠시 넘겨받는 약속. 3D 홈처럼 자기 상단 바 하나로 화면 전체를 쓰는 곳이 쓴다.
 * 넘겨받은 화면은 틀의 상단 바가 하던 일(알람·연결 상태·시계·사용자·로그아웃·CCTV)을 자기 상단 바에서 해야 한다.
 * 주 메뉴(Sidebar)는 넘겨받지 않는다: 앱 어디서나 같은 메뉴 하나를 쓴다(태블릿·데스크톱에서는 아이콘만 남게 접힌다).
 */
export interface ShellChrome {
  /** true이면 틀의 상단 바와 끊김 안내를 그리지 않고, 주 메뉴는 접어 둔다 */
  setImmersive: (on: boolean) => void;
  /** 틀의 상단 바에 끼워 넣던 것(예: CCTV 버튼). 넘겨받은 화면이 대신 보여 준다 */
  extra: ReactNode;
}

export const ShellChromeContext = createContext<ShellChrome | null>(null);

/**
 * 이 컴포넌트가 화면에 있는 동안 틀의 상단 바를 숨기고 주 메뉴를 접는다.
 * 틀 밖(시연 화면 등)에서는 아무 일도 하지 않고 null을 돌려준다. 틀 안이면 상단 바에 대신 둘 것(extra)을 돌려준다.
 */
export function useImmersiveShell(): ShellChrome | null {
  const chrome = useContext(ShellChromeContext);
  const setImmersive = chrome?.setImmersive;
  useEffect(() => {
    if (!setImmersive) return;
    setImmersive(true);
    return () => setImmersive(false);
  }, [setImmersive]);
  return chrome;
}
