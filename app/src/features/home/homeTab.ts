import { useCallback, useState } from 'react';

/** 홈 3D 영역의 탭: basic(기존 장면) 또는 studio(새 고화질 시안) */
export type HomeTab = 'basic' | 'studio';

const KEY = 'ecocycle.homeTab';

export function loadHomeTab(): HomeTab {
  try {
    return localStorage.getItem(KEY) === 'studio' ? 'studio' : 'basic';
  } catch {
    return 'basic';
  }
}

/** 고른 탭을 기기에 기억한다 (표시 설정일 뿐이다). 기본은 "기본" */
export function useHomeTab(): [HomeTab, (tab: HomeTab) => void] {
  const [tab, setTab] = useState<HomeTab>(loadHomeTab);
  const change = useCallback((next: HomeTab) => {
    setTab(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // 저장소를 못 써도 앱은 동작한다
    }
  }, []);
  return [tab, change];
}
