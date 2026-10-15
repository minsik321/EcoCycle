import { describe, expect, it } from 'vitest';
import { DEVICE_IDS } from '@ecocycle/shared';
import { NAV_ITEMS, devicePagePath, resolveNavItems } from './navigation';
import type { NavItem } from './navigation';

describe('navigation', () => {
  it('메뉴 순서는 홈, 섹터, 로봇팔, 컨베이어, 압축기, 알람, 설정이다', () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(['홈', '섹터', '로봇팔', '컨베이어', '압축기', '알람', '설정']);
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

  it("모든 기기에 상세 페이지 주소가 있고 메뉴 주소 아래에 있다", () => {
    const paths = NAV_ITEMS.map((i) => i.path);
    for (const id of DEVICE_IDS) {
      const p = devicePagePath(id);
      expect(paths.some((base) => base !== "/" && p.startsWith(base))).toBe(true);
    }
    expect(devicePagePath("tank-a2")).toBe("/tanks/tank-a2");
    expect(devicePagePath("robot-1")).toBe("/robot");
  });
});
