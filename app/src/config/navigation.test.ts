import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, resolveNavItems } from './navigation';
import type { NavItem } from './navigation';

describe('navigation', () => {
  it('메뉴 순서는 홈, 탱크, 로봇팔, 컨베이어, 압축기, 알람, 설정이다', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['홈', '탱크', '로봇팔', '컨베이어', '압축기', '알람', '설정']);
  });

  it('권한 요구가 없는 메뉴는 권한이 없어도 모두 열려 있다', () => {
    const items = resolveNavItems([]);
    expect(items).toHaveLength(NAV_ITEMS.length);
    expect(items.every((i) => i.enabled)).toBe(true);
  });

  const guarded: NavItem[] = [
    { id: 'a', label: 'A', path: '/a' },
    { id: 'b', label: 'B', path: '/b', requires: 'settings.write' },
    { id: 'c', label: 'C', path: '/c', requires: 'settings.write', whenDenied: 'disable' },
  ];

  it('권한이 없으면 기본은 숨기고, disable로 정한 메뉴는 보이되 비활성화한다', () => {
    expect(resolveNavItems([], guarded).map((i) => [i.id, i.enabled])).toEqual([
      ['a', true],
      ['c', false],
    ]);
  });

  it('권한이 있으면 모두 열린다', () => {
    expect(resolveNavItems(['settings.write'], guarded).map((i) => [i.id, i.enabled])).toEqual([
      ['a', true],
      ['b', true],
      ['c', true],
    ]);
  });
});
