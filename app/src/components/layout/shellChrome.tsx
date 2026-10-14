import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * 화면이 틀(메뉴·상단 바)을 잠시 넘겨받는 약속. 홈의 스튜디오 탭처럼 자기 상단 바 하나로 화면 전체를 쓰는 곳이 쓴다.
 * 넘겨받은 화면은 틀이 하던 일(알람·연결 상태·사용자·로그아웃·메뉴 이동·CCTV)을 자기 상단 바에서 해야 한다.
 */
export interface ShellChrome {
  /** true이면 틀의 메뉴와 상단 바를 그리지 않는다 */
  setImmersive: (on: boolean) => void;
  /** 틀의 상단 바에 끼워 넣던 것(예: CCTV 버튼). 넘겨받은 화면이 대신 보여 준다 */
  extra: ReactNode;
}

export const ShellChromeContext = createContext<ShellChrome | null>(null);

/**
 * 이 컴포넌트가 화면에 있는 동안 틀의 메뉴와 상단 바를 숨긴다.
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
