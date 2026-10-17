import { useEffect, useState } from 'react';

/**
 * 태블릿·데스크톱 사이드바를 접었는지. 앱 어디서나(3D 홈 포함) 같은 값이라 화면을 옮겨도 메뉴 폭이 바뀌지 않는다.
 * 사용자가 누른 값은 기기에 기억한다(표시 설정일 뿐 비밀이 아니다). 고른 적이 없으면 화면 폭으로 정한다:
 * 태블릿(xl 미만)은 아이콘만, 데스크톱(xl, 1280px 이상)은 펼침. 고르기 전에는 창 크기가 바뀌면 기본값도 따라간다.
 */
export const SIDEBAR_KEY = 'ecocycle.sidebar';
const WIDE_QUERY = '(min-width: 80rem)';

function loadSaved(): boolean | null {
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    return saved === 'collapsed' ? true : saved === 'expanded' ? false : null;
  } catch {
    return null;
  }
}

const wide = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches;

export function useSidebarCollapsed(): [boolean, () => void] {
  const [saved, setSaved] = useState<boolean | null>(loadSaved);
  const [isWide, setWide] = useState(wide);
  useEffect(() => {
    if (saved !== null || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [saved]);
  const collapsed = saved ?? !isWide;
  const toggle = () => {
    const next = !collapsed;
    setSaved(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
    } catch {
      // 저장소를 못 써도 접기는 된다
    }
  };
  return [collapsed, toggle];
}
