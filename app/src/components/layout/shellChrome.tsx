import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';

/**
 * 화면이 틀의 상단 바를 잠시 넘겨받는 약속. 3D 홈처럼 자기 상단 바 하나로 화면 전체를 쓰는 곳이 쓴다.
 * 넘겨받은 화면은 같은 상단 바(TopBar)를 자기 화면 위에 그린다(3D 홈은 overlay 모양으로). 틀이 끼워 넣던 extra(CCTV)도 그 바에 넘긴다.
 * 주 메뉴(Sidebar)는 넘겨받지 않는다: 앱 어디서나 같은 폭의 같은 메뉴 하나를 쓴다(접힘 여부는 기기에 기억한 값 하나).
 */
export interface ShellChrome {
  /** true이면 틀의 상단 바와 끊김 안내, 내용 여백을 두지 않는다 (주 메뉴는 그대로) */
  setImmersive: (on: boolean) => void;
  /** 틀의 상단 바에 끼워 넣던 것(예: CCTV 버튼). 넘겨받은 화면이 대신 보여 준다 */
  extra: ReactNode;
  /** 틀의 상단 바 가운데 칸. 화면이 자기 것(대시보드 홈의 3D | 대시보드 전환)을 포털로 넣는다(useHeaderSlot). 아직 없으면 null */
  headerSlot: HTMLElement | null;
}

export const ShellChromeContext = createContext<ShellChrome | null>(null);

/**
 * 이 컴포넌트가 화면에 있는 동안 틀의 상단 바와 내용 여백을 거둔다.
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

/**
 * 틀의 상단 바 가운데 칸(홈 전환 자리). 틀 안이면 그 칸의 요소, 틀 밖(테스트·미리 보기)이거나 아직 그려지지 않았으면 null.
 * 쓰는 쪽: `slot ? createPortal(node, slot) : node` (틀 밖에서는 제자리에 그린다).
 */
export function useHeaderSlot(): HTMLElement | null {
  return useContext(ShellChromeContext)?.headerSlot ?? null;
}
